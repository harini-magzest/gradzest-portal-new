import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SEEN_KEY = 'gz_namaste_seen';
const DURATION_MS = 5000;
const DASHBOARDS = ['student', 'counselor', 'admin', 'soc', 'appteam', 'board'];
// The site's heading colour, so the greeting matches the rest of the page.
const GREETING_COLOUR = '#0d1b4b';

// The public site and each dashboard get their own intro, so entering a dashboard after the
// homepage in the same session still plays it once.
function areaOf(pathname: string): string {
  const first = pathname.split('/')[1] || '';
  return DASHBOARDS.includes(first) ? first : 'public';
}

function shouldPlay(area: string): boolean {
  try {
    if (sessionStorage.getItem(`${SEEN_KEY}:${area}`)) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// One hand of the joined-palms pose, drawn on the left of x=100 and clipped there so the
// mirrored right hand meets it exactly on the centre line.
const SKIN = '#E8B48A';
const LINE = '#8A5A3B';
const FINGERS: { x: number; top: number }[] = [
  { x: 60, top: 40 },
  { x: 71, top: 26 },
  { x: 82, top: 18 },
  { x: 91, top: 14 },
];

function Hand() {
  return (
    <g clipPath="url(#gz-namaste-half)" fill={SKIN} stroke={LINE} strokeWidth="1.4" strokeLinejoin="round">
      <path d="M58 76 L100 76 L100 146 L68 146 C60 134 56 108 58 76 Z" />
      {FINGERS.map(f => (
        <rect key={f.x} x={f.x} y={f.top} width="10" height={150 - f.top} rx="5" />
      ))}
    </g>
  );
}

const PARTICLES = [
  { left: '18%', top: '30%', delay: 1.8, size: 10 },
  { left: '82%', top: '28%', delay: 2.0, size: 9 },
  { left: '26%', top: '62%', delay: 2.2, size: 8 },
  { left: '74%', top: '64%', delay: 2.4, size: 11 },
  { left: '34%', top: '20%', delay: 2.6, size: 7 },
  { left: '66%', top: '18%', delay: 2.8, size: 9 },
  { left: '12%', top: '50%', delay: 3.0, size: 6 },
  { left: '88%', top: '48%', delay: 3.2, size: 6 },
];

// Timeline: hands arrive 0–2.6s, greeting fades in 1.8–2.8s, glow pulses 3.0–3.9s,
// the whole overlay fades 4.0–5.0s.
const CSS = `
.gz-namaste { font-family: Georgia, 'Times New Roman', serif; }
.gz-namaste-bg {
  background: radial-gradient(ellipse at 50% 45%, #fff8ec 0%, #fbe6c2 48%, #eab976 100%);
}
@keyframes gz-namaste-fade-out {
  0%, 80% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes gz-hand-left {
  0% { transform: translateX(-120vw) rotate(-10deg); }
  100% { transform: translateX(0) rotate(0deg); }
}
@keyframes gz-hand-right {
  0% { transform: translateX(120vw) rotate(10deg); }
  100% { transform: translateX(0) rotate(0deg); }
}
@keyframes gz-text-in {
  0% { opacity: 0; transform: translateY(14px) scale(0.96); letter-spacing: 0.3em; }
  100% { opacity: 1; transform: translateY(0) scale(1); letter-spacing: 0.04em; }
}
@keyframes gz-glow-pulse {
  0% { text-shadow: 0 0 0 rgba(13, 27, 75, 0); }
  50% { text-shadow: 0 0 22px rgba(13, 27, 75, 0.35); }
  100% { text-shadow: 0 0 8px rgba(13, 27, 75, 0.15); }
}
@keyframes gz-lantern {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.08); }
}
@keyframes gz-particle {
  0% { opacity: 0; transform: translate(0, 0) scale(0.4); }
  40% { opacity: 1; }
  100% { opacity: 0; transform: translate(0, -40px) scale(1); }
}
.gz-hand-left { animation: gz-hand-left 2.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.gz-hand-right { animation: gz-hand-right 2.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.gz-greeting {
  animation: gz-text-in 1s ease-out 1.8s both, gz-glow-pulse 0.9s ease-in-out 3.0s both;
  color: ${GREETING_COLOUR};
  font-weight: 700;
}
.gz-lantern { animation: gz-lantern 3s ease-in-out infinite; }
.gz-particle { animation: gz-particle 2.2s ease-out both; box-shadow: 0 0 10px 3px rgba(245, 190, 80, 0.85); }
`;

export default function NamasteIntro() {
  const { pathname } = useLocation();
  const area = areaOf(pathname);
  const [show, setShow] = useState(() => shouldPlay(area));

  useEffect(() => {
    if (shouldPlay(area)) setShow(true);
  }, [area]);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(`${SEEN_KEY}:${area}`, '1'); } catch { /* storage unavailable: replays next load */ }
    const t = setTimeout(() => setShow(false), DURATION_MS);
    return () => clearTimeout(t);
  }, [show, area]);

  if (!show) return null;

  return (
    <div
      role="presentation"
      onClick={() => setShow(false)}
      className="gz-namaste gz-namaste-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden cursor-pointer"
      style={{ animation: `gz-namaste-fade-out ${DURATION_MS}ms ease-in both`, height: '100dvh' }}
    >
      <style>{CSS}</style>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); setShow(false); }}
        className="absolute top-4 right-4 z-10 rounded-full border border-amber-700/40 bg-white/60 px-4 py-1.5 text-sm font-medium text-amber-900 backdrop-blur-sm hover:bg-white/90"
      >
        Skip intro
      </button>

      <div className="gz-lantern absolute -left-16 top-10 h-48 w-48 rounded-full bg-orange-300/40 blur-3xl sm:h-64 sm:w-64" aria-hidden="true" />
      <div className="gz-lantern absolute -right-16 bottom-10 h-48 w-48 rounded-full bg-amber-300/40 blur-3xl sm:h-64 sm:w-64" aria-hidden="true" style={{ animationDelay: '1.5s' }} />

      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMax meet" className="absolute bottom-0 h-[70dvh] w-[min(80vw,400px)] opacity-40" aria-hidden="true">
        <path d="M60 390 L60 170 Q60 40 200 40 Q340 40 340 170 L340 390" fill="none" stroke="#B8862B" strokeWidth="2.5" />
        <path d="M80 390 L80 175 Q80 60 200 60 Q320 60 320 175 L320 390" fill="none" stroke="#D4A03C" strokeWidth="1" />
      </svg>

      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 200 150" className="w-[min(55vw,240px)] h-auto overflow-visible drop-shadow-[0_8px_12px_rgba(120,70,20,0.28)]" aria-hidden="true">
          <defs>
            <clipPath id="gz-namaste-half">
              <rect x="0" y="0" width="100" height="150" />
            </clipPath>
          </defs>
          <g className="gz-hand-left"><Hand /></g>
          <g className="gz-hand-right">
            <g transform="translate(200 0) scale(-1 1)"><Hand /></g>
          </g>
        </svg>

        <p className="gz-greeting mt-4 text-3xl sm:text-5xl">Namaste</p>

        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="gz-particle absolute rounded-full bg-amber-500"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: `${p.delay}s` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
