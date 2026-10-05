import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SEEN_KEY = 'gz_namaste_seen';
const DURATION_MS = 5000;
// Optional golden-hour photo of joined hands (see the prompt in docs/namaste-photo-prompt.md). When the file is
// missing or fails to load, the drawn hands below play instead, so the intro never shows a broken image.
const PHOTO_SRC = '/namaste-hands.jpg';
const DASHBOARDS = ['student', 'counselor', 'admin', 'soc', 'appteam', 'board'];
// Light gold reads clearly on the dark golden-hour background and keeps the site's accent.
const GREETING_COLOUR = '#F6D27A';

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
// mirrored right hand meets it exactly on the centre line. Tapered fingers with slight
// outward tilt, soft skin shading, and knuckle creases make it read as a real hand.
const FINGERS: { x: number; top: number; tilt: number }[] = [
  { x: 56, top: 50, tilt: -4 },
  { x: 68, top: 34, tilt: -2 },
  { x: 80, top: 24, tilt: -1 },
  { x: 89, top: 18, tilt: 0 },
];

function Hand({ id }: { id: string }) {
  return (
    <g clipPath="url(#gz-namaste-half)">
      <path
        d="M50 92 C47 112 50 132 60 144 C70 152 86 152 100 150 L100 76 C88 78 60 80 50 92 Z"
        fill={`url(#gz-skin-${id})`}
        stroke="#9C6A45"
        strokeWidth="1"
      />
      {FINGERS.map(f => (
        <g key={f.x} transform={`rotate(${f.tilt} ${f.x + 5} 150)`}>
          <rect x={f.x} y={f.top} width="14" height={150 - f.top} rx="7" fill={`url(#gz-skin-${id})`} stroke="#9C6A45" strokeWidth="1" />
          <path d={`M${f.x + 7} ${f.top + 24} Q${f.x + 8} ${f.top + 30} ${f.x + 7} ${f.top + 36}`} stroke="#A8724B" strokeWidth="0.8" strokeLinecap="round" opacity="0.55" />
          <path d={`M${f.x + 3} ${f.top + 4} Q${f.x + 7} ${f.top + 2} ${f.x + 11} ${f.top + 4}`} fill="none" stroke="#FFE8CC" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        </g>
      ))}
      <path d="M96 70 Q100 100 100 150" fill="none" stroke="#7A4B2C" strokeWidth="1.4" opacity="0.4" />
    </g>
  );
}

function HandDefs({ id }: { id: string }) {
  return (
    <linearGradient id={`gz-skin-${id}`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#F3C9A0" />
      <stop offset="60%" stopColor="#E3A876" />
      <stop offset="100%" stopColor="#C98555" />
    </linearGradient>
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
  background:
    radial-gradient(ellipse at 50% 38%, rgba(246, 176, 72, 0.55) 0%, rgba(196, 112, 34, 0.25) 38%, transparent 70%),
    linear-gradient(180deg, #3b2310 0%, #2a1608 55%, #140a04 100%);
}
@keyframes gz-photo-in {
  0% { opacity: 0; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
.gz-photo { animation: gz-photo-in 2.4s ease-out both; }
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
  0% { text-shadow: 0 0 0 rgba(246, 210, 122, 0); }
  50% { text-shadow: 0 0 22px rgba(246, 210, 122, 0.7); }
  100% { text-shadow: 0 0 10px rgba(246, 210, 122, 0.35); }
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
  const [photo, setPhoto] = useState<'loading' | 'ok' | 'missing'>('loading');

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

      {/* Preloads the photo; rendered only once it has loaded, so a missing file is never visible. */}
      {photo === 'loading' && (
        <img src={PHOTO_SRC} alt="" className="hidden" onLoad={() => setPhoto('ok')} onError={() => setPhoto('missing')} />
      )}
      {photo === 'ok' && (
        <>
          <img src={PHOTO_SRC} alt="" className="gz-photo absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" aria-hidden="true" />
        </>
      )}

      <button
        type="button"
        onClick={e => { e.stopPropagation(); setShow(false); }}
        className="absolute top-4 right-4 z-10 rounded-full border border-amber-200/40 bg-white/10 px-4 py-1.5 text-sm font-medium text-amber-100 backdrop-blur-sm hover:bg-white/20"
      >
        Skip intro
      </button>

      <div className="gz-lantern absolute -left-16 top-10 h-48 w-48 rounded-full bg-amber-400/25 blur-3xl sm:h-64 sm:w-64" aria-hidden="true" />
      <div className="gz-lantern absolute -right-16 bottom-10 h-48 w-48 rounded-full bg-amber-400/25 blur-3xl sm:h-64 sm:w-64" aria-hidden="true" style={{ animationDelay: '1.5s' }} />

      {photo !== 'ok' && (
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMax meet" className="absolute bottom-0 h-[70dvh] w-[min(80vw,400px)] opacity-40" aria-hidden="true">
        <path d="M60 390 L60 170 Q60 40 200 40 Q340 40 340 170 L340 390" fill="none" stroke="#D9A94A" strokeWidth="2.5" />
        <path d="M80 390 L80 175 Q80 60 200 60 Q320 60 320 175 L320 390" fill="none" stroke="#E8BE62" strokeWidth="1" />
      </svg>
      )}

      <div className="relative flex flex-col items-center">
        {photo !== 'ok' && (
        <svg viewBox="0 0 200 150" className="w-[min(55vw,240px)] h-auto overflow-visible drop-shadow-[0_8px_12px_rgba(120,70,20,0.28)]" aria-hidden="true">
          <defs>
            <clipPath id="gz-namaste-half">
              <rect x="0" y="0" width="100" height="150" />
            </clipPath>
            <HandDefs id="l" />
            <HandDefs id="r" />
          </defs>
          <g className="gz-hand-left"><Hand id="l" /></g>
          <g className="gz-hand-right">
            <g transform="translate(200 0) scale(-1 1)"><Hand id="r" /></g>
          </g>
        </svg>
        )}

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
