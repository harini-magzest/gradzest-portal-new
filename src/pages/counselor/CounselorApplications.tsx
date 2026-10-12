import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, RefreshCw, Search, X, ChevronDown, AlertTriangle,
  CheckCircle, Clock, Send, Award, XCircle, BookOpen, Edit2,
  GraduationCap, Plus, Trash2, ChevronUp, ArrowRight, Download, FileDown,
} from 'lucide-react';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';
import { usePortalName } from '../../hooks/usePortalName';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadApplicationReportPdf } from '../../utils/applicationReportPdf';

const ALL_STATUSES = [
  { value: 'draft',          label: 'Draft' },
  { value: 'submitted',      label: 'Submitted' },
  { value: 'under_review',   label: 'Under Review' },
  { value: 'offer_received', label: 'Offer Received' },
  { value: 'accepted',       label: 'Accepted' },
  { value: 'rejected',       label: 'Rejected' },
  { value: 'enrolled',       label: 'Enrolled' },
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:          <Edit2       className="w-4 h-4" />,
  submitted:      <Send        className="w-4 h-4" />,
  under_review:   <Clock       className="w-4 h-4" />,
  offer_received: <Award       className="w-4 h-4" />,
  accepted:       <CheckCircle className="w-4 h-4" />,
  rejected:       <XCircle     className="w-4 h-4" />,
  enrolled:       <BookOpen    className="w-4 h-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-600 border-gray-200',
  submitted:      'bg-blue-100 text-blue-700 border-blue-200',
  under_review:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  offer_received: 'bg-green-100 text-green-700 border-green-200',
  accepted:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:       'bg-red-100 text-red-700 border-red-200',
  enrolled:       'bg-purple-100 text-purple-700 border-purple-200',
};

const ACADEMIC_LEVELS = [
  'School (10th)',
  'Intermediate (12th)',
  "Diploma",
  "Bachelor's",
  "Master's",
  'PhD',
  'Other',
];

type AcademicEntry = {
  id: string;
  level: string;
  institution: string;
  board: string;
  year: string;
  score: string;
};

function newEntry(): AcademicEntry {
  return { id: crypto.randomUUID(), level: "School (10th)", institution: '', board: '', year: '', score: '' };
}

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return (
    <span
      className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-green-600'} rounded-full animate-spin inline-block`}
    />
  );
}

