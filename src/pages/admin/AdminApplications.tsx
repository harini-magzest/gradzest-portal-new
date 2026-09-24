import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, RefreshCw, Search, X, ChevronDown, AlertTriangle,
  CheckCircle, Clock, Send, Award, XCircle, BookOpen, Edit2, FileDown,
  Users, Mail, Phone, CalendarDays,
} from 'lucide-react';
import { api } from '../../api';
import StatusBadge from '../../components/StatusBadge';

const ALL_STATUSES = [
  { value: 'draft',          label: 'Draft',          color: 'gray' },
  { value: 'submitted',      label: 'Submitted',      color: 'blue' },
  { value: 'under_review',   label: 'Under Review',   color: 'yellow' },
  { value: 'offer_received', label: 'Offer Received', color: 'green' },
  { value: 'accepted',       label: 'Accepted',       color: 'emerald' },
  { value: 'rejected',       label: 'Rejected',       color: 'red' },
  { value: 'enrolled',       label: 'Enrolled',       color: 'purple' },
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  draft:          <Edit2    className="w-4 h-4" />,
  submitted:      <Send     className="w-4 h-4" />,
  under_review:   <Clock    className="w-4 h-4" />,
  offer_received: <Award    className="w-4 h-4" />,
  accepted:       <CheckCircle className="w-4 h-4" />,
  rejected:       <XCircle  className="w-4 h-4" />,
  enrolled:       <BookOpen className="w-4 h-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  draft:          'bg-gray-100 text-gray-600 border-gray-200',
  submitted:      'bg-purple-100 text-purple-700 border-purple-200',
  under_review:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  offer_received: 'bg-green-100 text-green-700 border-green-200',
  accepted:       'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:       'bg-red-100 text-red-700 border-red-200',
  enrolled:       'bg-purple-100 text-purple-700 border-purple-200',
};

