import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const SEEN_KEY = 'gz_namaste_seen';
const DURATION_MS = 3500;
const DASHBOARDS = ['student', 'counselor', 'admin', 'soc', 'appteam', 'board'];
const GREETING_COLOUR = '#FFFFFF';
// The intro is the video at public/namaste-intro.mp4: hands, lotus, glow and the "NAMASTE / WELCOME / GRADZEST" text are all
// in the footage, so it plays alone for its full length. If the file is missing, or doesn't start playing within
// VIDEO_WAIT_MS (autoplay blocked, slow network), the drawn hands below play instead.
const VIDEO_SRC = '/namaste-intro.mp4';
const VIDEO_WAIT_MS = 2500;
const VIDEO_HOLD_MS = 500; // the last frame stays up this long so the text can be read
const VIDEO_EXIT_MS = 700; // then the slide-up
const VIDEO_DEFAULT_MS = 5500; // used only if the browser can't report the video's length
// Flat navy of the footage's own background, so the frame can be shown whole (never cropped) with no visible edges.
const VIDEO_BG = '#09152d';

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

// Line-art Namaste (anjali mudra): two hands pressed palm to palm, fingers pointing up, seen from the
// front. Only the left hand is described; the right is its mirror across x=100, so the pair is
// symmetrical and the two meet on the centre line. Each half slides in from its own side while its
// strokes trace themselves (stroke-dash); every stroke uses pathLength=1 so one dash rule animates all.
type Stroke = { d: string; delay: number; rotate?: number };

const FINGER_R = 5.25;
// x = finger centre, top = fingertip, rotate = degrees leaning toward the centre (the index lies on it)
const FINGERS = [
  { x: 61, top: 80, rotate: 6, delay: 0.45 },
  { x: 72.5, top: 54, rotate: 3, delay: 0.6 },
  { x: 84, top: 34, rotate: 1, delay: 0.75 },
  { x: 94.5, top: 28, rotate: 0, delay: 0.9 },
];

const HAND_STROKES: Stroke[] = [
  { d: 'M78 246 H100 M80 234 H100', delay: 0 }, // sleeve cuff
  { d: 'M55.75 142 C50 172 62 204 80 234', delay: 0.15 }, // outer edge of the palm down to the wrist
  { d: 'M55.75 146 C70 140 86 140 100 146', delay: 0.3 }, // knuckle line
  ...FINGERS.map(f => ({
    d: `M${f.x - FINGER_R} 144 V${f.top + FINGER_R} A${FINGER_R} ${FINGER_R} 0 0 1 ${f.x + FINGER_R} ${f.top + FINGER_R} V144`,
    delay: f.delay,
    rotate: f.rotate,
  })),
  { d: 'M99.75 36 V152', delay: 1.0 }, // centre seam where the palms meet
  { d: 'M100 158 C90 152 82 156 81 172 C80 188 88 200 100 198', delay: 1.1 }, // thumb folded against the palm
];

// Soft gold body behind the outlines, so the pair has some volume instead of reading as wire.
const PALM_FILL = 'M55.75 142 C50 172 62 204 80 234 H100 V142 Z';

const rotateAttr = (rotate?: number) => (rotate ? `rotate(${rotate} 100 144)` : undefined);

function Hand() {
  return (
    <>
      <g className="gz-fill" stroke="none" fill="url(#gz-fill)">
        <path d={PALM_FILL} />
        {HAND_STROKES.filter(st => st.rotate !== undefined).map(st => (
          <path key={st.d} d={st.d} transform={rotateAttr(st.rotate)} />
        ))}
      </g>
      <g fill="none" stroke="#67E8F9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {HAND_STROKES.map(st => (
          <path key={st.d} d={st.d} pathLength={1} className="gz-draw" style={{ animationDelay: `${st.delay}s` }} transform={rotateAttr(st.rotate)} />
        ))}
      </g>
    </>
  );
}

