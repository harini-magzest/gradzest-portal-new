import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { downloadApplicationReportPdf } from '../../utils/applicationReportPdf';
import { exportRowsToCsv } from '../../utils/exportCsv';
import { useAuth } from '../../context/AuthContext';
import {
  Search, X, ChevronRight, Download, FileDown, FileText,
  User, UserCog, Layers, Calendar, Clock, CheckCircle,
  AlertCircle, BookOpen, Globe, DollarSign, MessageSquare,
  Send, ChevronDown, ChevronUp, GraduationCap,
} from 'lucide-react';
import SignedFileLink from '../../components/SignedFileLink';
import { useOpenRoom } from '../../hooks/useOpenRoom';
import EarlierMessages from '../../components/chat/EarlierMessages';
import { clickOnEnterOrSpace } from '../../lib/a11y';

const STATUSES = [
  { key: 'draft',          label: 'Draft',          color: 'text-gray-600',   bg: 'bg-gray-100',   dot: 'bg-gray-400',   ring: 'ring-gray-300',   border: 'border-gray-300' },
  { key: 'submitted',      label: 'Submitted',      color: 'text-blue-700',   bg: 'bg-blue-50',    dot: 'bg-blue-500',   ring: 'ring-blue-300',   border: 'border-blue-300' },
  { key: 'under_review',   label: 'Under Review',   color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-500',  ring: 'ring-amber-300',  border: 'border-amber-300' },
  { key: 'offer_received', label: 'Offer Received', color: 'text-purple-700', bg: 'bg-purple-50',  dot: 'bg-purple-500', ring: 'ring-purple-300', border: 'border-purple-300' },
  { key: 'accepted',       label: 'Accepted',       color: 'text-green-700',  bg: 'bg-green-50',   dot: 'bg-green-500',  ring: 'ring-green-300',  border: 'border-green-300' },
  { key: 'rejected',       label: 'Rejected',       color: 'text-red-700',    bg: 'bg-red-50',     dot: 'bg-red-500',    ring: 'ring-red-300',    border: 'border-red-300' },
  { key: 'enrolled',       label: 'Enrolled',       color: 'text-indigo-700', bg: 'bg-indigo-50',  dot: 'bg-indigo-500', ring: 'ring-indigo-300', border: 'border-indigo-300' },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.key, s]));

const DOC_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: 'text-amber-700', bg: 'bg-amber-100' },
  verified: { label: 'Verified', color: 'text-green-700', bg: 'bg-green-100' },
  rejected: { label: 'Rejected', color: 'text-red-700',   bg: 'bg-red-100' },
  approved: { label: 'Approved', color: 'text-green-700', bg: 'bg-green-100' },
  uploaded: { label: 'Uploaded', color: 'text-blue-700',  bg: 'bg-blue-100' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-100', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Avi({ name, bg = 'bg-orange-500', size = 'md' }: { name?: string; bg?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div className={`${sz} ${bg} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
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
        <p className="text-sm text-gray-800 font-medium">{value}</p>
      </div>
    </div>
  );
}

