import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  ArrowLeft, RefreshCw, Users, FileText, Award, CalendarDays, MessageSquare, Clock,
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, StickyNote, FileCheck, UserPlus,
  MessageCircle, Info, AlertCircle, GitBranch,
} from 'lucide-react';
import { api } from '../../api';

// Categorical slots (validated: blue, orange, aqua, yellow) — fixed per entity, never by rank.
const SLOT = { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', yellow: '#eda100' };
// Status colors are reserved for answered / missed and always paired with a label.
const STATUS = { good: '#0ca30c', critical: '#d03b3b' };
const EMPTY_RING = '#e5e7eb';

const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const CHANNELS = [
  { key: 'incoming', label: 'Incoming', color: SLOT.blue },
  { key: 'click_to_call', label: 'Click to Call', color: SLOT.orange },
  { key: 'whatsapp', label: 'WhatsApp', color: SLOT.aqua },
  { key: 'in_app', label: 'In-app', color: SLOT.yellow },
] as const;

function formatTalk(sec: number) {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
}

function pct(n: number, total: number) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%';
}

function dayLabel(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function Spinner() {
  return <span className="w-4 h-4 border-2 rounded-full animate-spin inline-block border-gray-300 border-t-gray-600" />;
}

function StatTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
        <Icon className="w-4 h-4" />{label}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-xs">
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.payload.color || p.color || p.fill }} />
          <span className="text-gray-600">{p.name}</span>
          <span className="font-semibold text-gray-900 ml-auto pl-3">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Donut with the total in the middle and a legend that always prints each value.
