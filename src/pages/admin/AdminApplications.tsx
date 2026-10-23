import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, RefreshCw, Search, X, ChevronDown, AlertTriangle,
  CheckCircle, Clock, Send, Award, XCircle, BookOpen, Edit2, FileDown, Download,
  Users, Mail, Phone, CalendarDays, MessageCircle, Copy, Trash2, StickyNote,
} from 'lucide-react';
import { api, type SubscriberStats } from '../../api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import ListPager from '../../components/ListPager';
import StatusBadge from '../../components/StatusBadge';
import { usePortalName } from '../../hooks/usePortalName';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadApplicationReportPdf } from '../../utils/applicationReportPdf';

// Both lists come from the server a page at a time (server/lib/adminLists.js)
const PAGE_SIZE = 50;

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
  exportRowsToCsv(`applications_export_${new Date().toISOString().slice(0, 10)}.csv`, apps.map(a => ({
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
  })));
}

const LEAD_STATUSES = [
  { value: 'new',            label: 'New',            className: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'contacted',      label: 'Contacted',      className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'interested',     label: 'Interested',     className: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'converted',      label: 'Converted',      className: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'not_interested', label: 'Not Interested', className: 'bg-gray-100 text-gray-600 border-gray-200' },
];

const leadStatusOf = (s: any) => LEAD_STATUSES.find(l => l.value === (s.leadStatus || 'new')) || LEAD_STATUSES[0];

