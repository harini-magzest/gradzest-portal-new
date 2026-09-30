import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Bigin-style ‹ › buttons: step through the list of students the user came from. */
export default function RecordNavArrows({ currentId, basePath }: { currentId: string; basePath: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ids: string[] = (location.state as any)?.ids || [];
  const idx = ids.indexOf(currentId);
  if (idx === -1 || ids.length < 2) return null; // opened directly (no list) → hide arrows

  const go = (id: string) =>
    navigate(`${basePath}/${id}${location.search}`, { state: { ids }, replace: true });

  const btn = 'w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{idx + 1} of {ids.length}</span>
      <button type="button" className={btn} title="Previous student" aria-label="Previous student"
        disabled={idx === 0} onClick={() => go(ids[idx - 1])}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" className={btn} title="Next student" aria-label="Next student"
        disabled={idx === ids.length - 1} onClick={() => go(ids[idx + 1])}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
