/** Top of a conversation that has older messages (hooks/useOpenRoom): they load on scrolling up, or with this button. */
export default function EarlierMessages({ hasOlder, loading, onLoad }: { hasOlder: boolean; loading: boolean; onLoad: () => void }) {
  if (!hasOlder && !loading) return null;
  return (
    <div className="flex justify-center">
      <button type="button" onClick={onLoad} disabled={loading}
        className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
        {loading ? 'Loading earlier messages…' : 'Show earlier messages'}
      </button>
    </div>
  );
}
