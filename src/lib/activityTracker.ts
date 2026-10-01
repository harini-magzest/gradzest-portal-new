import { api } from '../api';
import { parseRouteFiles, findRouteFile, type RouteFile } from './routeFiles';

// Records what staff do in the dashboard: which page (and source file), which
// button/link was clicked, which files were picked or downloaded, which forms
// were submitted. Metadata only — it never reads what is typed into a field
// (text/password inputs are not even click-tracked), and it sends file names and
// sizes, never contents. Anything inside [data-no-track] is ignored entirely.
// The server decides whether a given role is tracked and tells us to stop if not.

type Kind = 'page_view' | 'click' | 'file_select' | 'download' | 'form_submit';

interface QueuedEvent {
  kind: Kind;
  page: string;
  clientTime: string;
  element?: { tag: string; type?: string; label?: string; id?: string; testId?: string; href?: string };
  context?: string;
  files?: { name: string; size: number; type: string }[];
  // Filled in at flush time from the route table.
  file?: string;
  routePattern?: string;
}

const FLUSH_MS = 4000;
const MAX_QUEUE = 200;
const BATCH = 50;
const INTERACTIVE = [
  'button', 'a[href]', '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="switch"]', '[role="option"]',
  'summary', 'select', 'input[type="button"]', 'input[type="submit"]', 'input[type="checkbox"]', 'input[type="radio"]', 'input[type="file"]',
].join(',');
const DOWNLOAD_EXT = /\.(pdf|docx?|xlsx?|csv|zip|pptx?|png|jpe?g|txt)$/i;

// Labels are sent in a conservative character set (no markup, shell or SQL punctuation) so
// stored text is inert if it is ever rendered or exported somewhere unexpected. Long digit
// runs (phone / passport numbers) are masked. (The activity endpoint is also exempt from the
// server's WAF body scan, so odd-looking button text can't get a user's IP penalised.)
export function sanitizeLabel(text: string | null | undefined, max = 80): string {
  return (text || '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} .,:_\-/@#'+%()?!]/gu, ' ')
    .replace(/\d{6,}/g, '••••')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeHref(href: string | null): string {
  if (!href) return '';
  if (/^\s*(javascript|data|vbscript):/i.test(href)) return '[script-url]';
  let h = href.split('#')[0].split('?')[0];
  try { const u = new URL(h, window.location.origin); h = u.origin === window.location.origin ? u.pathname : u.origin + u.pathname; } catch { /* keep as-is */ }
  return h.replace(/[^A-Za-z0-9/_\-.~%:@]/g, '').slice(0, 300);
}

function contextOf(el: Element): string {
  const holder = el.closest('[data-track-context],[role="dialog"],[aria-modal="true"],dialog');
  if (!holder) return '';
  const explicit = holder.getAttribute('data-track-context') || holder.getAttribute('aria-label');
  if (explicit) return sanitizeLabel(explicit, 80);
  const heading = holder.querySelector('h1,h2,h3');
  return heading ? 'dialog: ' + sanitizeLabel(heading.textContent, 70) : 'dialog';
}

function labelOf(el: Element): string {
  const direct = el.getAttribute('aria-label') || el.getAttribute('title');
  if (direct) return sanitizeLabel(direct);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
    const lab = (el as HTMLInputElement).labels?.[0]?.textContent;
    return sanitizeLabel(lab || el.name || el.id);
  }
  return sanitizeLabel(el.textContent);
}

// ── state ───────────────────────────────────────────────────────────────────
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let disabled = false;
let sessionKey = '';
let routesReady: Promise<RouteFile[]> | null = null;

function loadRoutes(): Promise<RouteFile[]> {
  // App.tsx is read as raw text (code-split, loaded once) to learn which file renders each route.
  routesReady ||= import('../App.tsx?raw').then(m => parseRouteFiles(m.default as string)).catch(() => []);
  return routesReady;
}

function enqueue(e: QueuedEvent) {
  if (disabled) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(e);
}

async function flush() {
  if (disabled || queue.length === 0) return;
  const batch = queue.splice(0, BATCH);
  const routes = await loadRoutes();
  const events = batch.map(e => {
    const route = findRouteFile(routes, e.page);
    return { ...e, file: route?.file || '', routePattern: route?.pattern || '' };
  });
  try {
    const res = await api.uiTrail.send(sessionKey, events);
    if (res.tracking === false) { disabled = true; queue = []; }
  } catch {
    // Network blip: keep the events for the next tick (bounded), but don't loop on hard failures.
    if (queue.length + batch.length <= MAX_QUEUE) queue.unshift(...batch);
  }
}

// ── event capture ───────────────────────────────────────────────────────────
function onClick(ev: MouseEvent) {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  const el = target.closest(INTERACTIVE);
  if (!el || el.closest('[data-no-track]')) return;
  if (el instanceof HTMLInputElement && el.type === 'file') return; // the picker's change event records the chosen files

  const tag = el.tagName.toLowerCase();
  const rawHref = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
  const href = sanitizeHref(rawHref);
  const downloadName = el instanceof HTMLAnchorElement
    ? (el.getAttribute('download') || (DOWNLOAD_EXT.test(href) ? href.split('/').pop() : '')) : '';

  enqueue({
    kind: downloadName ? 'download' : 'click',
    page: window.location.pathname,
    clientTime: new Date().toISOString(),
    element: {
      tag, type: el.getAttribute('type') || undefined,
      label: downloadName ? sanitizeLabel(downloadName, 120) : labelOf(el),
      id: sanitizeLabel(el.id, 80) || undefined,
      testId: sanitizeLabel(el.getAttribute('data-testid'), 80) || undefined,
      href: href || undefined,
    },
    context: contextOf(el) || undefined,
  });
}

function onChange(ev: Event) {
  const el = ev.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'file' || el.closest('[data-no-track]')) return;
  const files = Array.from(el.files || []).slice(0, 20).map(f => ({ name: sanitizeLabel(f.name, 200), size: f.size, type: sanitizeLabel(f.type, 80) }));
  if (!files.length) return;
  enqueue({
    kind: 'file_select', page: window.location.pathname, clientTime: new Date().toISOString(),
    element: { tag: 'input', type: 'file', label: labelOf(el), id: sanitizeLabel(el.id, 80) || undefined },
    context: contextOf(el) || undefined, files,
  });
}

function onSubmit(ev: Event) {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement) || form.closest('[data-no-track]')) return;
  enqueue({
    kind: 'form_submit', page: window.location.pathname, clientTime: new Date().toISOString(),
    element: { tag: 'form', label: sanitizeLabel(form.getAttribute('aria-label') || form.name), id: sanitizeLabel(form.id, 80) || undefined },
    context: contextOf(form) || undefined,
  });
}

function onVisibility() { if (document.visibilityState === 'hidden') void flush(); }

export function trackPageView(pathname: string) {
  enqueue({ kind: 'page_view', page: pathname, clientTime: new Date().toISOString(), element: { tag: 'page', label: sanitizeLabel(document.title, 100) } });
}

export function startActivityTracker(): () => void {
  disabled = false;
  queue = [];
  sessionKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
  void loadRoutes();
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onVisibility);
  timer = setInterval(() => { void flush(); }, FLUSH_MS);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onVisibility);
    if (timer) clearInterval(timer);
    timer = null;
    void flush();
  };
}