function exportApplicationsToCSV(apps: any[]) {
  const rows = apps.map(a => ({
    'Student Name':    a.studentName        || '',
    'Student Email':   a.studentEmail       || '',
    'Nationality':     a.studentNationality || '',
    'University':      a.universityName     || '',
    'Course':          a.courseName         || '',
    'Intake':          a.intake             || '',
    'Status':          a.status             || '',
    'Submitted Date':  a.submittedDate      || '',
    'Updated Date':    a.updatedDate        || '',
    'Notes':           a.notes              || '',
  }));

  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify((r as Record<string, string>)[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `applications_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Spinner({ size = 4, white = false }: { size?: number; white?: boolean }) {
  return (
    <span className={`w-${size} h-${size} border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'} rounded-full animate-spin inline-block`} />
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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await api.admin.updateApplication(app.studentId, app._id || app.id, { status, offerType: status === 'offer_received' ? offerType : '', notes });
      onUpdated(updated);
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
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900">Update Application Stage</h2>
            <p className="text-xs text-gray-500 mt-0.5">{app.studentName} · {app.universityName}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
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
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 shadow-sm">
            {saving ? <><Spinner size={4} white />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminApplications() {
  const [viewMode, setViewMode] = useState<'applications' | 'subscribers'>('applications');
  const [applications, setApplications] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingApp, setEditingApp] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [apps, subs] = await Promise.all([
        api.admin.applications(),
        api.admin.subscribers(),
      ]);
      setApplications(apps);
      setSubscribers(subs);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data.');
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
        a.courseName?.toLowerCase().includes(search.toLowerCase()) ||
        a.studentEmail?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const ta = new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime();
      return tb - ta;
    });

  const filteredSubs = subscribers.filter(s => {
    const q = subSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q)
    );
  });

  const handleUpdated = (updated: any) => {
    setApplications(prev =>
      prev.map(a =>
        (a._id || a.id) === (updated._id || updated.id) && a.studentId === updated.studentId
          ? { ...a, ...updated }
          : a
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
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">Admin Portal</p>
                <h1 className="text-2xl font-bold leading-tight">Application Reports</h1>
              </div>
            </div>
            <button type="button" onClick={loadData} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setViewMode('applications')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
                ${viewMode === 'applications'
                  ? 'bg-white text-purple-700 border-white shadow-sm'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}>
              <FileText className="w-4 h-4" />
              Applications
            </button>
            <button
              type="button"
              onClick={() => setViewMode('subscribers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
                ${viewMode === 'subscribers'
                  ? 'bg-white text-purple-700 border-white shadow-sm'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}>
              <Users className="w-4 h-4" />
              New Subscribers
              {subscribers.length > 0 && (
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {subscribers.length}
                </span>
              )}
            </button>
          </div>

          {/* Stats strip — only in applications view */}
          {viewMode === 'applications' && (
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
          )}

          {/* Subscriber summary stat */}
          {viewMode === 'subscribers' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="text-3xl font-bold">{loading ? '…' : subscribers.length}</div>
                <div className="text-xs text-white/70 mt-1">Total Registrations</div>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="text-3xl font-bold">
                  {loading ? '…' : subscribers.filter(s => {
                    const d = new Date(s.subscribedAt);
                    const now = new Date();
                    return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                  }).length}
                </div>
                <div className="text-xs text-white/70 mt-1">This Week</div>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="text-3xl font-bold">
                  {loading ? '…' : subscribers.filter(s => s.phone).length}
                </div>
                <div className="text-xs text-white/70 mt-1">With Phone Number</div>
              </div>
            </div>
          )}
        </div>

        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-5">
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

        {/* Applications table */}
        {!loadError && viewMode === 'applications' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50/60 flex-wrap">
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by student, university or course…"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-700"
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
              <button
                type="button"
                onClick={() => exportApplicationsToCSV(filtered)}
                disabled={filtered.length === 0}
                title="Download filtered applications as Excel"
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download Excel
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
                      className="flex items-center gap-4 px-5 py-4 hover:bg-purple-50/30 transition-colors">
                      {/* Student avatar */}
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                        {app.studentName?.charAt(0)}
                      </div>

                      {/* Student info */}
                      <div className="w-36 flex-shrink-0 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{app.studentName}</p>
                        <p className="text-xs text-gray-400 truncate">{app.studentNationality || app.studentEmail}</p>
                      </div>

                      {/* University + course */}
                      <div className="flex-1 min-w-0">
                        <Link to={`/university/${app.universityId}`} className="text-sm font-semibold text-gray-800 hover:text-purple-700 hover:underline truncate block">{app.universityName}</Link>
                        <p className="text-xs text-gray-500 truncate">{app.courseName}</p>
                        {app.intake && <p className="text-xs text-gray-400">{app.intake}</p>}
                      </div>

                      {/* Dates */}
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

                      {/* Notes */}
                      {app.notes && (
                        <div className="hidden xl:block w-32 flex-shrink-0">
                          <p className="text-xs text-gray-400 truncate italic">{app.notes}</p>
                        </div>
                      )}

                      {/* Status badge */}
                      <div className="flex-shrink-0">
                        <StatusBadge status={app.status} />
                      </div>

                      {/* Update button */}
                      <button
                        type="button"
                        onClick={() => setEditingApp(app)}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                          text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-300
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

        {/* New Subscribers list */}
        {!loadError && viewMode === 'subscribers' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-gray-50/60 flex-wrap">
              <div className="relative flex-1 min-w-0 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={subSearch}
                  onChange={e => setSubSearch(e.target.value)}
                  placeholder="Search by name, email or phone…"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {subSearch && (
                <button type="button" onClick={() => setSubSearch('')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" />Clear
                </button>
              )}
              <p className="text-xs text-gray-400 ml-auto">{filteredSubs.length} result{filteredSubs.length !== 1 ? 's' : ''}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
                <Spinner size={5} />
                <span className="text-sm">Loading subscribers…</span>
              </div>
            ) : filteredSubs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">{subSearch ? 'No subscribers match your search.' : 'No registrations yet.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredSubs.map((sub, i) => (
                  <div key={sub._id || sub.email || i}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-purple-50/30 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                      {(sub.name || sub.email || '?').charAt(0).toUpperCase()}
                    </div>

                    {/* Name */}
                    <div className="w-36 flex-shrink-0 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {sub.name || <span className="text-gray-400 italic">No name</span>}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium mt-0.5">
                        <Users className="w-3 h-3" />
                        New Subscriber
                      </span>
                    </div>

                    {/* Email */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <a href={`mailto:${sub.email}`}
                        className="text-sm text-purple-600 hover:text-purple-800 hover:underline truncate transition-colors">
                        {sub.email}
                      </a>
                    </div>

                    {/* Phone */}
                    <div className="hidden sm:flex items-center gap-1.5 w-36 flex-shrink-0">
                      <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-600 truncate">{sub.phone || <span className="text-gray-400 italic">—</span>}</p>
                    </div>

                    {/* Date */}
                    <div className="hidden md:flex items-center gap-1.5 w-32 flex-shrink-0 text-right justify-end">
                      <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-500">
                        {sub.subscribedAt
                          ? new Date(sub.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
