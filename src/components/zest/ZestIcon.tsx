// Zest's mark: the speech-bubble graduation cap with a gold sparkle (public/zest-icon.png).
export default function ZestIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return <img src="/zest-icon.png" alt="" aria-hidden="true" className={`flex-shrink-0 object-contain ${className}`} />;
}
