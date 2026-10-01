import { matchPath } from 'react-router-dom';

// Maps a URL path to the source file of the page that renders it, by reading the
// <Route> table and the lazy imports straight out of App.tsx. Derived from the real
// routing code, so it can't drift out of date the way a hand-kept map would.

export interface RouteFile { pattern: string; file: string; component: string }

export function parseRouteFiles(source: string): RouteFile[] {
  const lazyFiles = new Map<string, string>();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*'([^']+)'\s*\)/g)) {
    lazyFiles.set(m[1], 'src/' + m[2].replace(/^\.\//, '') + '.tsx');
  }

  const start = source.indexOf('<Routes>');
  const end = source.indexOf('</Routes>');
  if (start < 0 || end < 0) return [];

  const stack: string[] = [];
  const out: RouteFile[] = [];
  const join = (parent: string, child: string) =>
    child.startsWith('/') ? child : (parent === '/' ? '' : parent) + '/' + child;

  for (const raw of source.slice(start, end).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('</Route>')) { stack.pop(); continue; }
    if (!line.startsWith('<Route')) continue;

    const parent = stack.length ? stack[stack.length - 1] : '/';
    const pathAttr = line.match(/\spath="([^"]*)"/)?.[1];
    const abs = pathAttr === undefined ? parent : join(parent, pathAttr);
    const component = line.match(/element=\{<(\w+)/)?.[1];
    const isLeaf = line.endsWith('/>');
    // Only leaf routes are pages. Wrapper routes (layouts) have children and render them in an
    // <Outlet>, so mapping a URL to the layout would hide the page the user is actually on.
    if (isLeaf && component && lazyFiles.has(component) && pathAttr !== '*') {
      out.push({ pattern: abs.length > 1 ? abs.replace(/\/$/, '') : abs, file: lazyFiles.get(component)!, component });
    }
    if (!isLeaf) stack.push(abs);
  }
  // Most specific (longest) patterns first, so /admin/students/* wins over a shorter prefix.
  return out.sort((a, b) => b.pattern.length - a.pattern.length);
}

export function findRouteFile(routes: RouteFile[], pathname: string): RouteFile | null {
  for (const r of routes) {
    if (matchPath({ path: r.pattern, end: true }, pathname)) return r;
  }
  return null;
}
