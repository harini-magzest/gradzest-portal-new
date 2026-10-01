import { useState, useEffect } from 'react';
import { User, Link2, History, Activity } from 'lucide-react';
import { api } from '../../api';
import { errorText } from './ui';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const label = (s: string) => (s || '').replace(/_/g, ' ');

// The "why am I looking at this?" part of an incident: the events behind it, who it concerns, other incidents involving the
// same address or account, and what has already been done. Loaded from /incidents/:id/detail.
export default function IncidentContext({ incidentId, refreshKey, onOpenUser }: { incidentId: string; refreshKey: string; onOpenUser?: (id: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api.soc.incidentDetail(incidentId)
      .then(r => { if (!cancelled) setD(r); })
      .catch(e => { if (!cancelled) setError(errorText(e)); });
    return () => { cancelled = true; };
  }, [incidentId, refreshKey]);

  if (error) return <p className="text-xs text-red-600">Could not load context: {error}</p>;
  if (!d) return <p className="text-xs text-gray-400">Loading context…</p>;

  const Heading = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase mb-2"><Icon className="w-3.5 h-3.5" />{children}</p>
  );

  return (
    <div className="space-y-5">
      {d.subject && (
        <div>
          <Heading icon={User}>Who it concerns</Heading>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800">{d.subject.name} <span className="text-[11px] text-gray-400 capitalize">· {d.subject.role}</span></p>
              <p className="text-xs text-gray-500 truncate">{d.subject.email}{d.subject.phone ? ` · ${d.subject.phone}` : ''}</p>
            </div>
            {onOpenUser && <button type="button" onClick={() => onOpenUser(d.subject.id)} className="text-xs font-semibold text-purple-600 hover:underline">Investigate</button>}
          </div>
        </div>
      )}

      <div>
        <Heading icon={Activity}>Evidence</Heading>
        {d.evidence.events.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No individual events were recorded for this incident.</p>
        ) : (
          <>
            <p className="text-[11px] text-gray-400 mb-1">
              {d.evidence.kind === 'recorded' ? 'Events that triggered this incident.' : 'This rule does not store its triggering events — showing what the same address / account did within 6 hours either side.'}
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {d.evidence.events.map((e: any) => (
                <div key={e._id} className="flex items-start gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                  <span className="font-semibold text-gray-700 capitalize whitespace-nowrap">{label(e.type)}</span>
                  <span className="text-gray-500 flex-1 truncate">{e.ip || ''}{e.email ? ` · ${e.email}` : ''}</span>
                  <span className="text-gray-400 whitespace-nowrap">{when(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {d.related.length > 0 && (
        <div>
          <Heading icon={Link2}>Other incidents, same {d.incident.relatedIp ? 'address' : 'account'}</Heading>
          <div className="space-y-1">
            {d.related.map((r: any) => (
              <div key={r._id} className="flex items-center gap-2 text-xs">
                <span className="truncate flex-1 text-gray-700">{r.title}</span>
                <span className="text-gray-400 whitespace-nowrap">{r.severity} · {label(r.status)} · {when(r.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Heading icon={History}>Actions taken</Heading>
        {d.actions.length === 0 ? <p className="text-sm text-gray-400 italic">Nothing done yet.</p> : (
          <div className="space-y-1">
            {d.actions.map((a: any) => (
              <div key={a._id} className="text-xs flex gap-2">
                <span className="text-gray-400 whitespace-nowrap">{when(a.createdAt)}</span>
                <span className="text-gray-700 flex-1">{label(a.action)}{a.reason ? ` — ${a.reason}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