// Normalise a phone number for wa.me links — assumes India (+91) for bare 10-digit numbers.
function whatsappNumber(phone: string) {
  let digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function exportSubscribersToCSV(subs: any[]) {
  exportRowsToCsv(`subscribers_export_${new Date().toISOString().slice(0, 10)}.csv`, subs.map(s => ({
    'Name':          s.name  || '',
    'Email':         s.email || '',
    'Phone':         s.phone || '',
    'Status':        leadStatusOf(s).label,
    'Notes':         s.notes || '',
    'Registered On': s.subscribedAt ? new Date(s.subscribedAt).toISOString().slice(0, 10) : '',
  })));
}

function SubscriberModal({
  sub, onClose, onUpdated,
}: {
  sub: any;
  onClose: () => void;
  onUpdated: (updated: any) => void;
}) {
  const [leadStatus, setLeadStatus] = useState(sub.leadStatus || 'new');
  const [notes, setNotes] = useState(sub.notes || '');
  const [counselors, setCounselors] = useState<{ _id: string; name: string; title?: string }[]>([]);
  const [counselorId, setCounselorId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.tasks.assignees()
      .then(list => setCounselors(list.filter(u => u.dept === 'counselor')))
      .catch(() => { /* assignment section just stays empty */ });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let updated = await api.admin.updateSubscriber(sub._id, { leadStatus, notes });
      if (counselorId) {
        updated = await api.admin.assignSubscriber(sub._id, { counselorId, priority, dueDate, instructions });
      }
      onUpdated(updated);
    } catch (e: any) {
      setError(e.message || 'Failed to update subscriber.');
      setSaving(false);
    }
  };

  return (
    <div role="presentation"
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Follow-up</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{sub.name || 'No name'} · {sub.email}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Lead Status</label>
            <div className="grid grid-cols-2 gap-2">
              {LEAD_STATUSES.map(s => (
                <button key={s.value} type="button" onClick={() => setLeadStatus(s.value)}
                  className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all
                    ${leadStatus === s.value
                      ? `${s.className} shadow-xs ring-2 ring-offset-1 ring-purple-300`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Call outcome, preferred country, intake, budget…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400"
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {sub.assignedToName ? 'Reassign follow-up task' : 'Assign follow-up task to'}
            </label>
            {sub.assignedToName && (
              <p className="text-xs text-gray-500 mb-2">
                Currently assigned to <span className="font-semibold text-gray-700">{sub.assignedToName}</span>
              </p>
            )}
            <div className="relative">
              <select
                value={counselorId}
                onChange={e => setCounselorId(e.target.value)}
                aria-label="Assign to counselor"
                className="w-full appearance-none px-3 py-2.5 pr-8 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white"
              >
                <option value="">Don't assign</option>
                {counselors.map(c => (
                  <option key={c._id} value={c._id}>{c.name}{c.title ? ` — ${c.title}` : ''}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {counselorId && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Task priority"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white">
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Due date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Due date"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
                <textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={2}
                  placeholder="Instructions for the counselor (optional)…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400"
                />
                <p className="text-xs text-gray-400">The subscriber's contact details and notes are included in the task automatically.</p>
              </div>
            )}
          </div>

          {sub.contactedAt && (
            <p className="text-xs text-gray-400">
              Last updated {new Date(sub.contactedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 shadow-xs">
            {saving ? <><Spinner size={4} white />Saving…</> : counselorId ? 'Save & Assign' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
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
    <div role="presentation"
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
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
                      ? `${STATUS_COLORS[s.value]} border-current shadow-xs ring-2 ring-offset-1 ring-current/30`
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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white"
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
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400"
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
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 shadow-xs">
            {saving ? <><Spinner size={4} white />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminApplications() {
  const { portal } = usePortalName();
  const [viewMode, setViewMode] = useState<'applications' | 'subscribers'>('applications');
  const navigate = useNavigate();
  // This page of each list, how many match, and the counts the tiles show (over everything, whatever the filter)
  const [applications, setApplications] = useState<any[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [appStatusTotals, setAppStatusTotals] = useState<Record<string, number>>({});
  const [appPage, setAppPage] = useState(1);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subStats, setSubStats] = useState<SubscriberStats>({ total: 0, thisWeek: 0, withPhone: 0, unread: 0 });
  const [subStatusTotals, setSubStatusTotals] = useState<Record<string, number>>({});
  const [subPage, setSubPage] = useState(1);
  const [unreadSubs, setUnreadSubs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingApp, setEditingApp] = useState<any>(null);
  const [subStatusFilter, setSubStatusFilter] = useState('all');
  const [subDateFilter, setSubDateFilter] = useState<'all' | '7' | '30'>('all');
  const [editingSub, setEditingSub] = useState<any>(null);
  const [copiedId, setCopiedId] = useState('');
  const [deletingId, setDeletingId] = useState('');

  // The filters as the server reads them; typing in a search box asks once the typing pauses
  const appSearch = useDebouncedValue(search.trim());
  const subSearchText = useDebouncedValue(subSearch.trim());
  const appQuery = useMemo(() => ({ q: appSearch, status: statusFilter === 'all' ? undefined : statusFilter }), [appSearch, statusFilter]);
  const subQuery = useMemo(() => ({
    q: subSearchText,
    leadStatus: subStatusFilter === 'all' ? undefined : subStatusFilter,
    days: subDateFilter === 'all' ? undefined : subDateFilter,
  }), [subSearchText, subStatusFilter, subDateFilter]);
  useEffect(() => { setAppPage(1); }, [appQuery]);
  useEffect(() => { setSubPage(1); }, [subQuery]);

  // Only the newest request may fill a list, however the answers arrive
  const latestApps = useRef(0);
  const loadApps = useCallback(async () => {
    const request = ++latestApps.current;
    try {
      const res = await api.admin.applicationsPage({ ...appQuery, page: appPage, limit: PAGE_SIZE });
      if (request !== latestApps.current) return;
      setApplications(res.items); setAppTotal(res.total); setAppStatusTotals(res.statusCounts);
    } catch (err: any) {
      if (request === latestApps.current) setLoadError(err.message || 'Failed to load data.');
    }
  }, [appQuery, appPage]);

  const latestSubs = useRef(0);
  const loadSubs = useCallback(async () => {
    const request = ++latestSubs.current;
    // "This week" starts at local midnight seven days ago
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    try {
      const res = await api.admin.subscribersPage({ ...subQuery, page: subPage, limit: PAGE_SIZE, weekStart });
      if (request !== latestSubs.current) return;
      setSubscribers(res.items); setSubTotal(res.total); setSubStats(res.stats); setSubStatusTotals(res.statusCounts);
      setUnreadSubs(res.stats.unread);
    } catch (err: any) {
      if (request === latestSubs.current) setLoadError(err.message || 'Failed to load data.');
    }
  }, [subQuery, subPage]);

  // First load, Refresh and Retry: both lists, behind the loading spinner
  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    await Promise.all([loadApps(), loadSubs()]);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens; pages and filters load below
  useEffect(() => { loadData(); }, []);
  // A new page or filter: fetch it, keeping the list on screen meanwhile
  const firstApps = useRef(true);
  useEffect(() => { if (firstApps.current) { firstApps.current = false; return; } loadApps(); }, [loadApps]);
  const firstSubs = useRef(true);
  useEffect(() => { if (firstSubs.current) { firstSubs.current = false; return; } loadSubs(); }, [loadSubs]);

  // Opening the New Subscribers tab marks everything in it as read
  useEffect(() => {
    if (viewMode !== 'subscribers' || unreadSubs === 0) return;
    setUnreadSubs(0);
    api.admin.markSubscribersSeen().catch(() => { /* badge reappears on next load if this failed */ });
  }, [viewMode, unreadSubs]);

  const statusCounts = ALL_STATUSES.map(s => ({ ...s, count: appStatusTotals[s.value] || 0 }));
  const allApplications = Object.values(appStatusTotals).reduce((sum, n) => sum + n, 0);

  // Open a student's profile, passing the students behind every match, in list order, so ‹ › can step through them.
  // A click that opens a new tab just follows the link.
  const openStudent = async (e: React.MouseEvent, studentId: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    let ids = [...new Set(applications.map(a => String(a.studentId)))];
    if (appTotal > applications.length) {
      try { ids = (await api.admin.applicationStudentIds(appQuery)).ids; } catch { /* this page's students only */ }
    }
    navigate(`/admin/students/${studentId}`, { state: { ids } });
  };
  // This page's students, for a profile opened in a new tab
  const studentNav = { ids: [...new Set(applications.map(a => String(a.studentId)))] };

  const subStatusCounts = LEAD_STATUSES.map(l => ({ ...l, count: subStatusTotals[l.value] || 0 }));

  // Every match, not just this page
  const exportApplications = async () => {
    try { exportApplicationsToCSV((await api.admin.applicationsExport(appQuery)).items); }
    catch { alert('Failed to export applications.'); }
  };
  const exportSubscribers = async () => {
    try { exportSubscribersToCSV((await api.admin.subscribersExport(subQuery)).items); }
    catch { alert('Failed to export subscribers.'); }
  };

  const handleSubUpdated = (updated: any) => {
    setSubscribers(prev => prev.map(s => (s._id === updated._id ? updated : s)));
    setEditingSub(null);
    loadSubs();
  };

  const handleQuickStatus = async (sub: any, leadStatus: string) => {
    try {
      const updated = await api.admin.updateSubscriber(sub._id, { leadStatus });
      setSubscribers(prev => prev.map(s => (s._id === updated._id ? updated : s)));
      loadSubs();
    } catch (e: any) {
      alert(e.message || 'Failed to update status.');
    }
  };

  const handleDeleteSub = async (sub: any) => {
    if (!confirm(`Delete subscriber ${sub.name || sub.email}? This cannot be undone.`)) return;
    setDeletingId(sub._id);
    try {
      await api.admin.deleteSubscriber(sub._id);
      setSubscribers(prev => prev.filter(s => s._id !== sub._id));
      loadSubs();
    } catch (e: any) {
      alert(e.message || 'Failed to delete subscriber.');
    }
    setDeletingId('');
  };

  const handleCopy = async (sub: any) => {
    try {
      await navigator.clipboard.writeText(sub.email);
      setCopiedId(sub._id);
      setTimeout(() => setCopiedId(''), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const handleUpdated = (updated: any) => {
    setApplications(prev =>
      prev.map(a =>
        (a._id || a.id) === (updated._id || updated.id) && a.studentId === updated.studentId
          ? { ...a, ...updated }
          : a
      )
    );
    loadApps(); // the counts, and whether it still matches the filter
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
      {editingSub && (
        <SubscriberModal
          sub={editingSub}
          onClose={() => setEditingSub(null)}
          onUpdated={handleSubUpdated}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="bg-linear-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-xs">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
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
                  ? 'bg-white text-purple-700 border-white shadow-xs'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}>
              <FileText className="w-4 h-4" />
              Applications
            </button>
            <button
              type="button"
              onClick={() => setViewMode('subscribers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
                ${viewMode === 'subscribers'
                  ? 'bg-white text-purple-700 border-white shadow-xs'
                  : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}>
              <Users className="w-4 h-4" />
              New Subscribers
              {unreadSubs > 0 && (
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none"
                  title={`${unreadSubs} new since you last looked`}>
                  {unreadSubs}
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
                <div className="text-3xl font-bold">{loading ? '…' : subStats.total}</div>
                <div className="text-xs text-white/70 mt-1">Total Registrations</div>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="text-3xl font-bold">
                  {loading ? '…' : subStats.thisWeek}
                </div>
                <div className="text-xs text-white/70 mt-1">This Week</div>
              </div>
              <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                <div className="text-3xl font-bold">
                  {loading ? '…' : subStats.withPhone}
                </div>
                <div className="text-xs text-white/70 mt-1">With Phone Number</div>
              </div>
            </div>
          )}
          {viewMode === 'subscribers' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
              {subStatusCounts.map(s => (
                <button key={s.value} type="button"
                  onClick={() => setSubStatusFilter(prev => prev === s.value ? 'all' : s.value)}
                  className={`rounded-xl p-3 text-center transition-all border
                    ${subStatusFilter === s.value
                      ? 'bg-white/30 border-white/60 shadow-inner'
                      : 'bg-white/10 border-white/20 hover:bg-white/20'}`}>
                  <div className="text-2xl font-bold">{loading ? '…' : s.count}</div>
                  <div className="text-xs text-white/70 mt-0.5 leading-tight">{s.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-5">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
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
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-gray-700"
                >
                  <option value="all">All Statuses ({allApplications})</option>
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
              <p className="text-xs text-gray-400 ml-auto">{appTotal} result{appTotal !== 1 ? 's' : ''}</p>
              <button
                type="button"
                onClick={exportApplications}
                disabled={appTotal === 0}
                title="Download filtered applications as Excel"
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
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
            ) : applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">{search || statusFilter !== 'all' ? 'No applications match your filter.' : 'No applications found.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {applications.map(app => {
                  const appId = app._id || app.id;
                  return (
                    <div key={`${app.studentId}-${appId}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-purple-50/30 transition-colors">
                      {/* Student avatar */}
                      <div className="w-10 h-10 bg-linear-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                        {app.studentName?.charAt(0)}
                      </div>

                      {/* Student info */}
                      <div className="w-36 shrink-0 min-w-0">
                        <Link to={`/admin/students/${app.studentId}`} state={studentNav} onClick={e => openStudent(e, String(app.studentId))} title="Open student profile"
                          className="text-sm font-semibold text-gray-900 hover:text-purple-700 hover:underline truncate block">{app.studentName}</Link>
                        <p className="text-xs text-gray-400 truncate">{app.studentNationality || app.studentEmail}</p>
                      </div>

                      {/* University + course */}
                      <div className="flex-1 min-w-0">
                        <Link to={`/university/${app.universityId}`} className="text-sm font-semibold text-gray-800 hover:text-purple-700 hover:underline truncate block">{app.universityName}</Link>
                        <p className="text-xs text-gray-500 truncate">{app.courseName}</p>
                        {app.intake && <p className="text-xs text-gray-400">{app.intake}</p>}
                      </div>

                      {/* Dates */}
                      <div className="hidden lg:block text-right shrink-0 w-24">
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
                        <div className="hidden xl:block w-32 shrink-0">
                          <p className="text-xs text-gray-400 truncate italic">{app.notes}</p>
                        </div>
                      )}

                      {/* Status badge */}
                      <div className="shrink-0">
                        <StatusBadge status={app.status} />
                      </div>

                      {/* Download report */}
                      <button
                        type="button"
                        onClick={() => downloadApplicationReportPdf(app)}
                        title="Download application report PDF"
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-purple-700 active:scale-95 transition-all">
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {/* Update button */}
                      <button
                        type="button"
                        onClick={() => setEditingApp(app)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
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
            <ListPager page={appPage} total={appTotal} pageSize={PAGE_SIZE} onPage={setAppPage} />
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
                  placeholder="Search by name, email, phone or notes…"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="relative">
                <select
                  value={subStatusFilter}
                  onChange={e => setSubStatusFilter(e.target.value)}
                  aria-label="Filter by lead status"
                  className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-gray-700"
                >
                  <option value="all">All Statuses ({subStats.total})</option>
                  {subStatusCounts.map(s => (
                    <option key={s.value} value={s.value}>{s.label} ({s.count})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={subDateFilter}
                  onChange={e => setSubDateFilter(e.target.value as 'all' | '7' | '30')}
                  aria-label="Filter by registration date"
                  className="appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500 text-gray-700"
                >
                  <option value="all">All time</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {(subSearch || subStatusFilter !== 'all' || subDateFilter !== 'all') && (
                <button type="button" onClick={() => { setSubSearch(''); setSubStatusFilter('all'); setSubDateFilter('all'); }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" />Clear
                </button>
              )}
              <p className="text-xs text-gray-400 ml-auto">{subTotal} result{subTotal !== 1 ? 's' : ''}</p>
              <button
                type="button"
                onClick={exportSubscribers}
                disabled={subTotal === 0}
                title="Download filtered subscribers as Excel"
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download Excel
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
                <Spinner size={5} />
                <span className="text-sm">Loading subscribers…</span>
              </div>
            ) : subscribers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">{subSearch ? 'No subscribers match your search.' : 'No registrations yet.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {subscribers.map((sub, i) => (
                  <div key={sub._id || sub.email || i}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-purple-50/30 transition-colors">
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-linear-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
                      {(sub.name || sub.email || '?').charAt(0).toUpperCase()}
                    </div>

                    {/* Name */}
                    <div className="w-36 shrink-0 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {sub.name || <span className="text-gray-400 italic">No name</span>}
                      </p>
                      <select
                        value={sub.leadStatus || 'new'}
                        onChange={e => handleQuickStatus(sub, e.target.value)}
                        aria-label="Lead status"
                        className={`mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-purple-400 ${leadStatusOf(sub).className}`}
                      >
                        {LEAD_STATUSES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>

                    {/* Email + notes */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <a href={`mailto:${sub.email}`}
                          className="text-sm text-purple-600 hover:text-purple-800 hover:underline truncate transition-colors">
                          {sub.email}
                        </a>
                      </div>
                      {sub.assignedToName && (
                        <p className="flex items-center gap-1.5 text-xs text-indigo-600 truncate mt-1">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Assigned to {sub.assignedToName}</span>
                        </p>
                      )}
                      {sub.notes && (
                        <p className="flex items-center gap-1.5 text-xs text-gray-400 italic truncate mt-1">
                          <StickyNote className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{sub.notes}</span>
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="hidden sm:flex items-center gap-1.5 w-36 shrink-0">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <p className="text-sm text-gray-600 truncate">{sub.phone || <span className="text-gray-400 italic">—</span>}</p>
                    </div>

                    {/* Date */}
                    <div className="hidden md:flex items-center gap-1.5 w-32 shrink-0 text-right justify-end">
                      <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                      <p className="text-xs text-gray-500">
                        {sub.subscribedAt
                          ? new Date(sub.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {sub.phone && (
                        <>
                          <a href={`tel:${sub.phone}`} title="Call"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                            <Phone className="w-4 h-4" />
                          </a>
                          <a href={`https://wa.me/${whatsappNumber(sub.phone)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600 transition-colors">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        </>
                      )}
                      <button type="button" onClick={() => handleCopy(sub)} title={copiedId === sub._id ? 'Copied!' : 'Copy email'}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                        {copiedId === sub._id ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={() => setEditingSub(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                          text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-300
                          active:scale-95 transition-all">
                        <Edit2 className="w-3.5 h-3.5" />
                        Follow-up
                      </button>
                      <button type="button" onClick={() => handleDeleteSub(sub)} disabled={deletingId === sub._id} title="Delete"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                        {deletingId === sub._id ? <Spinner size={4} /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <ListPager page={subPage} total={subTotal} pageSize={PAGE_SIZE} onPage={setSubPage} />
          </div>
        )}
      </div>
    </>
  );
}
