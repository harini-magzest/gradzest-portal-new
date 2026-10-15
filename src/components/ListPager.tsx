/** Previous / next under a list the server sends a page at a time (server/lib/paging.js). Hidden when it all fits. */
export default function ListPager({ page, total, pageSize, onPage }: {
  page: number; total: number; pageSize: number; onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const button = 'px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
      <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={button}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className={button}>Next</button>
      </div>
    </div>
  );
}
