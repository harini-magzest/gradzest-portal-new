import { useState, useEffect, useCallback } from 'react';
import { Flame, Lock, FileWarning, ShieldBan, UserX, Globe, CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import { ErrorBanner, Spinner, errorText, plural } from './ui';

const SEV_DOT: Record<string, string> = { critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-blue-400', info: 'bg-gray-400' };

function ago(iso?: string | null) {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

interface Props {
  onOpenIncidents?: () => void; // omitted where there is no incidents tab to jump to (e.g. inside Investigate)
  onOpenUploads?: () => void;
  onOpenUser: (id: string) => void;
  onOpenIp: (ip: string) => void;
}

// "What needs a human right now" — drawn from /api/soc/attention so the owner never has to hunt through tabs.
export default function NeedsAttention({ onOpenIncidents, onOpenUploads, onOpenUser, onOpenIp }: Props) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setData(await api.soc.attention()); } catch (e) { setError(errorText(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm"><Spinner /></div>;

  const c = data.counts;
  const nothing = !data.unacknowledged.length && !data.accounts.length && !data.ips.length && !data.locked.length && !c.flaggedUploads && !c.uploadsNeedReview;

  const chips = [
    { show: c.slaBreached > 0, icon: Flame, tone: 'bg-red-50 text-red-700', text: `${plural(c.slaBreached, 'incident')} past SLA`, onClick: onOpenIncidents },
    { show: c.flaggedUploads > 0, icon: FileWarning, tone: 'bg-red-50 text-red-700', text: `${plural(c.flaggedUploads, 'flagged upload')}`, onClick: onOpenUploads },
    { show: c.uploadsNeedReview > 0, icon: FileWarning, tone: 'bg-yellow-50 text-yellow-700', text: `${c.uploadsNeedReview} risky/quarantined`, onClick: onOpenUploads },
    { show: c.lockedAccounts > 0, icon: Lock, tone: 'bg-gray-100 text-gray-700', text: `${plural(c.lockedAccounts, 'locked account')}` },
    { show: c.blockedIps > 0, icon: ShieldBan, tone: 'bg-gray-100 text-gray-700', text: `${c.blockedIps} blocked ${c.blockedIps === 1 ? 'IP' : 'IPs'}` },
  ].filter(x => x.show);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Flame className="w-4 h-4 text-red-500" />
        <h3 className="text-sm font-bold text-gray-900">Needs attention</h3>
        <span className="text-[11px] text-gray-400">last 24 hours</span>
        <button type="button" onClick={load} className="ml-auto text-xs font-semibold text-purple-600 hover:underline">Refresh</button>
      </div>

      {nothing ? (
        <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-3"><CheckCircle2 className="w-4 h-4" /> Nothing needs a response right now.</p>
      ) : (
        <div className="space-y-4">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((x, i) => {
                const Icon = x.icon;
                const cls = `inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${x.tone}`;
                return x.onClick
                  ? <button key={i} type="button" onClick={x.onClick} className={`${cls} hover:opacity-80`}><Icon className="w-3 h-3" />{x.text}</button>
                  : <span key={i} className={cls}><Icon className="w-3 h-3" />{x.text}</span>;
              })}
            </div>
          )}

          {data.unacknowledged.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Unacknowledged high-severity incidents</p>
              <div className="space-y-1">
                {data.unacknowledged.map((i: any) => (
                  <button key={i._id} type="button" onClick={onOpenIncidents} disabled={!onOpenIncidents} className="w-full flex items-center gap-2 text-left text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50 disabled:hover:bg-transparent">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEV_DOT[i.severity] || 'bg-gray-400'}`} />
                    <span className="truncate flex-1 text-gray-800">{i.title}</span>
                    {i.ackBreached && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 rounded">SLA</span>}
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">{ago(i.createdAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.accounts.length > 0 && (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Accounts to look at</p>
                {data.accounts.map((a: any) => (
                  <button key={a.userId} type="button" onClick={() => onOpenUser(a.userId)} className="w-full flex items-center gap-2 text-left text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <UserX className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    <span className="truncate flex-1"><span className="font-medium text-gray-800">{a.name}</span> <span className="text-xs text-gray-400">{a.email}</span></span>
                    <span className="text-[11px] text-gray-500 text-right flex-shrink-0 max-w-[45%]">
                      {[a.failedLogins24h > 0 ? plural(a.failedLogins24h, 'failed login') : a.events24h > 0 ? plural(a.events24h, 'event') : '', a.openIncidents > 0 ? plural(a.openIncidents, 'open incident') : ''].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {data.ips.length > 0 && (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Addresses to look at</p>
                {data.ips.map((p: any) => (
                  <button key={p.ip} type="button" onClick={() => onOpenIp(p.ip)} className="w-full flex items-center gap-2 text-left text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <Globe className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    <span className="font-mono text-xs text-gray-800 flex-1 truncate">{p.ip}</span>
                    {p.blocked && <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-1.5 rounded">BLOCKED</span>}
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">
                      {p.rejected24h > 0 ? `${p.rejected24h} rejected` : plural(p.events24h, 'event')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {data.locked.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Locked accounts</p>
              {data.locked.map((u: any) => (
                <button key={u.userId} type="button" onClick={() => onOpenUser(u.userId)} className="w-full flex items-center gap-2 text-left text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
                  <Lock className="w-3.5 h-3.5 text-gray-300" />
                  <span className="flex-1 truncate"><span className="font-medium text-gray-800">{u.name}</span> <span className="text-xs text-gray-400">{u.email}</span></span>
                  <span className="text-[11px] text-gray-500">{u.byAdmin ? 'locked by you' : `auto-lock until ${new Date(u.lockedUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
