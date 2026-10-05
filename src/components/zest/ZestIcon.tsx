// Zest's mark: a message bubble holding the Gradzest graduation cap, with a gold sparkle.
// `inverted` flips the colours for placement on navy backgrounds, where the navy bubble would vanish.
export default function ZestIcon({ className = 'w-5 h-5', inverted = false }: { className?: string; inverted?: boolean }) {
  const bubble = inverted ? '#ffffff' : '#0d1b4b';
  const line = inverted ? '#0d1b4b' : '#ffffff';
  const tile = inverted ? '#0d1b4b' : '#ffffff';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={`flex-shrink-0 ${className}`} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill={tile} />
      <path d="M24 8c-9 0-16 5.9-16 13.2 0 3.8 1.8 7.2 4.7 9.6L11 40l7.8-3.8c1.6.4 3.3.6 5.2.6 9 0 16-5.9 16-13.2S33 8 24 8z" fill={bubble} />
      <g transform="translate(10.8 9.35) scale(1.1)" fill="none" stroke={line} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
        <path d="M22 10v6" />
      </g>
      <path d="M36.5 8.5C37 12 37.5 12.5 41 13c-3.5.5-4 1-4.5 4.5C36 14 35.5 13.5 32 13c3.5-.5 4-1 4.5-4.5z" fill="#fcd34d" />
      <path d="M40.5 19c.2 1.2.5 1.5 1.7 1.7-1.2.2-1.5.5-1.7 1.7-.2-1.2-.5-1.5-1.7-1.7 1.2-.2 1.5-.5 1.7-1.7z" fill="#fcd34d" />
    </svg>
  );
}
