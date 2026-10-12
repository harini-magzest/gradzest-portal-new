import FollowupQueue from '../../components/dashboards/FollowupQueue';
import LeadScores from '../../components/dashboards/LeadScores';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, FileText, MessageSquare, TrendingUp, AlertCircle, ArrowRight, Star, Plus, Award, Edit3, CheckCircle2, Target, ClipboardList, MessageCircle, Send, UserCog, GraduationCap, MapPin, BookOpen, Phone, Video, PhoneCall } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Counselor } from '../../types';
import { usePortalName } from '../../hooks/usePortalName';
import MyCallPerformance from '../../components/MyCallPerformance';


function fmt12h(time24: string) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function CounselorDashboard() {
  const { portal } = usePortalName();
  const { user } = useAuth();
  const counselor = user as Counselor;
  const [students, setStudents] = useState<any[]>([]);
  const [universities, setUniversities] = useState<any[]>([]);
  const [workNote, setWorkNote] = useState((user as any)?.bio || '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState((user as any)?.bio || '');
  const [savingNote, setSavingNote] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [scheduledCalls, setScheduledCalls] = useState<any[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [universitiesError, setUniversitiesError] = useState('');
  const [callsError, setCallsError] = useState('');

  const refreshStudents = () => {
    setStudentsError('');
    return api.students.list().then(all => {
      const mine = all.filter((s: any) => counselor.assignedStudents?.includes(s._id || s.id));
      setStudents(mine);
    }).catch(() => setStudentsError('Failed to load your students.'));
  };

  const loadUniversities = () => {
    setUniversitiesError('');
    api.universities.list().then(setUniversities).catch(() => setUniversitiesError('Failed to load universities.'));
  };

  const loadCalls = () => {
    setCallsError('');
    setCallsLoading(true);
    api.meetings.list().then((meetings: any[]) => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const upcoming = meetings
        .filter(m => {
          const isCall = (m.title || '').includes('📞');
          const dt = new Date(`${m.scheduledDate}T${m.scheduledTime}`);
          return isCall && dt >= todayStart;
        })
        .sort((a, b) => {
          const da = new Date(`${a.scheduledDate}T${a.scheduledTime}`);
          const db = new Date(`${b.scheduledDate}T${b.scheduledTime}`);
          return da.getTime() - db.getTime();
        });
      setScheduledCalls(upcoming);
    }).catch(() => setCallsError('Failed to load scheduled calls.')).finally(() => setCallsLoading(false));
  };

  useEffect(() => {
    refreshStudents();
    loadUniversities();
    loadCalls();
  }, []);

  const submitReply = async (appId: string) => {
    const text = (replyTexts[appId] || '').trim();
    if (!text || replying) return;
    setReplying(appId);
    try {
      await api.applications.addComment(appId, text);
      setReplyTexts(prev => ({ ...prev, [appId]: '' }));
      await refreshStudents();
    } catch {}
    setReplying(null);
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      await api.counselors.updateMe({ bio: noteInput });
      setWorkNote(noteInput);
      setEditingNote(false);
    } catch { /* ignore */ }
    setSavingNote(false);
  };

  const myStudents = students;
  const allApplications = myStudents.flatMap((s: any) => s.applications || []);

  const studentQuestions = allApplications
    .filter((a: any) => {
      const comments: any[] = a.comments || [];
      return comments.length > 0 && comments[comments.length - 1]?.authorRole === 'student';
    })
    .map((a: any) => {
      const comments: any[] = a.comments || [];
      const lastQ = [...comments].reverse().find((c: any) => c.authorRole === 'student');
      const student = myStudents.find((s: any) =>
        (s.applications || []).some((ap: any) => (ap._id || ap.id) === (a._id || a.id))
      );
      return { app: a, question: lastQ, studentName: student?.name || 'Student' };
    })
    .sort((a: any, b: any) => new Date(b.question?.createdAt || 0).getTime() - new Date(a.question?.createdAt || 0).getTime());

  const stats = {
    totalStudents: myStudents.length,
    activeApplications: allApplications.filter((a: any) => ['submitted', 'under_review'].includes(a.status)).length,
    pendingDocs: myStudents.flatMap((s: any) => s.documents || []).filter((d: any) => d.status === 'pending').length,
    offers: allApplications.filter((a: any) => a.status === 'offer_received').length,
  };

  const appBreakdown = [
    { label: 'Draft', count: allApplications.filter((a: any) => a.status === 'draft').length, color: 'bg-gray-400' },
    { label: 'Submitted', count: allApplications.filter((a: any) => a.status === 'submitted').length, color: 'bg-teal-600' },
    { label: 'Under Review', count: allApplications.filter((a: any) => a.status === 'under_review').length, color: 'bg-yellow-500' },
    { label: 'Offer Received', count: allApplications.filter((a: any) => a.status === 'offer_received').length, color: 'bg-green-500' },
    { label: 'Accepted', count: allApplications.filter((a: any) => a.status === 'accepted').length, color: 'bg-emerald-600' },
    { label: 'Rejected', count: allApplications.filter((a: any) => a.status === 'rejected').length, color: 'bg-red-500' },
  ];

  // Performance score calculation
  const allDocs = myStudents.flatMap((s: any) => s.documents || []);
  const verifiedDocs = allDocs.filter((d: any) => d.status === 'verified').length;
  const acceptedApps = allApplications.filter((a: any) => ['accepted', 'enrolled'].includes(a.status)).length;
  const submittedApps = allApplications.filter((a: any) => a.status !== 'draft').length;

  const offerRate = submittedApps > 0 ? (stats.offers + acceptedApps) / submittedApps : 0;
  const docRate = allDocs.length > 0 ? verifiedDocs / allDocs.length : 0;
  const portfolioRate = Math.min(myStudents.length / 8, 1);

  const performanceScore = Math.min(100, Math.round(offerRate * 45 + docRate * 30 + portfolioRate * 25));

  const perfTier = performanceScore >= 80
    ? { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-50 border-green-200', bar: 'bg-green-500', ring: 'text-green-600' }
    : performanceScore >= 60
    ? { label: 'Good', color: 'text-green-700', bg: 'bg-green-50 border-green-200', bar: 'bg-green-600', ring: 'text-green-700' }
    : performanceScore >= 40
    ? { label: 'Average', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', bar: 'bg-yellow-500', ring: 'text-yellow-600' }
    : { label: 'Getting Started', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-400', ring: 'text-gray-500' };

  const perfMetrics = [
    { label: 'Offer & Acceptance Rate', value: Math.round(offerRate * 100), bar: 'bg-teal-500' },
    { label: 'Document Review Rate', value: Math.round(docRate * 100), bar: 'bg-blue-500' },
    { label: 'Student Portfolio', value: Math.round(portfolioRate * 100), bar: 'bg-violet-500' },
  ];

  const contributions = [
    { label: 'Students Managed', value: myStudents.length, icon: Users, color: 'bg-teal-50 text-teal-700' },
    { label: 'Applications Processed', value: submittedApps, icon: ClipboardList, color: 'bg-blue-50 text-blue-700' },
    { label: 'Documents Verified', value: verifiedDocs, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Offers Secured', value: stats.offers, icon: Target, color: 'bg-amber-50 text-amber-700' },
    { label: 'Accepted Students', value: acceptedApps, icon: Award, color: 'bg-violet-50 text-violet-700' },
  ];

  return (
    <>
    <div className="space-y-6">
      <FollowupQueue />
      <LeadScores />
      <div className="bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-white/15 border border-white/20 rounded-xl flex items-center justify-center">
            <UserCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-green-200 text-xs font-semibold uppercase tracking-wide">{portal}</p>
            <h1 className="text-2xl font-bold leading-tight text-white">{counselor?.name || 'Counselor'}</h1>
            <p className="text-green-200 text-xs mt-0.5 capitalize">{counselor?.specialization?.join(' • ')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'My Students', value: stats.totalStudents, icon: Users, to: '/counselor/students' },
            { label: 'Active Apps', value: stats.activeApplications, icon: FileText, to: '/counselor/applications' },
            { label: 'Pending Docs', value: stats.pendingDocs, icon: AlertCircle, to: '/counselor/students' },
            { label: 'Offers Out', value: stats.offers, icon: Star, to: '/counselor/applications' },
          ].map(s => (
            <Link key={s.label} to={s.to} className="bg-white/15 border border-white/20 rounded-xl p-3 transition-colors hover:bg-white/25">
              <s.icon className="w-4 h-4 mb-1 text-green-200" />
              <div className="text-2xl font-extrabold text-white">{s.value}</div>
              <div className="text-xs font-bold text-green-200">{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {studentsError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{studentsError} Stats below may be incomplete.</div>
          <button type="button" onClick={refreshStudents} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Application Pipeline</h2>
          <Link to="/counselor/universities"
            className="flex items-center gap-1.5 bg-teal-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Application
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {appBreakdown.map(b => (
            <div key={b.label} className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl font-bold text-gray-900 mb-1">{b.count}</div>
              <div className={`inline-block w-2 h-2 rounded-full ${b.color} mr-1.5`}></div>
              <span className="text-xs text-gray-500">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled Calls */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Scheduled Calls</h2>
            {scheduledCalls.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {scheduledCalls.length}
              </span>
            )}
          </div>
          <Link to="/counselor/activities" className="text-blue-700 text-sm font-medium hover:text-blue-600 flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {callsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : callsError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{callsError}</div>
            <button type="button" onClick={loadCalls} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
          </div>
        ) : scheduledCalls.length === 0 ? (
          <div className="text-center py-8">
            <Phone className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No upcoming calls scheduled</p>
            <p className="text-xs text-gray-400 mt-1">Schedule a call from the Activities page</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledCalls.slice(0, 4).map(call => {
              const isVideo = !(call.notes || '').toLowerCase().includes('audio') &&
                !(call.title || '').toLowerCase().includes('audio');
              const callDate = new Date(call.scheduledDate + 'T00:00:00');
              const td = new Date(); td.setHours(0, 0, 0, 0);
              const tom = new Date(td); tom.setDate(td.getDate() + 1);
              const isToday = callDate.getTime() === td.getTime();
              const isTomorrow = callDate.getTime() === tom.getTime();
              const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
                : callDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const timeLabel = fmt12h(call.scheduledTime || '');
              const studentName = call.scheduledForName || call.studentName || 'Student';

              return (
                <div key={call._id || call.id}
                  className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all ${
                    isToday ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                  }`}>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isToday ? 'bg-blue-100' : 'bg-white border border-gray-200'
                  }`}>
                    {isVideo
                      ? <Video className={`w-5 h-5 ${isToday ? 'text-blue-600' : 'text-gray-500'}`} />
                      : <PhoneCall className={`w-5 h-5 ${isToday ? 'text-blue-600' : 'text-gray-500'}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{isVideo ? 'Video' : 'Audio'} Call</p>
                    <p className="text-xs text-gray-500 mt-0.5">with {studentName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-gray-600'}`}>{dateLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeLabel}</p>
                  </div>
                  {isToday && (
                    <Link to="/counselor/activities"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0">
                      <Video className="w-3 h-3" /> Join
                    </Link>
                  )}
                </div>
              );
            })}
            {scheduledCalls.length > 4 && (
              <Link to="/counselor/activities"
                className="block text-center text-xs text-blue-700 font-medium hover:underline pt-1">
                +{scheduledCalls.length - 4} more scheduled call{scheduledCalls.length - 4 > 1 ? 's' : ''}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Student Questions */}
      {studentQuestions.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-orange-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-bold text-gray-900">Student Questions</h2>
              <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-semibold">
                {studentQuestions.length} unanswered
              </span>
            </div>
            <Link to="/counselor/applications"
              className="text-sm text-teal-700 font-medium hover:text-teal-600 flex items-center gap-1">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-4">
            {studentQuestions.map(({ app, question, studentName }) => {
              const appId = app._id || app.id;
              return (
                <div key={appId} className="bg-orange-50/50 border border-orange-100 rounded-xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {studentName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{studentName}</p>
                      <p className="text-xs text-gray-500 truncate">{app.universityName} · {app.courseName}</p>
                      {question?.createdAt && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(question.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl px-3 py-2.5 mb-3 border border-orange-100">
                    <p className="text-sm text-gray-800 leading-relaxed">{question?.text}</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={replyTexts[appId] || ''}
                      onChange={e => setReplyTexts(prev => ({ ...prev, [appId]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(appId); } }}
                      placeholder="Reply to student…"
                      disabled={replying === appId}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    />
                    <button type="button" onClick={() => submitReply(appId)}
                      disabled={replying === appId || !replyTexts[appId]?.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold hover:bg-teal-700 disabled:opacity-40 transition-colors flex-shrink-0">
                      <Send className="w-3.5 h-3.5" />
                      {replying === appId ? 'Sending…' : 'Reply'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Score + Contributions */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Award className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-900">My Performance</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Score */}
          <div className={`rounded-xl border p-5 flex flex-col items-center justify-center text-center ${perfTier.bg}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Performance Score</p>
            <div className={`text-6xl font-extrabold ${perfTier.color}`}>{performanceScore}</div>
            <div className={`text-sm font-semibold mt-1 ${perfTier.color}`}>{perfTier.label}</div>
            <p className="text-xs text-gray-400 mt-2">Based on offer rate, doc reviews & student load</p>
          </div>
          {/* Metric bars */}
          <div className="space-y-4">
            {perfMetrics.map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{m.label}</span>
                  <span className="font-semibold">{m.value}%</span>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-sm ${i < Math.round(m.value / 10) ? m.bar : 'bg-gray-100'}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Contributions */}
        <div className="mt-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">My Contributions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {contributions.map(c => (
              <div key={c.label} className={`rounded-xl p-3 flex flex-col items-center text-center gap-1 ${c.color}`}>
                <c.icon className="w-5 h-5" />
                <div className="text-xl font-bold">{c.value}</div>
                <div className="text-xs font-medium leading-tight">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MyCallPerformance />

      {/* Work Status Note */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-cyan-600" />
            <h2 className="text-base font-bold text-gray-900">My Work Update</h2>
          </div>
          {!editingNote ? (
            <button
              type="button"
              onClick={() => { setNoteInput(workNote); setEditingNote(true); }}
              className="text-xs text-cyan-700 font-medium hover:text-cyan-600 border border-cyan-200 px-3 py-1 rounded-lg hover:bg-cyan-50 transition-colors"
            >
              {workNote ? 'Edit' : 'Add Update'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="text-xs text-gray-500 font-medium border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingNote}
                onClick={handleSaveNote}
                className="text-xs text-white font-medium bg-cyan-600 px-3 py-1 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-60"
              >
                {savingNote ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
        {editingNote ? (
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            rows={3}
            placeholder="Describe what you're currently working on, recent achievements, or notes for your team…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
        ) : (
          <p className={`text-sm ${workNote ? 'text-gray-700' : 'text-gray-400 italic'}`}>
            {workNote || 'No work update yet. Click "Add Update" to describe what you\'re working on.'}
          </p>
        )}
      </div>

      {/* University Board */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">University Board</h2>
            <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-semibold">
              {universities.length} partners
            </span>
          </div>
          <Link
            to="/counselor/universities"
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {universitiesError ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{universitiesError}</div>
            <button type="button" onClick={loadUniversities} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
          </div>
        ) : universities.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No universities loaded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {universities.slice(0, 4).map((uni: any) => (
              <Link
                key={uni._id || uni.id}
                to="/counselor/universities"
                className="group flex flex-col gap-3 bg-gray-50 hover:bg-indigo-50 border border-gray-100 hover:border-indigo-200 rounded-xl p-4 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center text-[#0d1b4b] font-bold text-lg flex-shrink-0 shadow-sm">
                    {uni.name?.charAt(0) || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-1 group-hover:text-indigo-800">{uni.name}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{uni.city}, {uni.country}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> {uni.rating ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {uni.courses?.length ?? 0} courses
                  </span>
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">#{uni.ranking}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {universities.length > 4 && (
          <div className="mt-4 text-center">
            <Link
              to="/counselor/universities"
              className="inline-flex items-center gap-1.5 text-sm text-indigo-700 font-semibold hover:text-indigo-800 transition-colors"
            >
              +{universities.length - 4} more universities — View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'View All Students', icon: Users, to: '/counselor/students', color: 'bg-teal-50 text-teal-700 border-teal-200' },
            { label: 'Open Chat', icon: MessageSquare, to: '/counselor/chat', color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'Browse Universities', icon: TrendingUp, to: '/counselor/universities', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { label: 'Search Engine', icon: FileText, to: '/search', color: 'bg-rose-50 text-rose-700 border-rose-200' },
            { label: 'Learning Hub', icon: GraduationCap, to: '/counselor/learning', color: 'bg-amber-50 text-amber-700 border-amber-200' },
          ].map(action => (
            <Link key={action.label} to={action.to} className={`flex flex-col items-center p-5 rounded-xl border-2 hover:shadow-md transition-all gap-2 ${action.color}`}>
              <action.icon className="w-6 h-6" />
              <span className="text-sm font-medium text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