function Donut({ title, total, slices }: { title: string; total: number; slices: { name: string; value: number; color: string }[] }) {
  const data = total ? slices.filter(s => s.value > 0) : [{ name: 'No calls', value: 1, color: EMPTY_RING }];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="flex items-center gap-5">
        <div className="relative w-36 h-36 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="100%"
                paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {data.map(d => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              {total > 0 && <Tooltip content={<ChartTooltip />} />}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-gray-900">{total}</span>
            <span className="text-[11px] text-gray-500">Total calls</span>
          </div>
        </div>
        <ul className="space-y-2 flex-1 min-w-0">
          {slices.map(s => (
            <li key={s.name} className="flex items-center gap-2 text-sm">
              <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-gray-600 truncate">{s.name}</span>
              <span className="ml-auto font-semibold text-gray-900">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, any> = {
  application: FileText, comment: MessageCircle, document: FileCheck, note: StickyNote,
  meeting: CalendarDays, student: UserPlus, call: Phone, stage: GitBranch,
};

export default function AdminCounselorPerformance() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.admin.counselorPerformance(id, days)); }
    catch (err: any) { setError(err.message || 'Failed to load performance.'); }
    finally { setLoading(false); }
  }, [id, days]);

  useEffect(() => { load(); }, [load]);

  const calls = data?.calls;
  const sf = data?.smartflo;
  const s = data?.summary;

  // Group timeline by day
  const groups: { label: string; items: any[] }[] = [];
  (data?.timeline || []).forEach((t: any) => {
    const label = dayLabel(new Date(t.at));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t); else groups.push({ label, items: [t] });
  });

  const barData = calls ? CHANNELS.map(c => ({
    name: c.label,
    Total: calls.byChannel[c.key].total,
    Missed: calls.byChannel[c.key].missed,
    Answered: calls.byChannel[c.key].answered,
  })) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => navigate('/admin/counselors')} aria-label="Back to counselors"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{data?.counselor?.name || 'Counselor'} · Performance</h1>
          <p className="text-sm text-gray-500 truncate">{data?.counselor?.email}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="Time range">
          {PERIODS.map(p => (
            <button key={p.days} type="button" role="tab" aria-selected={days === p.days} onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === p.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={load} disabled={loading} aria-label="Refresh"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {loading ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {sf && (!sf.configured || !sf.agentSet || sf.error) && (
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-800 rounded-xl px-4 py-3 text-sm">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {sf.error ? `Smartflo calls could not be loaded: ${sf.error}. Showing in-app calls only.`
              : !sf.configured ? 'Smartflo is not connected yet. Add SMARTFLO_API_TOKEN to server/.env to include phone calls. Showing in-app calls only.'
              : 'Set this counselor\'s Smartflo agent (Counselors → Edit) to include their phone calls. Showing in-app calls only.'}
          </span>
        </div>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatTile icon={Users} label="Assigned students" value={s.students} sub={s.newLeads ? `${s.newLeads} new leads` : undefined} />
            <StatTile icon={FileText} label="Applications" value={s.applications} />
            <StatTile icon={Award} label="Offers" value={s.offers} sub={s.applications ? `${pct(s.offers, s.applications)} of applications` : undefined} />
            <StatTile icon={CalendarDays} label="Meetings" value={s.meetings} />
            <StatTile icon={MessageSquare} label="Messages sent" value={s.messagesSent} />
            <StatTile icon={Clock} label="Talk time" value={formatTalk(calls.talkSeconds)} />
          </div>

          {/* Call charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Donut title="Call Type" total={calls.total} slices={[
              { name: 'Inbound', value: calls.inbound, color: SLOT.blue },
              { name: 'Outbound', value: calls.outbound, color: SLOT.orange },
            ]} />
            <Donut title="Call Channels" total={calls.total}
              slices={CHANNELS.map(c => ({ name: c.label, value: calls.byChannel[c.key].total, color: c.color }))} />

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Call Status</h3>
              <div className="grid grid-cols-3 text-center mb-3">
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{calls.total}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><PhoneMissed className="w-3 h-3" />Missed ({pct(calls.missed, calls.total)})</p>
                  <p className="text-2xl font-bold" style={{ color: STATUS.critical }}>{calls.missed}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><Phone className="w-3 h-3" />Answered ({pct(calls.answered, calls.total)})</p>
                  <p className="text-2xl font-bold" style={{ color: STATUS.good }}>{calls.answered}</p>
                </div>
              </div>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} barGap={2} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e1e0d9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#898781' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#898781' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Bar dataKey="Total" fill={SLOT.blue} radius={[4, 4, 0, 0]} maxBarSize={12} />
                    <Bar dataKey="Missed" fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={12} />
                    <Bar dataKey="Answered" fill={STATUS.good} radius={[4, 4, 0, 0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 text-xs text-gray-600 mt-2">
                {[['Total', SLOT.blue], ['Missed', STATUS.critical], ['Answered', STATUS.good]].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-4">History</h3>
            {groups.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No activity in this period.</p>
            ) : groups.map(g => (
              <div key={g.label} className="mb-6 last:mb-0">
                <div className="flex items-center gap-3 mb-3 ml-[4.5rem]">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 -ml-[5px]" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.label}</span>
                </div>
                <ol className="border-l border-gray-200 ml-[4.5rem] space-y-4">
                  {g.items.map(t => {
                    const Icon = t.kind === 'call'
                      ? (t.status === 'missed' ? PhoneMissed : t.title.startsWith('Outbound') ? PhoneOutgoing : PhoneIncoming)
                      : KIND_ICON[t.kind] || FileText;
                    return (
                      <li key={t.id} className="relative pl-6">
                        <span className="absolute -left-[4.5rem] top-0.5 w-14 text-right text-xs text-gray-400">
                          {new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-white border border-gray-300" />
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                            <Icon className={`w-4 h-4 ${t.kind === 'call' && t.status === 'missed' ? 'text-red-600' : 'text-gray-500'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900">
                              {t.title}{t.studentName && <> · <span className="font-semibold">{t.studentName}</span></>}
                            </p>
                            {t.detail && <p className="text-xs text-gray-500 mt-0.5 break-words">{t.detail}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}

      {!data && loading && <div className="flex justify-center py-16"><Spinner /></div>}
    </div>
  );
}
