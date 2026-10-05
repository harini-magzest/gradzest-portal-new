import { GraduationCap, Sparkles } from 'lucide-react';

// The Gradzest hat with a sparkle badge, so Zest reads as the AI assistant and still belongs to the brand.
export default function ZestIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <span className={`relative inline-flex flex-shrink-0 ${className}`}>
      <GraduationCap className="w-full h-full" />
      <Sparkles className="absolute -top-1 -right-1 w-[55%] h-[55%] text-amber-300 fill-amber-300" />
    </span>
  );
}
