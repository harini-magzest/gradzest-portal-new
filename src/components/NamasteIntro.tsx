import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SEEN_KEY = 'gz_namaste_seen';
const DURATION_MS = 2800;
const DASHBOARDS = ['student', 'counselor', 'admin', 'soc', 'appteam', 'board'];

// The public site and each dashboard get their own intro, so entering a dashboard after the
// homepage in the same session still plays it once.
function areaOf(pathname: string): string {
  const first = pathname.split('/')[1] || '';
  return DASHBOARDS.includes(first) ? first : 'public';
}

// One hand of the joined-palms pose, drawn on the left of x=100 and clipped there so the
// mirrored right hand meets it exactly on the centre line. Four fingers, the innermost
// reaching the centre, give the silhouette its namaste shape.
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

const CSS = `
@keyframes gz-hand-left {
  0% { transform: translateX(-120vw) rotate(-10deg); }
  70% { transform: translateX(0) rotate(0deg); }
  82% { transform: translateX(0) scale(1.04); }
  100% { transform: translateX(0) scale(1); }
}
@keyframes gz-hand-right {
  0% { transform: translateX(120vw) rotate(10deg); }
  70% { transform: translateX(0) rotate(0deg); }
  82% { transform: translateX(0) scale(1.04); }
  100% { transform: translateX(0) scale(1); }
}
@keyframes gz-intro-fade {
  0%, 84% { opacity: 1; }
  100% { opacity: 0; }
}
.gz-namaste { animation: gz-intro-fade ${DURATION_MS}ms ease-in both; }
.gz-hand-left { animation: gz-hand-left 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.gz-hand-right { animation: gz-hand-right 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
`;

function shouldPlay(area: string): boolean {
  try {
    if (sessionStorage.getItem(`${SEEN_KEY}:${area}`)) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

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
      className="gz-namaste fixed inset-0 z-[9999] flex items-center justify-center bg-white cursor-pointer"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 200 150" className="w-[min(70vw,320px)] h-auto overflow-visible" aria-hidden="true">
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
    </div>
  );
}
