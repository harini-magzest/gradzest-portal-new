import { useState, useEffect } from 'react';
import { X, Send, Loader2, UserCircle2, FileDown, Ban, BellOff, Clock } from 'lucide-react';
import { api } from '../../api';
import {
  type Incident, type Analyst, type SlaPolicy, TYPE_LABEL, STATUS_STYLE, RESOLUTION_REASONS, SLA_TONE_STYLE, slaState,
} from './incidentShared';
import { BLOCK_DURATIONS } from './BlockedIpsPanel';
import IncidentContext from './IncidentContext';
import { errorText } from './ui';

const CLOSING = ['resolved', 'false_positive'];

export default function IncidentDetail({ incident, onClose, onUpdate, slaPolicy }: {
  incident: Incident; onClose: () => void; onUpdate: (i: Incident) => void; slaPolicy?: SlaPolicy;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [assigning, setAssigning] = useState(false);
  // Closing an incident asks why, so the outcome is recorded (and false-positive rates mean something).
  const [closing, setClosing] = useState<string | null>(null);
  const [reason, setReason] = useState('benign_activity');
  const [comment, setComment] = useState('');
  const [blockHours, setBlockHours] = useState(24);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.soc.analysts().then(data => setAnalysts(data.analysts || [])).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<any>, okText: string) => {
    setBusy(true); setActionMsg(null);
    try { await fn(); setActionMsg({ text: okText, ok: true }); }
    catch (err: any) { setActionMsg({ text: err.message || 'Action failed', ok: false }); }
    setBusy(false);
  };

  const setStatus = async (status: string) => {
    if (CLOSING.includes(status) && !CLOSING.includes(incident.status)) {
      setClosing(status);
      setReason(status === 'false_positive' ? 'benign_activity' : 'fixed');
      return;
    }
    setClosing(null);
    try { onUpdate(await api.soc.updateIncident(incident._id, { status })); setActionMsg(null); }
    catch (err) { setActionMsg({ text: errorText(err), ok: false }); }
  };

  const confirmClose = async () => {
    if (!closing) return;
    setSaving(true);
    try {
      onUpdate(await api.soc.updateIncident(incident._id, { status: closing, resolutionReason: reason, resolutionComment: comment.trim() }));
      setClosing(null); setComment(''); setActionMsg(null);
    } catch (err) { setActionMsg({ text: errorText(err), ok: false }); }
    finally { setSaving(false); }
  };

  const setAssignee = async (analystId: string) => {
    setAssigning(true);
    try {
      onUpdate(await api.soc.updateIncident(incident._id, { assignedTo: analystId || null })); setActionMsg(null);
    } catch (err) { setActionMsg({ text: errorText(err), ok: false }); }
    finally { setAssigning(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      onUpdate(await api.soc.addIncidentNote(incident._id, note.trim()));
      setNote('');
    } finally { setSaving(false); }
  };

  const sla = slaState(incident, slaPolicy);

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
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {['open', 'investigating', 'resolved', 'false_positive'].map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${incident.status === s ? 'ring-2 ring-offset-1 ring-purple-400' : 'opacity-60 hover:opacity-100'}`}
                style={STATUS_STYLE[s]}>
                {s.replace('_', ' ')}
              </button>
            ))}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ml-auto" style={SLA_TONE_STYLE[sla.tone]}>
              <Clock className="w-3 h-3" />{sla.label}
            </span>
          </div>

          {closing && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">
                Mark as {closing.replace('_', ' ')} — why?
              </p>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="w-full text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500">
                {RESOLUTION_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional comment"
                className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <div className="flex gap-2">
                <button type="button" onClick={confirmClose} disabled={saving}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setClosing(null)} className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {CLOSING.includes(incident.status) && incident.resolutionReason && (
            <p className="text-sm text-gray-600">
              Outcome: <span className="font-medium">{RESOLUTION_REASONS.find(r => r.value === incident.resolutionReason)?.label || incident.resolutionReason}</span>
              {incident.resolutionComment ? <span className="text-gray-400"> — {incident.resolutionComment}</span> : null}
            </p>
          )}
          {incident.relatedIp && <p className="text-sm text-gray-600">IP: <span className="font-mono">{incident.relatedIp}</span></p>}
          {incident.relatedEmail && <p className="text-sm text-gray-600">Related: {incident.relatedEmail}</p>}

          <div className="flex items-center gap-2">
            <UserCircle2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <select value={incident.assignedTo?._id || ''} onChange={e => setAssignee(e.target.value)} disabled={assigning}
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50">
              <option value="">Unassigned</option>
              {analysts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
            {assigning && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
          </div>

          <div className="rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">Actions</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => run(() => api.soc.download(`/incidents/${incident._id}/report.pdf`, `incident-${incident._id}.pdf`), 'Report downloaded.')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 disabled:opacity-50">
                <FileDown className="w-3.5 h-3.5" /> PDF report
              </button>
              {incident.relatedIp && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <button type="button" disabled={busy}
                      onClick={() => run(() => api.soc.blockIp(incident.relatedIp!, `Blocked from incident: ${incident.title}`.slice(0, 200), blockHours || undefined),
                        `${incident.relatedIp} blocked${blockHours ? ` for ${BLOCK_DURATIONS.find(d => d.hours === blockHours)?.label}` : ''}.`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-l-lg text-xs font-semibold text-red-600 disabled:opacity-50">
                      <Ban className="w-3.5 h-3.5" /> Block IP
                    </button>
                    <select value={blockHours} onChange={e => setBlockHours(Number(e.target.value))} aria-label="Block duration"
                      className="text-xs bg-red-50 text-red-600 rounded-r-lg px-1.5 py-[7px] focus:outline-none">
                      {BLOCK_DURATIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
                    </select>
                  </span>
                  <button type="button" disabled={busy}
                    onClick={() => run(() => api.soc.addSuppression({ kind: 'ip', value: incident.relatedIp!, incidentTypes: [incident.type], reason: `Allowlisted from incident: ${incident.title}`.slice(0, 200) }),
                      `Future ${TYPE_LABEL[incident.type] || incident.type} incidents from ${incident.relatedIp} are suppressed.`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 disabled:opacity-50">
                    <BellOff className="w-3.5 h-3.5" /> Suppress this IP
                  </button>
                </>
              )}
            </div>
            {actionMsg && <p className={`text-xs ${actionMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{actionMsg.text}</p>}
          </div>

          <IncidentContext incidentId={incident._id} refreshKey={`${incident.status}|${incident.notes.length}|${incident.assignedTo?._id || ''}`} />

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
          <button onClick={addNote} disabled={saving || !note.trim()} aria-label="Add note" className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