function Hands() {
  return (
    <>
      <defs>
        <linearGradient id="gz-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <g className="gz-join-left"><Hand /></g>
      <g className="gz-join-right"><g transform="translate(200 0) scale(-1 1)"><Hand /></g></g>
    </>
  );
}

// Golden dust: fixed positions (no per-render randomness) drifting upward at staggered speeds.
const PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  top: `${(i * 53 + 17) % 100}%`,
  size: 2 + (i % 4),
  duration: 4 + (i % 5),
  delay: -((i * 0.7) % 6),
}));

const GREETING = 'Namaste'.split('');

// Drawn fallback timeline (3.5s): hands slide together and trace in 0–1.6s, the glow blooms 1.2–2.4s, 'Namaste' reveals letter by letter from
// 1.5s, then the whole overlay slides up and fades 2.9–3.5s.
const CSS = `
.gz-namaste { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.gz-namaste-bg {
  background:
    radial-gradient(ellipse at 50% 45%, rgba(59, 130, 246, 0.28) 0%, transparent 62%),
    linear-gradient(180deg, #0e1c4d 0%, #09133a 100%);
}
@keyframes gz-namaste-exit {
  0%, 82% { transform: translateY(0); opacity: 1; animation-timing-function: cubic-bezier(0.76, 0, 0.24, 1); }
  100% { transform: translateY(-100%); opacity: 0; }
}
.gz-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
/* Portrait screens: the artwork sits in the middle ~60% of the 16:9 frame, so enlarge the video to fill the width (only the empty sides
   are cropped) and fade its top and bottom edges, where the glow would otherwise end in a hard line. */
@media (max-aspect-ratio: 1/1) {
  .gz-video {
    inset: auto; top: 50%; left: 0; height: auto; aspect-ratio: 16 / 9;
    transform: translateY(-50%) scale(1.5);
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent);
    mask-image: linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent);
  }
}
@keyframes gz-namaste-video-exit {
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(-100%); opacity: 0; }
}
@keyframes gz-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes gz-fill-in {
  to { opacity: 1; }
}
@keyframes gz-join-left {
  from { transform: translateX(-46px); }
  to { transform: translateX(0); }
}
@keyframes gz-join-right {
  from { transform: translateX(46px); }
  to { transform: translateX(0); }
}
@keyframes gz-text-in {
  0% { opacity: 0; transform: translateY(12px); letter-spacing: 0.35em; }
  100% { opacity: 1; transform: translateY(0); letter-spacing: 0.12em; }
}
@keyframes gz-glow {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  60% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  100% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
}
@keyframes gz-letter-in {
  from { opacity: 0; transform: translateY(14px); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes gz-sub-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes gz-dust {
  0% { opacity: 0; transform: translateY(0); }
  30%, 70% { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-60px); }
}
.gz-join-left { animation: gz-join-left 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.gz-join-right { animation: gz-join-right 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.gz-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gz-draw 0.9s ease-out forwards; }
.gz-fill { opacity: 0; animation: gz-fill-in 1s ease-out 1.1s forwards; }
.gz-halo { animation: gz-glow 1.6s ease-out 1.2s both; }
.gz-greeting { letter-spacing: 0.12em; color: ${GREETING_COLOUR}; font-weight: 700; text-shadow: 0 0 22px rgba(103, 232, 249, 0.55); }
.gz-letter { display: inline-block; animation: gz-letter-in 0.7s ease-out both; }
.gz-sub { animation: gz-sub-in 0.9s ease-out 2s both; }
.gz-dust { animation: gz-dust linear infinite; background: #A5F3FC; box-shadow: 0 0 8px 2px rgba(103, 232, 249, 0.6); }
`;

