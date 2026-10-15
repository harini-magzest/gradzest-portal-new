import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Package, Construction, Activity, Bug } from 'lucide-react';
import { api } from '../../api';
import AlertChannelsCard from './AlertChannelsCard';

const FLAW_SEV_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  critical: { backgroundColor: '#FCE8E8', color: '#8B1A1A' },
  high: { backgroundColor: '#FCEBEB', color: '#791F1F' },
  medium: { backgroundColor: '#FAEEDA', color: '#633806' },
};

const SEV_COLORS: Record<string, string> = { critical: '#8B1A1A', high: '#dc2626', moderate: '#ea580c', low: '#0891b2', info: '#6b7280' };

function AuditCard({ title, audit }: { title: string; audit: any }) {
  if (audit.error) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><Package className="w-4 h-4" /> {title}</h3>
        <p className="text-sm text-gray-400">{audit.error}</p>
      </div>
    );
  }
  const entries = Object.entries(audit).filter(([k]) => k !== 'total');
  const total = audit.total ?? entries.reduce((sum: number, [, v]: any) => sum + (v || 0), 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Package className="w-4 h-4" /> {title}</h3>
      {total === 0 ? (
        <p className="text-sm text-green-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> No known vulnerabilities</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([sev, count]: any) => count > 0 && (
            <span key={sev} className="text-xs font-semibold px-3 py-1.5 rounded-full text-white" style={{ backgroundColor: SEV_COLORS[sev] || '#6b7280' }}>
              {count} {sev}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostureTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async (refresh = false) => {
    setLoading(true);
    try { setData(await api.soc.posture(refresh)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <AlertChannelsCard />
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {data?.cached ? 'Showing cached results' : 'Freshly checked'}{data?.checkedAt ? ` · last checked ${new Date(data.checkedAt).toLocaleString()}` : ''}
        </p>
        <button type="button" onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-check
        </button>
      </div>

      {loading && !data ? (
        <div className="p-8 text-center text-sm text-gray-400">Running dependency audit — this can take a few seconds…</div>
      ) : data && (
        <>
          {data.knownGaps?.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
                <Construction className="w-4 h-4" /> Known incomplete work
              </h3>
              <p className="text-xs text-amber-700/80 mb-4">
                Deliberately tracked here, not just in chat history — these are real, open gaps in this dashboard's own build-out. Update or remove an item the moment it's actually closed.
              </p>
              <div className="space-y-3">
                {data.knownGaps.map((gap: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-amber-900">{gap.label}</p>
                      <p className="text-xs text-amber-700/90 mt-0.5">{gap.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AuditCard title="Frontend dependencies" audit={data.dependencyAudit.frontend} />
            <AuditCard title="Backend dependencies" audit={data.dependencyAudit.backend} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><Activity className="w-4 h-4" /> Active features (live)</h3>
            <p className="text-xs text-gray-400 mb-4">Marked active at the exact line in server/app.js where each one actually mounted during this server's boot — not a separate hand-typed claim.</p>
            <div className="space-y-2">
              {(data.activeFeatures || []).map((f: any) => (
                <div key={f.name} className="flex items-center gap-2.5 py-1.5">
                  <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </span>
                  <span className="text-sm text-gray-700"><span className="font-mono text-xs text-gray-500">{f.name}</span> — {f.detail}</span>
                </div>
              ))}
              {(!data.activeFeatures || data.activeFeatures.length === 0) && (
                <p className="text-sm text-gray-400 italic">No features marked active yet — server may need a restart.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><Bug className="w-4 h-4" /> Code flags</h3>
            <p className="text-xs text-gray-400 mb-4">
              A small, hand-picked set of anti-pattern checks (eval(), hardcoded secrets, console.log of request bodies, weak token randomness) —
              not a full static-analysis engine. Absence of flags here isn't proof of no flaws, just that these specific patterns weren't found.
            </p>
            {(data.codeAnalysis?.codeFlags || []).length === 0 ? (
              <p className="text-sm text-green-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> None of the checked patterns were found</p>
            ) : (
              <div className="space-y-2">
                {data.codeAnalysis.codeFlags.map((flag: any, i: number) => (
                  <div key={i} className="flex items-start gap-2.5 py-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={FLAW_SEV_COLORS[flag.severity]}>{flag.severity}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">{flag.label}</p>
                      <p className="text-xs font-mono text-gray-400 truncate">{flag.file}:{flag.line} — {flag.snippet}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
