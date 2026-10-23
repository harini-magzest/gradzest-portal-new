// Zest's mark: a navy speech bubble holding the Gradzest graduation cap, with a gold sparkle.
export default function ZestIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="zest-sparkle-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f5c542" />
        </linearGradient>
      </defs>
      <path d="M24 8c-9.4 0-17 6.1-17 13.6 0 4.1 2.2 7.8 5.6 10.3L11.5 42l8.2-4.1c1.5.3 3 .5 4.3.5 9.4 0 17-6.1 17-13.6S33.4 8 24 8z" fill="#0d1b4b" />
      <g transform="translate(24 21) scale(0.85) translate(-12 -12)" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
        <path d="M22 10v6" />
      </g>
      <path d="M36 3.5C36.4 9.6 38.4 11.6 44.5 12c-6.1.4-8.1 2.4-8.5 8.5C35.6 14.4 33.6 12.4 27.5 12c6.1-.4 8.1-2.4 8.5-8.5z" fill="url(#zest-sparkle-gold)" />
      <path d="M41 21.5c.2 1.6.8 2.2 2.4 2.4-1.6.2-2.2.8-2.4 2.4-.2-1.6-.8-2.2-2.4-2.4 1.6-.2 2.2-.8 2.4-2.4z" fill="url(#zest-sparkle-gold)" />
    </svg>
  );
}
