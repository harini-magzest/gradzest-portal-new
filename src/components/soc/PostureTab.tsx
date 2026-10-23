import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Package, Construction, Activity, Bug, ChevronDown } from 'lucide-react';
import { api } from '../../api';
import AlertChannelsCard from './AlertChannelsCard';
import { Card, ErrorBanner, Section, errorText } from './ui';

const FLAW_SEV_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  critical: { backgroundColor: '#FCE8E8', color: '#8B1A1A' },
  high: { backgroundColor: '#FCEBEB', color: '#791F1F' },
  medium: { backgroundColor: '#FAEEDA', color: '#633806' },
};

const SEV_COLORS: Record<string, string> = { critical: '#8B1A1A', high: '#dc2626', moderate: '#c2410c', low: '#0e7490', info: '#6b7280' };

const auditTotal = (audit: any) => audit?.error ? 0
  : audit?.total ?? Object.entries(audit || {}).filter(([k]) => k !== 'total').reduce((sum: number, [, v]: any) => sum + (v || 0), 0);

function AuditCard({ title, audit }: { title: string; audit: any }) {
  const entries = Object.entries(audit).filter(([k]) => k !== 'total');
  return (
    <Card title={title} icon={Package}>
      {audit.error ? <p className="text-sm text-gray-500">{audit.error}</p>
        : auditTotal(audit) === 0 ? (
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
    </Card>
  );
}

// Ordered by what needs doing: first what is wrong and fixable, then what is protecting the app, then who gets told
// when something happens, and last the build-out notes, folded away because they change rarely.
export default function PostureTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // A failed check keeps the last result on screen (with the failure above it); with nothing to show yet it says so, rather
  // than leaving the tab blank as if the posture had come back empty.
  const load = async (refresh = false) => {
    setLoading(true); setError('');
    try { setData(await api.soc.posture(refresh)); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const flags = data?.codeAnalysis?.codeFlags || [];
  const vulnerable = data ? auditTotal(data.dependencyAudit?.frontend) + auditTotal(data.dependencyAudit?.backend) : 0;
  const checkedAt = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-400">
          {data?.cached ? 'Showing cached results' : 'Freshly checked'}{checkedAt ? ` · last checked ${checkedAt}` : ''}
        </p>
        <button type="button" onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-check
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={() => { void load(true); }} />}

      {loading && !data ? (
        <div role="status" className="p-8 text-center text-sm text-gray-500">Running dependency audit — this can take a few seconds…</div>
      ) : data && (
        <>
          <Section title="Needs fixing"
            hint={vulnerable + flags.length === 0 ? 'Nothing found by these checks' : `${vulnerable} known ${vulnerable === 1 ? 'vulnerability' : 'vulnerabilities'} in dependencies, ${flags.length} code flag${flags.length === 1 ? '' : 's'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AuditCard title="Frontend dependencies" audit={data.dependencyAudit.frontend} />
              <AuditCard title="Backend dependencies" audit={data.dependencyAudit.backend} />
            </div>
            <Card title="Code flags" icon={Bug}
              hint="A small, hand-picked set of anti-pattern checks (eval(), hardcoded secrets, console.log of request bodies, weak token randomness), not a full static-analysis engine. No flags means these patterns weren't found, not that there are no flaws.">
              {flags.length === 0 ? (
                <p className="text-sm text-green-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> None of the checked patterns were found</p>
              ) : (
                <div className="space-y-2">
                  {flags.map((flag: any, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 py-1.5">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={FLAW_SEV_COLORS[flag.severity]}>{flag.severity}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">{flag.label}</p>
                        <p className="text-xs font-mono text-gray-500 truncate">{flag.file}:{flag.line} — {flag.snippet}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </Section>

          <Section title="Protection in place" hint="Marked active where each one mounted during this server's start, not a hand-typed list">
            <Card title="Active protections" icon={Activity}>
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
                  <p className="text-sm text-gray-500 italic">No features marked active yet — server may need a restart.</p>
                )}
              </div>
            </Card>
          </Section>
        </>
      )}

      <Section title="Alerting" hint="Who is told when an incident opens">
        <AlertChannelsCard />
      </Section>

      {data?.knownGaps?.length > 0 && (
        <details className="group bg-amber-50 rounded-2xl border border-amber-200 shadow-sm">
          <summary className="flex items-center gap-2 p-5 cursor-pointer list-none text-sm font-bold text-amber-900">
            <Construction className="w-4 h-4" aria-hidden="true" /> Known gaps in this dashboard ({data.knownGaps.length})
            <ChevronDown className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-amber-800">
              Real, open gaps in this dashboard's own build-out. Update or remove an item the moment it's actually closed.
            </p>
            {data.knownGaps.map((gap: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-amber-900">{gap.label}</p>
                  <p className="text-xs text-amber-800 mt-0.5">{gap.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
