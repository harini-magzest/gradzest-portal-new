import { useState, useEffect, useCallback } from 'react';
import { BellOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api';
import { errorText } from './ui';
import { TYPE_LABEL } from './incidentShared';

interface Suppression {
  _id: string; kind: 'ip' | 'email'; value: string; incidentTypes: string[]; reason: string;
  expiresAt?: string | null; createdAt: string; createdBy?: { name: string } | null;
}

const DURATIONS = [
  { label: 'Permanent', hours: 0 }, { label: '24 hours', hours: 24 }, { label: '7 days', hours: 168 }, { label: '30 days', hours: 720 },
];

// Allowlist of trusted IPs / CIDR ranges / emails (office network, VPN, pentest
// box, monitoring). Matching activity still lands in the event feed, but stops
// opening incidents.
export default function SuppressionPanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Suppression[]>([]);
  const [kind, setKind] = useState<'ip' | 'email'>('ip');
  const [value, setValue] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setRules((await api.soc.suppressions()).suppressions || []); setError(''); } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const add = async () => {
    setError(''); setSaving(true);
    try {
      await api.soc.addSuppression({ kind, value: value.trim(), incidentTypes: types, reason: reason.trim(), expiresInHours: hours || undefined });
      setValue(''); setReason(''); setTypes([]);
      await load();
    } catch (err: any) { setError(err.message || 'Failed to add rule'); }
    setSaving(false);
  };

  const remove = async (id: string) => { await api.soc.removeSuppression(id); await load(); };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <BellOff className="w-4 h-4 text-purple-600" /> Suppression rules
          <span className="text-xs font-normal text-gray-400">trusted IPs / emails that should not open incidents</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <select value={kind} onChange={e => setKind(e.target.value as 'ip' | 'email')}
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="ip">IP / CIDR</option><option value="email">Email</option>
            </select>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder={kind === 'ip' ? '203.0.113.0/24' : 'monitor@company.com'}
              className="md:col-span-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why (e.g. office VPN)"
              className="md:col-span-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <select value={hours} onChange={e => setHours(Number(e.target.value))}
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500">
              {DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Applies to {types.length ? '' : '(all incident types)'}</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TYPE_LABEL).filter(([k]) => k !== 'manual').map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTypes(t => t.includes(k) ? t.filter(x => x !== k) : [...t, k])}
                  className={`text-[11px] font-medium px-2 py-1 rounded-full border transition-colors ${types.includes(k) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={add} disabled={saving || !value.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">Add rule</button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {rules.length === 0 ? <p className="text-sm text-gray-400 italic">No suppression rules.</p> : (
            <div className="space-y-1.5">
              {rules.map(r => (
                <div key={r._id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="min-w-0 text-sm">
                    <span className="font-mono text-gray-800">{r.value}</span>
                    <span className="text-xs text-gray-400"> · {r.incidentTypes.length ? r.incidentTypes.map(t => TYPE_LABEL[t] || t).join(', ') : 'all types'}
                      {r.reason ? ` · ${r.reason}` : ''}{r.expiresAt ? ` · expires ${new Date(r.expiresAt).toLocaleDateString('en-IN')}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => remove(r._id)} aria-label="Remove rule" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
