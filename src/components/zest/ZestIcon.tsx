// Zest's mark: a round message bubble holding the Gradzest graduation cap, with a gold sparkle.
export default function ZestIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={`flex-shrink-0 ${className}`} aria-hidden="true">
      <path d="M24 5A17 17 0 1 0 12.4 33.2L8 42l10-3.6A17 17 0 0 0 24 5z" fill="#0d1b4b" />
      <g transform="translate(10.8 9.35) scale(1.1)" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c3 3 9 3 12 0v-5" />
        <path d="M22 10v6" />
      </g>
      <path d="M36 6.5C36.6 11.4 37.6 12.4 42.5 13c-4.9.6-5.9 1.6-6.5 6.5-.6-4.9-1.6-5.9-6.5-6.5 4.9-.6 5.9-1.6 6.5-6.5z" fill="#fcd34d" />
      <path d="M42 20.5c.3 1.6.7 2 2.3 2.3-1.6.3-2 .7-2.3 2.3-.3-1.6-.7-2-2.3-2.3 1.6-.3 2-.7 2.3-2.3z" fill="#fcd34d" />
    </svg>
  );
}
