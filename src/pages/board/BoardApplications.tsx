import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { downloadApplicationReportPdf } from '../../utils/applicationReportPdf';
import {
  Search, X, LayoutGrid, List, Download, FileDown, ChevronRight,
  Edit2, Send, Clock, Award, CheckCircle, XCircle, BookOpen,
  GraduationCap, Calendar, FileText, User, UserCog, Globe, Save,
} from 'lucide-react';
import SignedFileLink from '../../components/SignedFileLink';

const STATUSES = [
  { value: 'draft',          label: 'Draft',          icon: Edit2,        color: 'text-gray-600',   bg: 'bg-gray-100',   border: 'border-gray-300',   col: 'bg-gray-50' },
  { value: 'submitted',      label: 'Submitted',      icon: Send,         color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-300',   col: 'bg-blue-50/40' },
  { value: 'under_review',   label: 'Under Review',   icon: Clock,        color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-300',  col: 'bg-amber-50/40' },
  { value: 'offer_received', label: 'Offer Received', icon: Award,        color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-300', col: 'bg-purple-50/40' },
  { value: 'accepted',       label: 'Accepted',       icon: CheckCircle,  color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300',  col: 'bg-green-50/40' },
  { value: 'rejected',       label: 'Rejected',       icon: XCircle,      color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-300',    col: 'bg-red-50/40' },
  { value: 'enrolled',       label: 'Enrolled',       icon: BookOpen,     color: 'text-indigo-700', bg: 'bg-indigo-100', border: 'border-indigo-300', col: 'bg-indigo-50/40' },
];


function Avi({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const sz = size === 'md' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs';
  return (
    <div className={`${sz} rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function BoardApplications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState('');
  const [notesUpdate, setNotesUpdate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    Promise.all([api.admin.applications(), api.admin.counselors()])
      .then(([apps, couns]) => { setApplications(apps); setCounselors(couns); })
      .finally(() => setLoading(false));
  }, []);

  const counselorMap = useMemo(() => {
    const m: Record<string, any> = {};
    counselors.forEach(c => { m[c._id] = c; });
    return m;
  }, [counselors]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return applications
      .filter(a => {
        const matchSearch = !q || [a.studentName, a.universityName, a.courseName, a.intake]
          .some(v => v?.toLowerCase().includes(q));
        const matchStatus = statusFilter === 'all' || a.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const ta = new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime();
        return tb - ta;
      });
  }, [applications, search, statusFilter]);

  const handleExport = () => {
    exportRowsToCsv(`applications_export_${new Date().toISOString().slice(0, 10)}.csv`, filtered.map(a => ({
      'Student Name': a.studentName || '', 'Student Email': a.studentEmail || '',
      University: a.universityName || '', Course: a.courseName || '', Intake: a.intake || '',
      Status: a.status || '', 'Submitted Date': a.submittedDate || '', 'Updated Date': a.updatedDate || '',
    })));
  };

  const selectApp = useCallback(async (app: any) => {
    setSelectedApp(app);
    setStatusUpdate(app.status);
    setNotesUpdate(app.notes || '');
    setSaveMsg('');
    setStudentDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await api.students.get(app.studentId);
      setStudentDetail(detail);
    } catch {
      setStudentDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const saveUpdate = async () => {
    if (!selectedApp || saving) return;
    setSaving(true);
    try {
      const updated = await api.admin.updateApplication(selectedApp.studentId, selectedApp._id, {
        status: statusUpdate,
        notes: notesUpdate,
      });
      setApplications(prev => prev.map(a =>
        a._id === selectedApp._id ? { ...a, status: updated.status ?? statusUpdate, notes: updated.notes ?? notesUpdate } : a
      ));
      setSelectedApp((p: any) => ({ ...p, status: updated.status ?? statusUpdate, notes: updated.notes ?? notesUpdate }));
      setSaveMsg('Saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSaveMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const assignedCounselor = studentDetail
    ? counselorMap[studentDetail.counselorId?._id || studentDetail.counselorId]
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] -m-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900 mr-2">Applications Board</h1>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search student, university..."
            className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {[{ v: 'board', icon: LayoutGrid }, { v: 'list', icon: List }].map(({ v, icon: Icon }) => (
            <button key={v} onClick={() => setViewMode(v as any)}
              className={`px-3 py-1.5 ${viewMode === v ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} app{filtered.length !== 1 ? 's' : ''}</span>
        <button type="button" onClick={handleExport} disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 transition-colors">
          <FileDown className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Board view */}
        {viewMode === 'board' && (
          <>
            <div className={`flex-1 overflow-x-auto ${selectedApp ? 'hidden lg:block' : ''}`}>
              <div className="flex gap-3 p-4 min-w-max h-full">
                {STATUSES.filter(s => statusFilter === 'all' || s.value === statusFilter).map(s => {
                  const Icon = s.icon;
                  const cards = filtered.filter(a => a.status === s.value);
                  return (
                    <div key={s.value} className={`flex flex-col w-60 rounded-xl border ${s.border} ${s.col} flex-shrink-0`}>
                      <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${s.border}`}>
                        <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                        <span className={`text-xs font-bold uppercase tracking-wide ${s.color}`}>{s.label}</span>
                        <span className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full ${s.bg} ${s.color}`}>{cards.length}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {cards.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-6">No applications</p>
                        ) : cards.map(app => (
                          <button key={app._id} onClick={() => selectApp(app)}
                            className={`w-full text-left p-3 rounded-lg bg-white border shadow-xs hover:shadow-sm transition-all ${selectedApp?._id === app._id ? 'ring-2 ring-indigo-500' : 'border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Avi name={app.studentName} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">{app.studentName}</p>
                                <p className="text-[10px] text-gray-400 truncate">{app.studentEmail}</p>
                              </div>
                            </div>
                            <Link to={`/university/${app.universityId}`} onClick={e => e.stopPropagation()} className="text-xs font-medium text-gray-800 hover:text-indigo-700 hover:underline truncate block">{app.universityName}</Link>
                            <p className="text-[11px] text-gray-500 truncate">{app.courseName}</p>
                            {app.intake && <p className="text-[10px] text-gray-400 mt-1">{app.intake}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail panel (board mode) */}
            {selectedApp && <DetailPanel {...{ selectedApp, studentDetail, loadingDetail, assignedCounselor, statusUpdate, setStatusUpdate, notesUpdate, setNotesUpdate, saving, saveMsg, saveUpdate, onClose: () => setSelectedApp(null) }} />}
          </>
        )}

        {/* List view */}
        {viewMode === 'list' && (
          <>
            <div className={`flex-1 overflow-y-auto border-r border-gray-200 ${selectedApp ? 'hidden lg:block' : ''}`}>
              {filtered.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">No applications found</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filtered.map(app => {
                    const s = STATUSES.find(x => x.value === app.status) || STATUSES[0];
                    const Icon = s.icon;
                    return (
                      <button key={app._id} onClick={() => selectApp(app)}
                        className={`w-full flex items-center gap-4 px-6 py-3 text-left hover:bg-gray-50 transition-colors ${selectedApp?._id === app._id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}>
                        <Avi name={app.studentName} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{app.studentName}</p>
                          <p className="text-xs text-gray-500 truncate"><Link to={`/university/${app.universityId}`} onClick={e => e.stopPropagation()} className="hover:text-indigo-700 hover:underline">{app.universityName}</Link> · {app.courseName}</p>
                        </div>
                        <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>
                          <Icon className="w-3 h-3" />{s.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedApp
              ? <DetailPanel {...{ selectedApp, studentDetail, loadingDetail, assignedCounselor, statusUpdate, setStatusUpdate, notesUpdate, setNotesUpdate, saving, saveMsg, saveUpdate, onClose: () => setSelectedApp(null) }} />
              : <div className="hidden lg:flex flex-1 items-center justify-center text-sm text-gray-400">Select an application to view details</div>
            }
          </>
        )}
      </div>
    </div>
  );
}

function DetailPanel({
  selectedApp, studentDetail, loadingDetail, assignedCounselor,
  statusUpdate, setStatusUpdate, notesUpdate, setNotesUpdate,
  saving, saveMsg, saveUpdate, onClose,
}: any) {
  const docs = studentDetail?.documents || [];

  return (
    <div className="w-full lg:w-[22rem] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-900">Application Detail</span>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadApplicationReportPdf(selectedApp, { student: studentDetail, counselor: assignedCounselor })}
            title="Download application report PDF" className="p-1 hover:bg-gray-100 rounded-lg"><Download className="w-4 h-4 text-gray-500" /></button>
          <button aria-label="Close" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Student profile */}
        <Section title="Student Profile" icon={User}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-base">
              {selectedApp.studentName?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{selectedApp.studentName}</p>
              <p className="text-xs text-gray-500">{selectedApp.studentEmail}</p>
            </div>
          </div>
          {loadingDetail ? (
            <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Loading...</div>
          ) : studentDetail ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ['Nationality', studentDetail.nationality || selectedApp.studentNationality],
                ['Phone', studentDetail.phone],
                ['GPA', studentDetail.gpa],
                ['English Score', studentDetail.englishScore ? `${studentDetail.englishTest}: ${studentDetail.englishScore}` : null],
                ['Budget', studentDetail.budget ? `$${Number(studentDetail.budget).toLocaleString()}` : null],
                ['Countries', studentDetail.preferredCountries?.join(', ')],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string}>
                  <span className="text-gray-400">{k}</span>
                  <p className="font-medium text-gray-800 truncate">{v as string}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No additional details</p>
          )}
        </Section>

        {/* Assigned counselor */}
        <Section title="Assigned Counselor" icon={UserCog}>
          {assignedCounselor ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {assignedCounselor.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{assignedCounselor.name}</p>
                <p className="text-xs text-gray-500">{assignedCounselor.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">{loadingDetail ? 'Loading…' : 'No counselor assigned'}</p>
          )}
        </Section>

        {/* Application details */}
        <Section title="Application Details" icon={GraduationCap}>
          <div className="space-y-2 text-xs">
            {[
              [GraduationCap, 'University', selectedApp.universityName],
              [BookOpen, 'Course', selectedApp.courseName],
              [Calendar, 'Intake', selectedApp.intake],
              [Globe, 'Nationality', selectedApp.studentNationality],
              [FileText, 'Submitted', selectedApp.submittedDate ? new Date(selectedApp.submittedDate).toLocaleDateString() : 'N/A'],
              [Clock, 'Last Updated', selectedApp.updatedDate ? new Date(selectedApp.updatedDate).toLocaleDateString() : 'N/A'],
            ].map(([Icon, label, value]: any) => value ? (
              <div key={label} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-gray-400">{label}: </span>
                  <span className="font-medium text-gray-800">{value}</span>
                </div>
              </div>
            ) : null)}
            {selectedApp.notes && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-gray-700">{selectedApp.notes}</p>
              </div>
            )}
          </div>
        </Section>

        {/* Update stage */}
        <Section title="Update Processing Stage" icon={Edit2}>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {STATUSES.map(s => {
              const Icon = s.icon;
              return (
                <button key={s.value} onClick={() => setStatusUpdate(s.value)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    statusUpdate === s.value ? `${s.bg} ${s.color} ${s.border}` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  <Icon className="w-3 h-3" />{s.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={notesUpdate} onChange={e => setNotesUpdate(e.target.value)}
            placeholder="Add processing notes..."
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            {saveMsg && <span className={`text-xs ${saveMsg.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>{saveMsg}</span>}
            <button onClick={saveUpdate} disabled={saving}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              <Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Update'}
            </button>
          </div>
        </Section>

        {/* Documents */}
        <Section title={`Documents (${docs.length})`} icon={FileText}>
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400">{loadingDetail ? 'Loading…' : 'No documents uploaded'}</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc: any) => (
                <div key={doc._id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                  <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-gray-400">{doc.type} · {doc.status}</p>
                  </div>
                  {doc.url && (
                    <SignedFileLink href={doc.url} download target="_blank" rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-indigo-100 text-indigo-600 transition-colors flex-shrink-0">
                      <Download className="w-3.5 h-3.5" />
                    </SignedFileLink>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