export default function NamasteIntro() {
  const { pathname } = useLocation();
  const area = areaOf(pathname);
  const [show, setShow] = useState(() => shouldPlay(area));
  // 'loading' until the video actually starts playing; 'missing' means play the drawn fallback instead.
  const [video, setVideo] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [videoMs, setVideoMs] = useState(0);

  // Entering another area after an intro has ended starts a new one from scratch: the video has to start playing again
  // (a stale 'ok' would start the clock for a video that may never play). While an intro is still up this does nothing.
  useEffect(() => {
    if (show || !shouldPlay(area)) return;
    setVideo('loading');
    setShow(true);
  }, [area]);

  useEffect(() => {
    if (!show || video !== 'loading') return;
    const t = setTimeout(() => setVideo('missing'), VIDEO_WAIT_MS);
    return () => clearTimeout(t);
  }, [show, video]);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem(`${SEEN_KEY}:${area}`, '1'); } catch { /* storage unavailable: replays next load */ }
  }, [show, area]);

  // The clock starts once we know which version plays, so the exit never fires before the animation has begun. It doesn't
  // depend on the area, so navigating while the intro is up can't restart it out of step with the slide-up animation.
  const totalMs = video === 'ok' ? videoMs + VIDEO_HOLD_MS + VIDEO_EXIT_MS : DURATION_MS;
  useEffect(() => {
    if (!show || video === 'loading') return;
    const t = setTimeout(() => setShow(false), totalMs);
    return () => clearTimeout(t);
  }, [show, video, totalMs]);

  // While the intro covers the page: Esc skips it, and the page behind it can't scroll.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  if (!show) return null;

  const fallback = video === 'missing';

  return (
    <div
      role="dialog"
      aria-label="Welcome to Gradzest"
      onClick={() => setShow(false)}
      className={`gz-namaste ${fallback ? 'gz-namaste-bg' : ''} fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden cursor-pointer`}
      style={{
        height: '100dvh',
        // Flat navy while the video loads or plays (it matches the footage); the drawn fallback keeps its gradient.
        background: fallback ? undefined : VIDEO_BG,
        animation: fallback
          ? `gz-namaste-exit ${DURATION_MS}ms linear both`
          : video === 'ok'
            ? `gz-namaste-video-exit ${VIDEO_EXIT_MS}ms cubic-bezier(0.76, 0, 0.24, 1) ${videoMs + VIDEO_HOLD_MS}ms both`
            : 'none',
      }}
    >
      <style>{CSS}</style>

      {/* The intro itself. Whole frame is shown (contain, not cover) so the hands, lotus and text are never cropped. */}
      {!fallback && (
        <video
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onPlaying={e => {
            const d = e.currentTarget.duration;
            setVideoMs(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : VIDEO_DEFAULT_MS);
            setVideo('ok');
          }}
          // Only a failure to start means fall back; once it plays, a late error just leaves the last frame up until the clock runs out.
          onError={() => setVideo(v => (v === 'loading' ? 'missing' : v))}
          className="gz-video"
        />
      )}

      {fallback && PARTICLES.map((p, i) => (
        <span
          key={i}
          className="gz-dust absolute rounded-full"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
          aria-hidden="true"
        />
      ))}

      {fallback && (
        <div className="relative flex flex-col items-center">
          <div className="gz-halo absolute left-1/2 top-[40%] h-56 w-56 rounded-full bg-blue-500/45 blur-3xl sm:h-80 sm:w-80" aria-hidden="true" />
          <svg viewBox="0 0 200 260" className="relative w-[min(46vw,220px)] max-h-[42dvh] h-auto overflow-visible drop-shadow-[0_0_16px_rgba(59,130,246,0.7)]" aria-hidden="true">
            <Hands />
          </svg>

          <p className="gz-greeting relative mt-6 text-3xl uppercase sm:text-5xl" aria-label="Namaste">
            {GREETING.map((ch, i) => (
              <span key={i} className="gz-letter" style={{ animationDelay: `${1.5 + i * 0.07}s` }} aria-hidden="true">{ch}</span>
            ))}
          </p>
          <p className="gz-sub relative mt-3 text-xs font-medium uppercase tracking-[0.35em] text-cyan-200/80 sm:text-sm">Welcome to Gradzest</p>
        </div>
      )}
    </div>
  );
}
