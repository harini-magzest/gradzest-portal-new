import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AlertTriangle, X, Send, Loader2 } from 'lucide-react';
import { api, getApiToken } from '../../api';

interface Note { author: string; authorRole: string; text: string; createdAt: string }
interface Incident {
  _id: string; type: string; severity: string; status: string; title: string;
  relatedIp?: string; relatedEmail?: string; notes: Note[]; createdAt: string; updatedAt: string;
}

const SEVERITY_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  critical: { backgroundColor: '#FCE8E8', color: '#8B1A1A' }, high: { backgroundColor: '#FCEBEB', color: '#791F1F' },
  medium: { backgroundColor: '#FAEEDA', color: '#633806' }, low: { backgroundColor: '#E6F1FB', color: '#0C447C' }, info: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
const STATUS_STYLE: Record<string, { backgroundColor: string; color: string }> = {
  open: { backgroundColor: '#FCEBEB', color: '#791F1F' }, investigating: { backgroundColor: '#FAEEDA', color: '#633806' },
  resolved: { backgroundColor: '#EAF3DE', color: '#27500A' }, false_positive: { backgroundColor: '#F0F0F2', color: '#4B5563' },
};
const TYPE_LABEL: Record<string, string> = {
  brute_force: 'Brute Force', suspicious_ip: 'Suspicious IP', payment_anomaly: 'Payment Anomaly',
  account_lockout: 'Account Lockout', pii_bulk_access: 'Bulk PII Access', malware_upload: 'Malware Upload', waf_block: 'WAF Block', skyload_bot_activity: 'Skyload Bot Activity', manual: 'Manual',
};

function IncidentDetail({ incident, onClose, onUpdate }: { incident: Incident; onClose: () => void; onUpdate: (i: Incident) => void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const setStatus = async (status: string) => {
    const updated = await api.soc.updateIncident(incident._id, { status });
    onUpdate(updated);
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const updated = await api.soc.addIncidentNote(incident._id, note.trim());
      onUpdate(updated);
      setNote('');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase">{TYPE_LABEL[incident.type] || incident.type}</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{incident.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-2">
            {['open', 'investigating', 'resolved', 'false_positive'].map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${incident.status === s ? 'ring-2 ring-offset-1 ring-purple-400' : 'opacity-60 hover:opacity-100'}`}
                style={STATUS_STYLE[s]}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          {incident.relatedIp && <p className="text-sm text-gray-600">IP: <span className="font-mono">{incident.relatedIp}</span></p>}
          {incident.relatedEmail && <p className="text-sm text-gray-600">Related: {incident.relatedEmail}</p>}

          <div className="pt-2">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes</p>
            <div className="space-y-2">
              {incident.notes.length === 0 && <p className="text-sm text-gray-400 italic">No notes yet.</p>}
              {incident.notes.map((n, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-800">{n.author}</span>
                    <span className="text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700">{n.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex items-center gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add an investigation note…"
            onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={addNote} disabled={saving || !note.trim()} className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IncidentsTab() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Incident | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.soc.incidents({ status: status === 'all' ? undefined : status });
      setIncidents(data.incidents || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: (cb: (data: object) => void) => cb({ token: getApiToken() }),
    });
    socket.on('incident_created', () => load());
    socket.on('incident_updated', (updated: Incident) => {
      setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i));
    });
    return () => { socket.disconnect(); };
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {['all', 'open', 'investigating', 'resolved', 'false_positive'].map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${status === s ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <AlertTriangle className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-500">No incidents</p>
            <p className="text-xs text-gray-400 mt-1">Nothing has crossed a detection threshold in this status.</p>
          </div>
        ) : incidents.map(inc => (
          <button key={inc._id} onClick={() => setSelected(inc)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 text-left transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-sm font-semibold text-gray-900 truncate">{inc.title}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={SEVERITY_STYLE[inc.severity]}>{inc.severity}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={STATUS_STYLE[inc.status]}>{inc.status.replace('_', ' ')}</span>
              </div>
              <p className="text-xs text-gray-400">{TYPE_LABEL[inc.type] || inc.type} · {inc.notes.length} note{inc.notes.length !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">{new Date(inc.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </button>
        ))}
      </div>

      {selected && (
        <IncidentDetail incident={selected} onClose={() => setSelected(null)}
          onUpdate={(updated) => { setSelected(updated); setIncidents(prev => prev.map(i => i._id === updated._id ? updated : i)); }} />
      )}
    </div>
  );
}
