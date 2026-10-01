// What a browser can honestly tell us about the device it runs on. A website cannot read a computer's hostname or a
// phone's marketing name; this collects the most specific things it CAN: the exact OS (Windows 11 vs 10), CPU
// architecture and — on Chrome/Edge for Android — the phone model, plus screen size, language and timezone.
// These are reported by the browser and can be falsified by its owner, so the server treats them as display
// information for an analyst, never as proof of identity.

export interface DeviceHints {
  platform?: string; platformVersion?: string; architecture?: string; bitness?: string; model?: string; mobile?: boolean;
  screen?: string; language?: string; timezone?: string; cores?: number; memoryGb?: number;
}

let cached: Promise<DeviceHints> | null = null;

async function gather(): Promise<DeviceHints> {
  const nav = navigator as any;
  const hints: DeviceHints = {};
  try {
    hints.screen = `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio || 1}`;
    hints.language = navigator.language;
    hints.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof navigator.hardwareConcurrency === 'number') hints.cores = navigator.hardwareConcurrency;
    if (typeof nav.deviceMemory === 'number') hints.memoryGb = nav.deviceMemory;
  } catch { /* some privacy modes block these */ }
  try {
    const uad = nav.userAgentData;
    if (uad) {
      hints.mobile = !!uad.mobile;
      hints.platform = uad.platform;
      const high = await uad.getHighEntropyValues?.(['platformVersion', 'architecture', 'bitness', 'model']);
      if (high) {
        hints.platformVersion = high.platformVersion; hints.architecture = high.architecture;
        hints.bitness = high.bitness; hints.model = high.model;
      }
    }
  } catch { /* Client Hints unavailable or blocked: the User-Agent still gives browser and OS */ }
  return hints;
}

// Collected once per page load; never throws, never waits more than 400 ms (a sign-in must not be delayed by this).
export function getDeviceHints(): Promise<DeviceHints> {
  cached ||= Promise.race([gather(), new Promise<DeviceHints>(resolve => setTimeout(() => resolve({}), 400))]).catch(() => ({}));
  return cached;
}
