// Instagram-style call ringtone: clean ascending sine-wave arpeggio
// C5 → E5 → G5 → C6, repeating with a pause between cycles

// [frequency_hz, duration_s], 0 = silence
const PATTERN: [number, number][] = [
  [523.25, 0.11],  // C5
  [0,      0.04],
  [659.25, 0.11],  // E5
  [0,      0.04],
  [783.99, 0.11],  // G5
  [0,      0.04],
  [1046.50, 0.32], // C6
  [0,       1.35], // pause before repeat
];

const CYCLE = PATTERN.reduce((s, [, d]) => s + d, 0);

export function createCallRingtone() {
  let actx: AudioContext | null = null;
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let alive = false;

  function scheduleCycle() {
    if (!actx || !alive) return;

    let t = actx.currentTime + 0.04;

    for (const [freq, dur] of PATTERN) {
      if (freq === 0) { t += dur; continue; }

      const osc  = actx.createOscillator();
      const gain = actx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      // smooth attack → sustain → decay
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.012);
      gain.gain.setValueAtTime(0.28, t + dur - 0.04);
      gain.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(gain);
      gain.connect(actx.destination);

      osc.start(t);
      osc.stop(t + dur);

      t += dur;
    }

    loopTimer = setTimeout(scheduleCycle, CYCLE * 1000);
  }

  return {
    start() {
      if (alive) return;
      alive = true;
      try {
        actx = new AudioContext();
        actx.resume().then(() => scheduleCycle()).catch(() => {});
      } catch {
        alive = false;
      }
    },
    stop() {
      alive = false;
      if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
      if (actx) { actx.close(); actx = null; }
    },
  };
}
