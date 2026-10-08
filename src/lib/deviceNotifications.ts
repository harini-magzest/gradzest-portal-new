// Device-level notifications: the browser/OS pop-up (Notification API) and the alert sound.
//
// Permission is only ever requested from a click (NotificationPermissionPrompt / the bell's "Turn on"
// button): Firefox and Safari ignore a request that isn't triggered by the user, and Chrome shows a
// quieter prompt for it. The sound uses one shared AudioContext that is unlocked on the first click or
// key press, because browsers keep audio muted until the person has interacted with the page.

export type DevicePermission = 'unsupported' | 'default' | 'granted' | 'denied';

export const devicePermission = (): DevicePermission =>
  typeof window === 'undefined' || !('Notification' in window) ? 'unsupported' : Notification.permission;

/** Ask the device for permission. Call this from a click handler. */
export async function requestDevicePermission(): Promise<DevicePermission> {
  if (devicePermission() === 'unsupported') return 'unsupported';
  try { return await Notification.requestPermission(); }
  catch { return devicePermission(); }
}

// ── Sound ────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtx;
  } catch { return null; }
}

// Unlock audio on the first interaction so later notifications can play even while the tab is in the background
if (typeof window !== 'undefined') {
  const unlock = () => {
    const ctx = getAudio();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** A short two-note chime; urgent notifications get a brighter three-note one. */
export function playNotificationSound(urgent = false) {
  const ctx = getAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const notes = urgent ? [880, 660, 988] : [660, 880];
  const step = 0.13;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + i * step;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(urgent ? 0.18 : 0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + step + 0.12);
    osc.start(t);
    osc.stop(t + step + 0.15);
  });
}

// ── Pop-up ───────────────────────────────────────────────────────────────────
// Clicking a device notification asks the app to open its link. NotificationNavigator (inside the
// router) listens for this, because the notification provider sits outside the router.
export const NAVIGATE_EVENT = 'gradzest:notification-navigate';

/**
 * Show the OS pop-up — only when the app isn't the window the person is looking at; when it is,
 * the in-app toast already shows the same thing.
 */
export function showDeviceNotification(n: { id: string; title: string; message: string; link?: string; urgent?: boolean }) {
  if (devicePermission() !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  try {
    const popup = new Notification(n.title, {
      body: n.message,
      icon: '/logo.svg',
      tag: n.id, // the same notification arriving in two tabs replaces itself instead of stacking
      requireInteraction: !!n.urgent, // urgent ones stay until the person deals with them
    });
    popup.onclick = () => {
      window.focus();
      if (n.link) window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: n.link }));
      popup.close();
    };
  } catch { /* some mobile browsers only allow notifications from a service worker */ }
}

// ── One tab per notification ─────────────────────────────────────────────────
// Live events reach every open tab. Only the first tab to claim a notification plays the sound,
// shows the pop-up and saves it, so two open tabs don't mean two chimes and two saved copies.
export function claimNotification(key: string): boolean {
  try {
    const k = `notif_claim_${key}`;
    const prev = Number(localStorage.getItem(k) || 0);
    if (Date.now() - prev < 15000) return false;
    localStorage.setItem(k, String(Date.now()));
    // Housekeeping: drop claim markers older than a minute
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key2 = localStorage.key(i);
      if (key2?.startsWith('notif_claim_') && Date.now() - Number(localStorage.getItem(key2)) > 60000) localStorage.removeItem(key2);
    }
    return true;
  } catch { return true; }
}
