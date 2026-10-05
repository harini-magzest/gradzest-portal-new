import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api';

type Data = Awaited<ReturnType<typeof api.students.dataAccess>>;

const ROLE_LABEL: Record<string, string> = { counselor: 'Counselor', admin: 'Administrator', student: 'You', staff: 'Staff member' };

// Who has opened this student's personal details, shown back to the person they are about.
export default function DataAccessLog() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.students.dataAccess().then(d => { if (live) setData(d); }).catch(err => { if (live) setError(err.message || 'Could not load this right now.'); });
    return () => { live = false; };
  }, []);

  const rows = data?.accesses || [];
  const shown = open ? rows : rows.slice(0, 5);

  return (
    <section aria-labelledby="data-access-title" className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
        <h2 id="data-access-title" className="font-semibold text-gray-900">Who has viewed my details</h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Every time a member of the team opens your personal details (such as your passport or contact information), it is recorded here.
      </p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!error && !data && <p className="text-sm text-gray-400">Loading…</p>}
      {data && rows.length === 0 && <p className="text-sm text-gray-500">Nobody has viewed your details yet.</p>}
      {rows.length > 0 && (
        <>
          <ul className="divide-y divide-gray-50">
            {shown.map(a => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-800">
                  {a.name || ROLE_LABEL[a.role] || 'Staff member'}
                  <span className="ml-2 text-xs text-gray-500">{ROLE_LABEL[a.role] || a.role}</span>
                </span>
                <time dateTime={a.at} className="text-xs text-gray-500 flex-shrink-0">{new Date(a.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <button type="button" onClick={() => setOpen(o => !o)} className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-800">
              {open ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
