import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { api } from '../../api';
import { type Incident, TYPE_LABEL, STATUS_STYLE } from './incidentShared';

export default function IncidentDetail({ incident, onClose, onUpdate }: { incident: Incident; onClose: () => void; onUpdate: (i: Incident) => void }) {
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
            <p className="text-xs font-semibold text-gray-400 uppercase flex items-center gap-1.5">
              {TYPE_LABEL[incident.type] || incident.type}
              {incident.stale && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 normal-case">Stale — 14+ days idle</span>}
            </p>
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
