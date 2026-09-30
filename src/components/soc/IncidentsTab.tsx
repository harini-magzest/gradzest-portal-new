import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AlertTriangle } from 'lucide-react';
import { api, getApiToken } from '../../api';
import { type Incident, SEVERITY_STYLE, STATUS_STYLE, TYPE_LABEL } from './incidentShared';
import IncidentDetail from './IncidentDetail';

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
                {inc.stale && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-100 text-gray-500">Stale</span>}
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
