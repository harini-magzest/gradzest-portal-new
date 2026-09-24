import { uploadUrl } from '../../utils/uploadUrl';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import {
  Search, X, ChevronRight, Download, FileText,
  User, UserCog, Layers, Calendar, Clock,
  CheckCircle, AlertCircle, BookOpen, Globe, DollarSign, MessageCircle,
} from 'lucide-react';

const STATUSES = [
  { key: 'draft',          label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-300',  dot: 'bg-gray-400',   ring: 'ring-gray-300' },
  { key: 'submitted',      label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-300',  dot: 'bg-blue-500',   ring: 'ring-blue-300' },
  { key: 'under_review',   label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-300', dot: 'bg-amber-500',  ring: 'ring-amber-300' },
  { key: 'offer_received', label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-300',dot: 'bg-purple-500', ring: 'ring-purple-300' },
  { key: 'accepted',       label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-300', dot: 'bg-green-500',  ring: 'ring-green-300' },
  { key: 'rejected',       label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-300',   dot: 'bg-red-500',    ring: 'ring-red-300' },
  { key: 'enrolled',       label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-300',dot: 'bg-indigo-500', ring: 'ring-indigo-300' },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));

const DOC_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: 'text-amber-700',  bg: 'bg-amber-100' },
  verified: { label: 'Verified', color: 'text-green-700',  bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-700',    bg: 'bg-red-100' },
  approved: { label: 'Approved', color: 'text-green-700',  bg: 'bg-green-100' },
  uploaded: { label: 'Uploaded', color: 'text-blue-700',   bg: 'bg-blue-100' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Avi({ name, className = 'w-8 h-8', bg = 'bg-orange-500' }: { name?: string; className?: string; bg?: string }) {
  return (
    <div className={`${className} ${bg} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | number }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
        <p className="text-sm text-gray-800 font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <Icon className="w-4 h-4 text-orange-500" />
        <h4 className="text-sm font-bold text-gray-800">{title}</h4>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function AppDashboard() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [counselorFilter, setCounselorFilter] = useState('all');

  const [draftStatus, setDraftStatus] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    Promise.all([api.admin.applications(), api.admin.students(), api.admin.counselors()])
      .then(([a, s, c]) => { setApps(a); setStudents(s); setCounselors(c); })
      .finally(() => setLoading(false));
  }, []);

  const studentMap = useMemo(() => {
    const m: Record<string, any> = {};
    students.forEach(s => { m[s._id] = s; });
    return m;
  }, [students]);

  const counselorMap = useMemo(() => {
    const m: Record<string, any> = {};
    counselors.forEach(c => { m[c._id] = c; });
    return m;
  }, [counselors]);

  const enriched = useMemo(() => apps.map(app => {
    const student = studentMap[app.studentId];
    const counselorId = student?.counselorId?._id || student?.counselorId;
    const counselor = counselorId ? counselorMap[counselorId] : null;
    return { ...app, _student: student, _counselor: counselor };
  }), [apps, studentMap, counselorMap]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { all: enriched.length };
    STATUSES.forEach(s => { counts[s.key] = 0; });
    enriched.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(app => {
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (counselorFilter !== 'all' && (app._counselor?._id !== counselorFilter)) return false;
      if (q) {
        const haystack = [
          app._student?.name, app._student?.email, app._student?.nationality,
          app.universityName, app.courseName, app.intake, app._counselor?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime());
  }, [enriched, search, statusFilter, counselorFilter]);

  const handleSelect = useCallback(async (app: any) => {
    setSelected(app);
    setDraftStatus(app.status);
    setDraftNotes(app.notes || app.processingNotes || '');
    setSaveSuccess(false);
    setSelectedStudent(null);
    setLoadingDetail(true);
    try {
      const full = await api.students.get(app.studentId);
      setSelectedStudent(full);
    } catch {
      setSelectedStudent(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.admin.updateApplication(selected.studentId, selected._id, {
        status: draftStatus,
        notes: draftNotes,
      });
      setApps(prev => prev.map(a =>
        a._id === selected._id ? { ...a, status: draftStatus, notes: draftNotes } : a
      ));
      setSelected((prev: any) => ({ ...prev, status: draftStatus, notes: draftNotes }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-64px)]">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Main panel */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${selected ? 'hidden lg:flex' : 'flex'}`}>

        {/* Page header */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Application Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5">Track and manage all applications, students, and counselors</p>
            </div>
            <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full">
              {filtered.length} of {enriched.length} applications
            </span>
          </div>

          {/* Stat cards */}
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {/* Total */}
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-shrink-0 flex flex-col items-center px-5 py-3 rounded-xl border-2 transition-all cursor-pointer min-w-[90px] ${
                statusFilter === 'all'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-orange-300'
              }`}
            >
              <span className={`text-2xl font-bold ${statusFilter === 'all' ? 'text-orange-600' : 'text-gray-800'}`}>{stats.all}</span>
              <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === 'all' ? 'text-orange-500' : 'text-gray-500'}`}>All</span>
            </button>

            {STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
                className={`flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-xl border-2 transition-all cursor-pointer min-w-[90px] ${
                  statusFilter === s.key
                    ? `border-current ${s.bg}`
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${statusFilter === s.key ? s.color : ''}`}
              >
                <span className={`text-2xl font-bold ${statusFilter === s.key ? s.color : 'text-gray-800'}`}>{stats[s.key] || 0}</span>
                <span className={`text-[10px] font-semibold mt-0.5 ${statusFilter === s.key ? s.color : 'text-gray-500'}`}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search student, university, course..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>
          <select
            value={counselorFilter}
            onChange={e => setCounselorFilter(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
          >
            <option value="all">All Counselors</option>
            {counselors.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          {(search || statusFilter !== 'all' || counselorFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setCounselorFilter('all'); }}
              className="text-xs text-orange-600 font-semibold hover:underline flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Layers className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-gray-500 text-sm font-medium">No applications match your filters</p>
              <p className="text-gray-400 text-xs mt-1">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Student</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">University & Course</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Intake</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Counselor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Submitted</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Updated</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(app => (
                  <tr
                    key={app._id}
                    onClick={() => handleSelect(app)}
                    className={`hover:bg-orange-50 cursor-pointer transition-colors ${selected?._id === app._id ? 'bg-orange-50 border-l-2 border-orange-500' : ''}`}
                  >
                    {/* Student */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avi name={app._student?.name} className="w-8 h-8 text-sm" bg="bg-orange-500" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate max-w-[160px]">{app._student?.name || '—'}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">{app._student?.email || app.studentId}</p>
                          {app._student?.nationality && (
                            <p className="text-[10px] text-gray-400">{app._student.nationality}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* University & Course */}
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {app.universityId ? (
                        <Link to={`/university/${app.universityId}`} className="font-medium text-gray-800 hover:text-orange-600 hover:underline truncate max-w-[200px] block">
                          {app.universityName || '—'}
                        </Link>
                      ) : (
                        <p className="font-medium text-gray-800 truncate max-w-[200px]">{app.universityName || '—'}</p>
                      )}
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{app.courseName || '—'}</p>
                    </td>

                    {/* Intake */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {app.intake || '—'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>

                    {/* Counselor */}
                    <td className="px-4 py-3">
                      {app._counselor ? (
                        <div className="flex items-center gap-2">
                          <Avi name={app._counselor.name} className="w-6 h-6 text-xs" bg="bg-teal-600" />
                          <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{app._counselor.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Submitted */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(app.submittedDate || app.createdAt)}
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(app.updatedDate || app.updatedAt)}
                    </td>

                    {/* Arrow */}
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="flex flex-col w-full lg:w-[440px] flex-shrink-0 bg-white border-l border-gray-200 overflow-hidden">
          {/* Drawer header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0 bg-white sticky top-0 z-10">
            <button
              onClick={() => setSelected(null)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{selected.universityName}</p>
              <p className="text-xs text-gray-400 truncate">{selected.courseName}</p>
            </div>
            <StatusBadge status={selected.status} />
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Student section */}
            <Section title="Student Profile" icon={User}>
              <div className="flex items-center gap-3 mb-4">
                <Avi name={selected._student?.name} className="w-12 h-12 text-lg" bg="bg-orange-500" />
                <div>
                  <p className="font-bold text-gray-900">{selected._student?.name || '—'}</p>
                  <p className="text-xs text-gray-400">{selected._student?.email}</p>
                  {selected._student?.nationality && (
                    <p className="text-xs text-gray-400 mt-0.5">{selected._student.nationality}</p>
                  )}
                </div>
              </div>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                  Loading profile...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={BookOpen} label="Education" value={selectedStudent?.educationLevel} />
                  <InfoRow icon={CheckCircle} label="GPA" value={selectedStudent?.gpa ? `${selectedStudent.gpa} / 4.0` : undefined} />
                  <InfoRow
                    icon={Globe}
                    label="English Score"
                    value={selectedStudent?.englishScore ? `${selectedStudent.englishScore.type} ${selectedStudent.englishScore.score}` : undefined}
                  />
                  <InfoRow icon={DollarSign} label="Budget" value={selectedStudent?.budget ? `$${Number(selectedStudent.budget).toLocaleString()}` : undefined} />
                  {selectedStudent?.preferredCountries?.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Preferred Countries</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedStudent.preferredCountries.map((c: string) => (
                          <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Counselor section */}
            <Section title="Assigned Counselor" icon={UserCog}>
              {selected._counselor ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avi name={selected._counselor.name} className="w-10 h-10" bg="bg-teal-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{selected._counselor.name}</p>
                      <p className="text-xs text-gray-400">{selected._counselor.email}</p>
                      {selected._counselor.specialty && (
                        <p className="text-xs text-teal-600 font-medium mt-0.5">{selected._counselor.specialty}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/appteam/chat?counselorId=${selected._counselor._id}`)}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Chat with Counselor
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">No counselor assigned to this student</p>
              )}
            </Section>

            {/* Application details */}
            <Section title="Application Details" icon={Layers}>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow icon={BookOpen} label="University" value={selected.universityName} />
                <InfoRow icon={BookOpen} label="Course" value={selected.courseName} />
                <InfoRow icon={Calendar} label="Intake" value={selected.intake} />
                <InfoRow icon={Clock} label="Submitted" value={fmtDate(selected.submittedDate || selected.createdAt)} />
                <InfoRow icon={Clock} label="Last Updated" value={fmtDate(selected.updatedDate || selected.updatedAt)} />
                {(selected.notes || selected.processingNotes) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Notes</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selected.notes || selected.processingNotes}</p>
                  </div>
                )}
              </div>
            </Section>

            {/* Update status */}
            <Section title="Update Processing Stage" icon={AlertCircle}>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Select new status</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STATUSES.map(s => (
                      <button
                        key={s.key}
                        onClick={() => setDraftStatus(s.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                          draftStatus === s.key
                            ? `${s.bg} ${s.color} border-current ring-2 ${s.ring}`
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Processing notes</p>
                  <textarea
                    value={draftNotes}
                    onChange={e => setDraftNotes(e.target.value)}
                    rows={3}
                    placeholder="Add notes for this application..."
                    className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {saveSuccess && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>
              </div>
            </Section>

            {/* Documents */}
            <Section title={`Documents${selectedStudent?.documents?.length ? ` (${selectedStudent.documents.length})` : ''}`} icon={FileText}>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                  Loading documents...
                </div>
              ) : !selectedStudent?.documents?.length ? (
                <p className="text-sm text-gray-400 italic">No documents uploaded</p>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.documents.map((doc: any) => {
                    const ds = DOC_STATUS[doc.status] || { label: doc.status, color: 'text-gray-600', bg: 'bg-gray-100' };
                    return (
                      <div key={doc._id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.type && <span className="text-[10px] text-gray-400">{doc.type}</span>}
                            {doc.status && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ds.bg} ${ds.color}`}>
                                {ds.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {doc.url ? (
                          <a
                            href={uploadUrl(doc.url)}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-xs font-semibold flex-shrink-0"
                          >
                            <Download className="w-3 h-3" /> Get
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300 italic flex-shrink-0">No file</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

          </div>
        </div>
      )}
    </div>
  );
}