function DrawerSection({ title, icon: Icon, children, collapsible = false, defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50 text-left ${collapsible ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
      >
        <Icon className="w-4 h-4 text-orange-500" />
        <h4 className="text-sm font-bold text-gray-800 flex-1">{title}</h4>
        {collapsible && (open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
      </button>
      {(!collapsible || open) && <div className="p-4 bg-white">{children}</div>}
    </div>
  );
}


const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function ChatPanel({ counselor, currentUser }: { counselor: any; currentUser: any }) {
  const [room, setRoom] = useState<any>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const counselorId = String(counselor._id || counselor.id);
  const userId = String(currentUser.id || currentUser._id);

  useEffect(() => {
    setLoadingRoom(true);
    setRoom(null);
    api.chat.rooms().then(roomList => {
      const existing = roomList.find((r: any) =>
        r.participants?.map(String).includes(counselorId)
      );
      if (existing) {
        setRoom(existing);
      } else {
        api.chat.createRoom(
          [userId, counselorId],
          [currentUser.name || 'Applications', counselor.name]
        ).then(newRoom => setRoom(newRoom)).catch(() => setRoom(null));
      }
    }).catch(() => setRoom(null))
      .finally(() => setLoadingRoom(false));
    // Opens (or creates) the chat room once per counselor. Listing the signed-in user and the display names would
    // re-run it, and could create a second room, whenever a name is edited while this page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counselorId]);

  // The latest messages every 10s, and older ones as the reader scrolls up
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const openRoom = useOpenRoom(room, setRoom, { containerRef: messagesBoxRef, pollMs: 10000 });
  const { consumeOlderAdded } = openRoom;

  useEffect(() => {
    if (consumeOlderAdded()) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room?.messages?.length, consumeOlderAdded]);

  useEffect(() => {
    if (room?.id) api.chat.markRead(room.id).catch(() => {});
  }, [room?.id]);

  const handleSend = async () => {
    if (!input.trim() || !room?.id) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    try {
      const updated = await api.chat.send(room.id, text, currentUser.name || 'Applications');
      setRoom(updated);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  if (loadingRoom) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-xs text-gray-400">
        <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
        Opening chat...
      </div>
    );
  }

  if (!room) {
    return <p className="text-sm text-gray-400 italic">Could not open chat room.</p>;
  }

  const messages: any[] = room.messages || [];

  return (
    <div className="flex flex-col gap-0">
      {/* Messages */}
      <div ref={messagesBoxRef} onScroll={openRoom.onScroll} className="h-56 overflow-y-auto space-y-2 px-1 py-1 bg-gray-50 rounded-lg mb-2">
        <EarlierMessages hasOlder={openRoom.hasOlder} loading={openRoom.loadingOlder} onLoad={openRoom.loadOlder} />
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-8 h-8 text-gray-200 mb-1" />
            <p className="text-xs text-gray-400">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg: any, i: number) => {
            const isMe = String(msg.senderId) === userId;
            return (
              <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!isMe && (
                    <span className="text-[10px] text-gray-400 mb-0.5 ml-1">{msg.senderName}</span>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    isMe
                      ? 'bg-orange-500 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-300 mt-0.5 mx-1">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Message ${counselor.name}...`}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          title="Send message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AppTeamApplications() {
  const { user } = useAuth();
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
  const [saveOk, setSaveOk] = useState(false);

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
    const cid = student?.counselorId?._id || student?.counselorId;
    return { ...app, _student: student, _counselor: cid ? counselorMap[cid] : null };
  }), [apps, studentMap, counselorMap]);

  const stats = useMemo(() => {
    const c: Record<string, number> = { all: enriched.length };
    STATUSES.forEach(s => { c[s.key] = 0; });
    enriched.forEach(a => { if (c[a.status] !== undefined) c[a.status]++; });
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched
      .filter(app => {
        if (statusFilter !== 'all' && app.status !== statusFilter) return false;
        if (counselorFilter !== 'all' && app._counselor?._id !== counselorFilter) return false;
        if (q) {
          const h = [app._student?.name, app._student?.email, app._student?.nationality, app.universityName, app.courseName, app.intake, app._counselor?.name]
            .filter(Boolean).join(' ').toLowerCase();
          if (!h.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime();
        return tb - ta;
      });
  }, [enriched, search, statusFilter, counselorFilter]);

  const handleExport = () => {
    exportRowsToCsv(`applications_export_${new Date().toISOString().slice(0, 10)}.csv`, filtered.map(app => ({
      'Student Name': app._student?.name || '', 'Student Email': app._student?.email || '',
      Counselor: app._counselor?.name || '', University: app.universityName || '', Course: app.courseName || '',
      Intake: app.intake || '', Status: app.status || '',
      'Submitted Date': app.submittedDate || '', 'Updated Date': app.updatedDate || '',
    })));
  };

  const handleSelect = useCallback(async (app: any) => {
    setSelected(app);
    setDraftStatus(app.status);
    setDraftNotes(app.notes || app.processingNotes || '');
    setSaveOk(false);
    setSelectedStudent(null);
    setLoadingDetail(true);
    try {
      const full = await api.students.get(app.studentId);
      setSelectedStudent(full);
    } catch { /* no-op */ }
    finally { setLoadingDetail(false); }
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.admin.updateApplication(selected.studentId, selected._id, { status: draftStatus, notes: draftNotes });
      setApps(prev => prev.map(a => a._id === selected._id ? { ...a, status: draftStatus, notes: draftNotes } : a));
      setSelected((p: any) => ({ ...p, status: draftStatus, notes: draftNotes }));
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } finally { setSaving(false); }
  };

  const fmtDate = (d?: string) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const downloadPDF = () => {
    if (!selected) return;
    downloadApplicationReportPdf(selected, { student: selectedStudent, counselor: selected._counselor });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6">

      {/* Left: table panel */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${selected ? 'hidden lg:flex' : 'flex'}`}>

        {/* Top: stat tabs */}
        <div className="px-5 pt-4 pb-0 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto pb-0">
            <button type="button"
              onClick={() => setStatusFilter('all')}
              className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                statusFilter === 'all'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              All <span className="ml-1 text-xs font-bold">{stats.all}</span>
            </button>
            {STATUSES.map(s => (
              <button key={s.key} type="button"
                onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  statusFilter === s.key
                    ? `border-orange-500 ${s.color}`
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                {s.label}
                <span className="text-xs font-bold ml-0.5">{stats[s.key] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-3 flex-wrap flex-shrink-0">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search student, university, course..."
              className="w-full pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>
          <select value={counselorFilter} onChange={e => setCounselorFilter(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
            <option value="all">All Counselors</option>
            {counselors.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <Link to="/appteam/learning"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-lg text-xs font-semibold transition-colors flex-shrink-0">
            <GraduationCap className="w-3.5 h-3.5" /> Learning Hub
          </Link>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button type="button" onClick={handleExport} disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <FileDown className="w-3.5 h-3.5" /> Export CSV
          </button>
          {(search || statusFilter !== 'all' || counselorFilter !== 'all') && (
            <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setCounselorFilter('all'); }}
              className="text-xs text-orange-500 font-semibold hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Layers className="w-12 h-12 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No applications match your filters</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                <tr>
                  {['Student', 'University & Course', 'Intake', 'Status', 'Counselor', 'Submitted', 'Updated', ''].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(app => (
                  <tr key={app._id} onClick={() => handleSelect(app)} tabIndex={0} onKeyDown={clickOnEnterOrSpace}
                    className={`cursor-pointer hover:bg-orange-50 transition-colors ${
                      selected?._id === app._id ? 'bg-orange-50 border-l-[3px] border-orange-500' : ''
                    }`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avi name={app._student?.name} bg="bg-orange-500" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate max-w-[140px]">{app._student?.name || '—'}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[140px]">{app._student?.email || app.studentId}</p>
                          {app._student?.nationality && <p className="text-[10px] text-gray-300">{app._student.nationality}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/university/${app.universityId}`} className="font-medium text-gray-800 hover:text-teal-700 hover:underline truncate max-w-[180px] block">{app.universityName || '—'}</Link>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{app.courseName || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">{app.intake || '—'}</span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                    <td className="px-4 py-3">
                      {app._counselor ? (
                        <div className="flex items-center gap-2">
                          <Avi name={app._counselor.name} bg="bg-teal-600" size="sm" />
                          <span className="text-xs font-medium text-gray-700 truncate max-w-[100px]">{app._counselor.name}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300 italic">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(app.submittedDate || app.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(app.updatedDate || app.updatedAt)}</td>
                    <td className="px-4 py-3"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail drawer */}
      {selected && (
        <div className="flex flex-col w-full lg:w-[440px] flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden">
          {/* Drawer header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 bg-white flex-shrink-0">
            <button type="button" onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Back to list">
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{selected.universityName}</p>
              <p className="text-xs text-gray-400 truncate">{selected.courseName}</p>
            </div>
            <StatusBadge status={selected.status} />
            <button
              type="button"
              onClick={downloadPDF}
              title="Download full profile as PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Student */}
            <DrawerSection title="Student Profile" icon={User}>
              <div className="flex items-center gap-3 mb-4">
                <Avi name={selected._student?.name} bg="bg-orange-500" size="lg" />
                <div>
                  <p className="font-bold text-gray-900">{selected._student?.name || '—'}</p>
                  <p className="text-xs text-gray-400">{selected._student?.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selected._student?.nationality}</p>
                </div>
              </div>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                  Loading profile...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={BookOpen} label="Education" value={selectedStudent?.educationLevel} />
                  <InfoRow icon={CheckCircle} label="GPA" value={selectedStudent?.gpa ? `${selectedStudent.gpa} / 4.0` : undefined} />
                  <InfoRow icon={Globe} label="English"
                    value={selectedStudent?.englishScore ? `${selectedStudent.englishScore.type} ${selectedStudent.englishScore.score}` : undefined} />
                  <InfoRow icon={DollarSign} label="Budget"
                    value={selectedStudent?.budget ? `$${Number(selectedStudent.budget).toLocaleString()}` : undefined} />
                  {selectedStudent?.preferredCountries?.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Preferred Countries</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedStudent.preferredCountries.map((c: string) => (
                          <span key={c} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DrawerSection>

            {/* Counselor */}
            <DrawerSection title="Assigned Counselor" icon={UserCog}>
              {selected._counselor ? (
                <div className="flex items-center gap-3">
                  <Avi name={selected._counselor.name} bg="bg-teal-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{selected._counselor.name}</p>
                    <p className="text-xs text-gray-400">{selected._counselor.email}</p>
                    {selected._counselor.specialty && (
                      <p className="text-xs text-teal-600 font-medium mt-0.5">{selected._counselor.specialty}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No counselor assigned</p>
              )}
            </DrawerSection>

            {/* Chat with counselor */}
            <DrawerSection title="Chat with Counselor" icon={MessageSquare} collapsible defaultOpen={false}>
              {selected._counselor && user ? (
                <ChatPanel
                  key={selected._counselor._id}
                  counselor={selected._counselor}
                  currentUser={user}
                />
              ) : (
                <p className="text-sm text-gray-400 italic">
                  {selected._counselor ? 'Loading…' : 'No counselor assigned to this student.'}
                </p>
              )}
            </DrawerSection>

            {/* App details */}
            <DrawerSection title="Application Details" icon={Layers}>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow icon={BookOpen} label="University" value={selected.universityName} />
                <InfoRow icon={BookOpen} label="Course" value={selected.courseName} />
                <InfoRow icon={Calendar} label="Intake" value={selected.intake} />
                <InfoRow icon={Clock} label="Submitted" value={fmtDate(selected.submittedDate || selected.createdAt)} />
                <InfoRow icon={Clock} label="Last Updated" value={fmtDate(selected.updatedDate || selected.updatedAt)} />
                {(selected.notes || selected.processingNotes) && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Notes</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">{selected.notes || selected.processingNotes}</p>
                  </div>
                )}
              </div>
            </DrawerSection>

            {/* Status update */}
            <DrawerSection title="Update Processing Stage" icon={AlertCircle}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {STATUSES.map(s => (
                    <button key={s.key} type="button" onClick={() => setDraftStatus(s.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        draftStatus === s.key
                          ? `${s.bg} ${s.color} ${s.border} ring-2 ${s.ring}`
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea value={draftNotes} onChange={e => setDraftNotes(e.target.value)} rows={3}
                  placeholder="Add processing notes..."
                  className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                <div className="flex items-center gap-3">
                  <button type="button" onClick={handleSave} disabled={saving}
                    className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  {saveOk && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>
              </div>
            </DrawerSection>

            {/* Documents */}
            <DrawerSection title={`Documents${selectedStudent?.documents?.length ? ` (${selectedStudent.documents.length})` : ''}`} icon={FileText}>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" /> Loading...
                </div>
              ) : !selectedStudent?.documents?.length ? (
                <p className="text-sm text-gray-400 italic">No documents uploaded</p>
              ) : (
                <div className="space-y-2">
                  {selectedStudent.documents.map((doc: any) => {
                    const ds = DOC_STATUS[doc.status] || { label: doc.status, color: 'text-gray-600', bg: 'bg-gray-100' };
                    return (
                      <div key={doc._id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{doc.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {doc.type && <span className="text-[10px] text-gray-400">{doc.type}</span>}
                            {doc.status && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ds.bg} ${ds.color}`}>{ds.label}</span>}
                          </div>
                        </div>
                        {doc.url ? (
                          <SignedFileLink href={doc.url} download target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-xs font-semibold flex-shrink-0">
                            <Download className="w-3 h-3" /> Download
                          </SignedFileLink>
                        ) : (
                          <span className="text-xs text-gray-300 italic flex-shrink-0">No file</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </DrawerSection>

          </div>
        </div>
      )}
    </div>
  );
}