function UpdateStatusModal({
  app, onClose, onUpdated,
}: {
  app: any;
  onClose: () => void;
  onUpdated: (updated: any) => void;
}) {
  const [status, setStatus] = useState(app.status);
  const [offerType, setOfferType] = useState(app.offerType || '');
  const [notes, setNotes] = useState(app.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [comments, setComments] = useState<any[]>(app.comments || []);
  const [academicDetails, setAcademicDetails] = useState<AcademicEntry[]>(
    (app.academicDetails || []).map((e: any) => ({ ...e, id: e.id || crypto.randomUUID() }))
  );
  const [showAcademic, setShowAcademic] = useState((app.academicDetails?.length || 0) > 0);

  const addEntry = () => {
    const taken = new Set(academicDetails.map(e => e.level));
    const next = ACADEMIC_LEVELS.find(l => !taken.has(l)) || 'Other';
    setAcademicDetails(prev => [...prev, { ...newEntry(), level: next }]);
    setShowAcademic(true);
  };

  const updateEntry = (id: string, field: keyof AcademicEntry, value: string) => {
    setAcademicDetails(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEntry = (id: string) => {
    setAcademicDetails(prev => prev.filter(e => e.id !== id));
  };

  const submitReply = async () => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      const appId = app._id || app.id;
      const updated = await api.applications.addComment(appId, replyText.trim());
      setComments(updated.comments || []);
      setReplyText('');
      onUpdated({ ...app, ...updated });
    } catch {}
    setReplying(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const appId = app._id || app.id;
      const payload = { status, offerType: status === 'offer_received' ? offerType : '', notes, academicDetails: academicDetails.map(({ id, ...rest }) => rest) };
      const updated = await api.applications.update(appId, payload);
      onUpdated({ ...app, ...updated, ...payload });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to update application.');
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Update Application Stage</h2>
            <p className="text-xs text-gray-500 mt-0.5">{app.studentName} · {app.universityName}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Course</p>
            <p className="text-sm font-semibold text-gray-800">{app.courseName}</p>
            {app.intake && <p className="text-xs text-gray-400">{app.intake}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Application Stage</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_STATUSES.map(s => (
                <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${status === s.value
                      ? `${STATUS_COLORS[s.value]} border-current shadow-sm ring-2 ring-offset-1 ring-current/30`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                  {STATUS_ICONS[s.value]}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {status === 'offer_received' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Offer Type</label>
              <select
                value={offerType}
                onChange={e => setOfferType(e.target.value)}
                aria-label="Offer type"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
              >
                <option value="">Select offer type…</option>
                <option value="Normal Offer">Normal Offer</option>
                <option value="University Conditional Offer">University Conditional Offer</option>
                <option value="CAS Conditional Offer">CAS Conditional Offer</option>
                <option value="Unconditional Offer">Unconditional Offer</option>
                <option value="Scholarship Conditional Offer">Scholarship Conditional Offer</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add a note about this status update…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none placeholder:text-gray-400"
            />
          </div>

          {/* Academic Details */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setShowAcademic(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-green-700 transition-colors"
              >
                <GraduationCap className="w-4 h-4 text-green-600" />
                Academic Details
                {academicDetails.length > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{academicDetails.length}</span>
                )}
                {showAcademic ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>
              <button
                type="button"
                onClick={addEntry}
                className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </button>
            </div>

            {showAcademic && (
              <div className="space-y-3">
                {academicDetails.length === 0 && (
                  <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No academic entries yet.</p>
                    <button type="button" onClick={addEntry}
                      className="mt-2 text-xs text-green-600 hover:text-green-700 font-semibold">
                      + Add first entry
                    </button>
                  </div>
                )}
                {academicDetails.map((entry, idx) => (
                  <div key={entry.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        {idx + 1}. {entry.level}
                      </span>
                      <button type="button" onClick={() => removeEntry(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Remove entry">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Level</label>
                      <select
                        value={entry.level}
                        onChange={e => updateEntry(entry.id, 'level', e.target.value)}
                        aria-label="Education level"
                        className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        {ACADEMIC_LEVELS.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Institution Name</label>
                        <input
                          value={entry.institution}
                          onChange={e => updateEntry(entry.id, 'institution', e.target.value)}
                          placeholder="e.g. St. Joseph's School"
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Board / University</label>
                        <input
                          value={entry.board}
                          onChange={e => updateEntry(entry.id, 'board', e.target.value)}
                          placeholder="e.g. CBSE, Pune Univ."
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Year of Passing</label>
                        <input
                          value={entry.year}
                          onChange={e => updateEntry(entry.id, 'year', e.target.value)}
                          placeholder="e.g. 2022"
                          maxLength={4}
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Score / GPA</label>
                        <input
                          value={entry.score}
                          onChange={e => updateEntry(entry.id, 'score', e.target.value)}
                          placeholder="e.g. 88% or 7.8 GPA"
                          className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments thread */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              Student Messages
              {comments.length > 0 && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{comments.length}</span>
              )}
            </p>
            {comments.length > 0 ? (
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto bg-gray-50 rounded-xl p-3">
                {comments.map((c: any, i: number) => (
                  <div key={i} className={`flex ${c.authorRole === 'counselor' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      c.authorRole === 'counselor'
                        ? 'bg-green-600 text-white rounded-br-none'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                    }`}>
                      <p className={`font-semibold mb-0.5 ${c.authorRole === 'counselor' ? 'text-blue-200' : 'text-blue-600'}`}>
                        {c.authorRole === 'student' ? `${c.author} · Student` : 'You'}
                      </p>
                      <p>{c.text}</p>
                      {c.createdAt && (
                        <p className={`text-[10px] mt-1 ${c.authorRole === 'counselor' ? 'text-blue-300' : 'text-gray-400'}`}>
                          {new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">No student questions yet.</p>
            )}
            <div className="flex gap-2">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
                placeholder="Reply to student…"
                disabled={replying}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600 placeholder:text-gray-400"
              />
              <button type="button" onClick={submitReply} disabled={replying || !replyText.trim()}
                aria-label="Send reply"
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
                <Send className="w-3.5 h-3.5" /> Reply
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 shadow-sm">
            {saving ? <><Spinner size={4} white />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CounselorApplications() {
  const { portal } = usePortalName();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingApp, setEditingApp] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await api.applications.list();
      setApplications(data);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load applications.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const statusCounts = ALL_STATUSES.map(s => ({
    ...s,
    count: applications.filter(a => a.status === s.value).length,
  }));

  const filtered = applications
    .filter(a => {
      const matchesSearch =
        a.studentName?.toLowerCase().includes(search.toLowerCase()) ||
        a.universityName?.toLowerCase().includes(search.toLowerCase()) ||
        a.courseName?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const ta = new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime();
      return tb - ta;
    });

  const handleExport = () => {
    exportRowsToCsv(`applications_export_${new Date().toISOString().slice(0, 10)}.csv`, filtered.map(a => ({
      'Student Name': a.studentName || '', 'Student Email': a.studentEmail || '',
      University: a.universityName || '', Course: a.courseName || '', Intake: a.intake || '',
      Status: a.status || '', 'Submitted Date': a.submittedDate || '', 'Updated Date': a.updatedDate || '',
      Notes: a.notes || '',
    })));
  };

  // Unique students in the visible order, so the profile's arrows step through them
  const studentNav = { ids: [...new Set(filtered.map(a => String(a.studentId)))] };

  const handleUpdated = (updated: any) => {
    setApplications(prev =>
      prev.map(a =>
        (a._id || a.id) === (updated._id || updated.id) ? { ...a, ...updated } : a
      )
    );
  };

  return (
    <>
      {editingApp && (
        <UpdateStatusModal
          app={editingApp}
          onClose={() => setEditingApp(null)}
          onUpdated={updated => { handleUpdated(updated); setEditingApp(null); }}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="bg-green-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-green-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
                <h1 className="text-2xl font-bold leading-tight">Student Applications</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/counselor/learning"
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">
                <GraduationCap className="w-4 h-4" /> Learning Hub
              </Link>
              <button type="button" onClick={loadData} disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {statusCounts.map(s => (
              <button key={s.value} type="button"
                onClick={() => setStatusFilter(prev => prev === s.value ? 'all' : s.value)}
                className={`rounded-xl p-3 text-center transition-all border
                  ${statusFilter === s.value
                    ? 'bg-white/30 border-white/60 shadow-inner'
                    : 'bg-white/10 border-white/20 hover:bg-white/20'}`}>
                <div className="text-2xl font-bold">{loading ? '…' : s.count}</div>
                <div className="text-xs text-white/70 mt-0.5 leading-tight">{s.label}</div>
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Failed to load</p>
              <p className="text-xs text-red-600 mt-0.5">{loadError}</p>
            </div>
            <button type="button" onClick={loadData}
              className="text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors">
              Retry
            </button>
          </div>
        )}

        {!loadError && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60 flex-wrap">
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by student, university or course…"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-700"
                >
                  <option value="all">All Statuses ({applications.length})</option>
                  {ALL_STATUSES.map(s => (
                    <option key={s.value} value={s.value}>
                      {s.label} ({statusCounts.find(c => c.value === s.value)?.count ?? 0})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {(search || statusFilter !== 'all') && (
                <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" />Clear
                </button>
              )}
              <p className="text-xs text-gray-400 ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
              <button type="button" onClick={handleExport} disabled={filtered.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <FileDown className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
                <Spinner size={5} />
                <span className="text-sm">Loading applications…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">{search || statusFilter !== 'all' ? 'No applications match your filter.' : 'No applications found.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(app => {
                  const appId = app._id || app.id;
                  return (
                    <div key={`${app.studentId}-${appId}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-green-50/40 transition-colors">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {app.studentName?.charAt(0)}
                      </div>

                      <div className="w-36 flex-shrink-0 min-w-0">
                        <Link to={`/counselor/students/${app.studentId}?tab=applications`} state={studentNav} title="Open student profile"
                          className="text-sm font-semibold text-gray-900 hover:text-green-700 hover:underline truncate block">{app.studentName}</Link>
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link to={`/university/${app.universityId}`} className="text-sm font-semibold text-gray-800 hover:text-green-700 hover:underline truncate block">{app.universityName}</Link>
                        <p className="text-xs text-gray-500 truncate">{app.courseName}</p>
                        {app.intake && <p className="text-xs text-gray-400">{app.intake}</p>}
                      </div>

                      <div className="hidden lg:block text-right flex-shrink-0 w-24">
                        {app.submittedDate && (
                          <>
                            <p className="text-xs text-gray-400">Submitted</p>
                            <p className="text-xs font-medium text-gray-600">{app.submittedDate}</p>
                          </>
                        )}
                        {app.updatedDate && app.updatedDate !== app.submittedDate && (
                          <>
                            <p className="text-xs text-gray-400 mt-1">Updated</p>
                            <p className="text-xs font-medium text-gray-600">{app.updatedDate}</p>
                          </>
                        )}
                      </div>

                      {app.notes && (
                        <div className="hidden xl:block w-32 flex-shrink-0">
                          <p className="text-xs text-gray-400 truncate italic">{app.notes}</p>
                        </div>
                      )}

                      <div className="flex-shrink-0">
                        <StatusBadge status={app.status} />
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadApplicationReportPdf(app)}
                        title="Download application report PDF"
                        className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-green-700 active:scale-95 transition-all">
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingApp(app)}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                          text-green-800 bg-green-50 border border-green-200 hover:bg-green-100 hover:border-green-300
                          active:scale-95 transition-all">
                        <Edit2 className="w-3.5 h-3.5" />
                        Update
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
