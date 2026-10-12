import StudentDeadlines from '../../components/dashboards/StudentDeadlines';
import ApplicationTimeline from '../../components/dashboards/ApplicationTimeline';
import DocumentChecklist from '../../components/dashboards/DocumentChecklist';
import NextStepCard from '../../components/dashboards/NextStepCard';
import DataAccessLog from '../../components/dashboards/DataAccessLog';
import ReferralCard from '../../components/dashboards/ReferralCard';
import ParentAccessCard from '../../components/dashboards/ParentAccessCard';
import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Bell, ArrowRight, Star, MapPin, Upload, X, AlertCircle, ExternalLink, CalendarDays, GraduationCap, Phone, Video, PhoneCall } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { Student } from '../../types';
import StatusBadge from '../../components/StatusBadge';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import SignedFileLink from '../../components/SignedFileLink';

const DOC_TYPES = ['Passport', 'Transcript', 'Diploma/Degree Certificate', 'English Test Certificate', 'SOP', 'LOR', 'CV/Resume', 'Bank Statement', 'Other'];

function fmt12h(time24: string) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}


function UploadDocumentModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !name.trim()) { setError('Select a file or enter a document name.'); return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('name', name.trim() || (file?.name ?? 'Document'));
      fd.append('type', type);
      await api.students.uploadDocument(fd);
      onUploaded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload document.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Upload Document</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl p-5 text-center cursor-pointer transition-colors group">
            <input ref={fileRef} type="file" className="hidden" aria-label="Choose document file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFile} />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <FileText className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
              </div>
            ) : (
              <>
                <Upload className="w-7 h-7 text-gray-300 group-hover:text-blue-500 mx-auto mb-1.5 transition-colors" />
                <p className="text-sm text-gray-500">Click to choose a file from your device</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, Word, JPG, PNG — max 10 MB</p>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. IELTS Score Card"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
            <select aria-label="Document type" value={type} onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 bg-white">
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60">
              {saving ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user, refreshUser } = useAuth();
  const student = user as Student;
  const [showUpload, setShowUpload] = useState(false);
  const [recommendations, setRecommendations] = useState<Array<{ uni: any; score: number; matchPct: number; matchedCourse: any; reasons: string[] }>>([]);
  const [recsLoading, setRecsLoading] = useState(true);
  const [upcomingIntakes, setUpcomingIntakes] = useState<Array<{ uniName: string; uniId: string; intake: string; deadline: string; daysLeft: number }>>([]);
  const [scheduledCalls, setScheduledCalls] = useState<any[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState('');

  useEffect(() => {
    const levelMap: Record<string, string> = {
      undergraduate: 'Bachelor', bachelor: 'Bachelor',
      postgraduate: 'Master', masters: 'Master', master: 'Master',
      phd: 'PhD', doctorate: 'PhD',
      diploma: 'Diploma', certificate: 'Certificate',
    };
    const targetLevel = levelMap[(student.educationLevel || '').toLowerCase()] || '';
    const interestedLower = (student.interestedCourses || []).map((c: string) => c.toLowerCase());

    api.universities.list().then(unis => {
      const scored = unis.map((uni: any) => {
        let score = 0;
        const reasons: string[] = [];
        let matchedCourse: any = null;

        if ((student.preferredCountries || []).includes(uni.country)) {
          score += 30;
          reasons.push('Preferred country');
        }

        const courseMatch = (uni.courses || []).find((c: any) =>
          interestedLower.some((ic: string) => c.name.toLowerCase().includes(ic) || ic.includes(c.name.toLowerCase()))
        );
        if (courseMatch) {
          score += 25;
          matchedCourse = courseMatch;
          reasons.push(`Offers ${courseMatch.name}`);
        }

        if (targetLevel && (uni.courses || []).some((c: any) => c.level === targetLevel)) {
          score += 20;
          reasons.push(`${targetLevel} programs`);
        }

        if (student.budget) {
          const isPostgrad = ['Master', 'PhD'].includes(targetLevel);
          const fee = isPostgrad ? uni.averageFees?.postgraduate : uni.averageFees?.undergraduate;
          if (fee && fee <= student.budget) {
            score += 15;
            reasons.push('Within budget');
          }
        }

        if (student.englishScore?.score && matchedCourse) {
          const reqStr = (matchedCourse.requirements || []).join(' ').toLowerCase();
          const ieltsMatch = reqStr.match(/ielts[\s]*(\d+\.?\d*)/);
          const toeflMatch = reqStr.match(/toefl[\s]*(\d+)/);
          const qualifies =
            (student.englishScore.type === 'IELTS' && ieltsMatch && student.englishScore.score >= parseFloat(ieltsMatch[1])) ||
            (student.englishScore.type === 'TOEFL' && toeflMatch && student.englishScore.score >= parseFloat(toeflMatch[1]));
          if (qualifies) {
            score += 10;
            reasons.push('English score qualifies');
          }
        }

        return { uni, score, matchPct: Math.min(100, score), matchedCourse, reasons };
      });

      setRecommendations(
        scored.filter((r: any) => r.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 4)
      );

      // Build upcoming intakes from applied + preferred universities
      const appliedIds = new Set((student.applications || []).map((a: any) => a.universityId));
      const relevantUnis = unis.filter((u: any) => appliedIds.has(u._id || u.id) || (student.preferredCountries || []).includes(u.country));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const intakeRows: Array<{ uniName: string; uniId: string; intake: string; deadline: string; daysLeft: number }> = [];
      relevantUnis.forEach((uni: any) => {
        (uni.applicationDeadlines || []).forEach((d: any) => {
          if (!d.deadline) return;
          const deadlineDate = new Date(d.deadline);
          if (isNaN(deadlineDate.getTime())) return;
          const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / 86400000);
          if (daysLeft >= 0) {
            intakeRows.push({ uniName: uni.name, uniId: uni.id || uni._id, intake: d.intake, deadline: d.deadline, daysLeft });
          }
        });
      });
      intakeRows.sort((a, b) => a.daysLeft - b.daysLeft);
      setUpcomingIntakes(intakeRows.slice(0, 3));

      setRecsLoading(false);
    }).catch(() => setRecsLoading(false));
  }, []);

  // Fetch meetings from API and filter for call-type upcoming ones
  const loadCalls = () => {
    setCallsLoading(true);
    setCallsError('');
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

  useEffect(() => { loadCalls(); }, []);

  if (!student) return null;

  const apps = [...(student.applications || [])].sort((a: any, b: any) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime() - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime());
  const docs = student.documents || [];

  const appStats = {
    total: apps.length,
    underReview: apps.filter((a: any) => a.status === 'under_review').length,
    offers: apps.filter((a: any) => ['offer_received', 'accepted'].includes(a.status)).length,
    pendingOffers: apps.filter((a: any) => a.status === 'offer_received').length,
  };
  const docStats = {
    total: docs.length,
    verified: docs.filter((d: any) => d.status === 'verified').length,
  };

  const profileFields = [
    { label: 'Phone Number', filled: !!student.phone },
    { label: 'Nationality', filled: !!student.nationality },
    { label: 'Education Level', filled: !!student.educationLevel },
    { label: 'GPA / Percentage', filled: !!student.gpa },
    { label: 'English Test Score', filled: !!(student.englishScore?.score) },
    { label: 'Preferred Countries', filled: (student.preferredCountries?.length || 0) > 0 },
    { label: 'Interested Courses', filled: (student.interestedCourses?.length || 0) > 0 },
    { label: 'Annual Budget', filled: !!student.budget },
  ];
  const completion = Math.round((profileFields.filter(f => f.filled).length / profileFields.length) * 100);
  const filledCount = profileFields.filter(f => f.filled).length;
  const scoreColor = completion === 100 ? 'text-green-600' : completion >= 67 ? 'text-blue-600' : completion >= 34 ? 'text-amber-600' : 'text-red-500';
  const barColor = completion === 100 ? 'bg-green-500' : completion >= 67 ? 'bg-[#0d1b4b]' : completion >= 34 ? 'bg-amber-500' : 'bg-red-500';
  const progressFillClass = `progress-fill-${filledCount}`;

  return (
    <div className="space-y-6">
      {showUpload && (
        <UploadDocumentModal
          onClose={() => setShowUpload(false)}
          onUploaded={refreshUser}
        />
      )}

      {/* Welcome header */}
      <div className="bg-gradient-to-r from-[#0d1b4b] via-blue-700 to-blue-500 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-blue-200 text-sm mb-1">Welcome back,</p>
            <h1 className="text-2xl font-bold">{student.name}</h1>
            <p className="text-blue-200 mt-2 text-sm">Track your applications and explore universities</p>
          </div>
          <Link to="/student/applications" className="hidden md:block bg-white/15 border border-white/20 rounded-xl p-4 text-center hover:bg-white/25 transition-colors">
            <div className="text-2xl font-bold">{appStats.offers}</div>
            <div className="text-xs text-blue-200">Offer(s) Received</div>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[
            { label: 'Applications', value: appStats.total, icon: FileText, to: '/student/applications' },
            { label: 'Under Review', value: appStats.underReview, icon: Clock, to: '/student/applications' },
            { label: 'Docs Verified', value: `${docStats.verified}/${docStats.total}`, icon: CheckCircle, to: '/student/profile' },
          ].map(s => (
            <Link key={s.label} to={s.to} className="bg-white/15 border border-white/20 rounded-xl p-3 text-center hover:bg-white/25 transition-colors">
              <s.icon className="w-5 h-5 mx-auto mb-1 text-blue-200" />
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-blue-200">{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Offer alert — only shown when there are pending (unresponded) offers */}
      {appStats.pendingOffers > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-green-800">You have {appStats.pendingOffers} offer(s)!</p>
            <p className="text-green-600 text-sm">Check your applications and respond to offers.</p>
          </div>
          <Link to="/student/applications" className="text-green-700 font-medium text-sm hover:underline whitespace-nowrap">View offers</Link>
        </div>
      )}

      <NextStepCard />

      <StudentDeadlines />

      <ApplicationTimeline />

      <DocumentChecklist />

      <ReferralCard />

      <ParentAccessCard />

      <DataAccessLog />

      {/* Profile Completion + Upload Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Profile Completion card */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Profile Completion</h2>
              <p className="text-xs text-gray-400 mt-0.5">Fill in all details to get the best university matches</p>
            </div>
            <span className={`text-3xl font-bold ${scoreColor}`}>{completion}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-5">
            <div className={`h-full rounded-full transition-all duration-500 ${progressFillClass} ${barColor}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {profileFields.map(field => (
              <div key={field.label} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm ${field.filled ? 'bg-green-50' : 'bg-orange-50'}`}>
                {field.filled
                  ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />}
                <span className={field.filled ? 'text-green-800 font-medium' : 'text-orange-700'}>{field.label}</span>
              </div>
            ))}
          </div>
          {completion < 100 && (
            <Link to="/student/profile"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              Complete Your Profile <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Upload Documents card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 mb-1">My Documents</h2>
          <p className="text-xs text-gray-400 mb-4">Visible to your counselor and admin</p>
          <div className="flex-1 space-y-2 mb-4">
            {docs.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No documents uploaded yet</p>
              </div>
            ) : docs.slice(0, 4).map((doc: any) => (
              <div key={doc._id || doc.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${doc.status === 'verified' ? 'bg-green-500' : 'bg-yellow-400'}`} />
                  <span className="text-sm font-medium text-gray-700 truncate">{doc.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc.url && (
                    <SignedFileLink href={doc.url} target="_blank" rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Open document">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </SignedFileLink>
                  )}
                  <StatusBadge status={doc.status} />
                </div>
              </div>
            ))}
            {docs.length > 4 && (
              <p className="text-xs text-center text-gray-400">+{docs.length - 4} more document{docs.length - 4 > 1 ? 's' : ''}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm">
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          {docs.length > 0 && (
            <Link to="/student/profile" className="mt-2 text-center text-xs text-blue-600 hover:text-blue-700 font-medium">
              Manage all documents →
            </Link>
          )}
        </div>
      </div>

      {/* Applications + Profile Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">My Applications</h2>
            <Link to="/student/applications" className="text-[#0d1b4b] text-sm font-medium hover:text-[#152258] flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {apps.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No applications yet</p>
              <Link to="/student/universities" className="text-[#0d1b4b] text-sm hover:underline mt-1 inline-block">Browse universities</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((app: any, i: number) => (
                <Link key={app._id || app.id || i} to={`/university/${app.universityId}`}
                  className="flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-xl transition-colors group">
                  <div className="w-10 h-10 bg-[#f0f4ff] rounded-lg flex items-center justify-center text-[#0d1b4b] font-bold text-sm flex-shrink-0">
                    {app.universityName?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-[#0d1b4b]">{app.universityName ?? 'Unknown University'}</p>
                    <p className="text-gray-500 text-xs truncate">{app.courseName ?? ''}</p>
                  </div>
                  <StatusBadge status={app.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Profile Snapshot</h2>
            <Link to="/student/profile" className="text-[#0d1b4b] text-sm font-medium hover:text-[#152258]">Edit Profile</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Nationality', value: student.nationality || '—' },
              { label: 'GPA', value: student.gpa ? `${student.gpa}/10` : '—' },
              { label: 'English', value: student.englishScore ? `${student.englishScore.type} ${student.englishScore.score}` : '—' },
              { label: 'Budget', value: student.budget ? `$${student.budget.toLocaleString()}/yr` : '—' },
            ].map(item => (
              <div key={item.label} className="bg-[#f0f4ff] rounded-xl p-3 text-center">
                <p className="text-xs text-[#0d1b4b]/70 mb-1">{item.label}</p>
                <p className="font-bold text-[#0d1b4b] text-sm">{item.value}</p>
              </div>
            ))}
          </div>
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
          <Link to="/student/activities" className="text-[#0d1b4b] text-sm font-medium hover:text-[#152258] flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {callsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
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
            <p className="text-xs text-gray-400 mt-1">Your counselor will schedule calls for you</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledCalls.slice(0, 3).map(call => {
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
              const counselorName = call.createdByName || call.schedulerName || 'Your Counselor';

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
                    <p className="text-xs text-gray-500 mt-0.5">with {counselorName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{dateLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeLabel}</p>
                  </div>
                  {isToday && (
                    <Link to="/student/activities"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0">
                      <Video className="w-3 h-3" /> Join
                    </Link>
                  )}
                </div>
              );
            })}
            {scheduledCalls.length > 3 && (
              <Link to="/student/activities"
                className="block text-center text-xs text-blue-600 font-medium hover:underline pt-1">
                +{scheduledCalls.length - 3} more scheduled call{scheduledCalls.length - 3 > 1 ? 's' : ''}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Upcoming Intakes */}
      {upcomingIntakes.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">Upcoming Application Deadlines</h2>
            </div>
            <Link to="/student/universities" className="text-[#0d1b4b] text-sm font-medium hover:text-[#152258] flex items-center gap-1">
              Explore <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingIntakes.map((item, i) => {
              const urgent = item.daysLeft <= 14;
              const soon = item.daysLeft <= 30;
              const badgeColor = urgent
                ? 'bg-red-50 text-red-600 border-red-200'
                : soon
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-green-50 text-green-600 border-green-200';
              const dotColor = urgent ? 'bg-red-500' : soon ? 'bg-amber-400' : 'bg-green-500';
              return (
                <Link key={i} to={`/university/${item.uniId}`}
                  className="flex items-center gap-4 p-3.5 bg-gray-50 hover:bg-blue-50 rounded-xl transition-colors group">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-[#0d1b4b]">{item.uniName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.intake} intake · Deadline: {new Date(item.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex-shrink-0 ${badgeColor}`}>
                    {item.daysLeft === 0 ? 'Today!' : item.daysLeft === 1 ? '1 day left' : `${item.daysLeft} days left`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Learning Hub CTA */}
      <div className="bg-gradient-to-r from-[#0d1b4b] to-indigo-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">New to university applications?</p>
            <p className="text-blue-200 text-xs mt-0.5">Learn how to apply — from choosing a university to getting your visa.</p>
          </div>
        </div>
        <Link to="/student/learning"
          className="flex items-center gap-2 bg-white text-[#0d1b4b] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0">
          Open Learning Hub <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recommended For You</h2>
            <p className="text-xs text-gray-400 mt-0.5">Matched to your profile, preferences & budget</p>
          </div>
          <Link to="/student/universities" className="text-[#0d1b4b] text-sm font-medium hover:text-[#152258] flex items-center gap-1">
            Explore all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="p-4 border border-gray-100 rounded-xl animate-pulse">
                <div className="flex gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mb-3" />
                <div className="flex gap-2">
                  <div className="h-5 w-24 bg-gray-100 rounded-lg" />
                  <div className="h-5 w-16 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-10">
            <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium mb-1">No recommendations yet</p>
            <p className="text-gray-400 text-xs mb-4">
              {completion < 50
                ? 'Complete your profile to get personalized university matches'
                : 'Try updating your preferred countries or interested courses'}
            </p>
            <Link to="/student/profile"
              className="inline-flex items-center gap-1.5 text-sm text-white bg-[#0d1b4b] hover:bg-blue-700 px-4 py-2 rounded-xl font-medium transition-colors">
              Complete Profile <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendations.map(({ uni, matchPct, matchedCourse, reasons }) => {
              const matchColor = matchPct >= 70
                ? 'text-green-700 bg-green-50 border-green-200'
                : matchPct >= 45
                ? 'text-blue-700 bg-blue-50 border-blue-200'
                : 'text-amber-700 bg-amber-50 border-amber-200';
              const barColor = matchPct >= 70 ? 'bg-green-500' : matchPct >= 45 ? 'bg-blue-500' : 'bg-amber-500';
              return (
                <Link key={uni.id} to={`/university/${uni.id}`}
                  className="flex flex-col gap-3 p-4 border border-gray-100 rounded-xl hover:border-[#0d1b4b]/30 hover:shadow-md transition-all group">

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-[#f0f4ff] rounded-xl flex items-center justify-center font-bold text-[#0d1b4b] flex-shrink-0 text-sm">
                        {uni.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm group-hover:text-[#0d1b4b] truncate">{uni.name}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{uni.city}, {uni.country}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg border whitespace-nowrap flex-shrink-0 ${matchColor}`}>
                      {matchPct}% match
                    </span>
                  </div>

                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor} match-fill-${Math.round(matchPct / 5) * 5}`} />
                  </div>

                  {matchedCourse && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-[#f0f4ff] text-[#0d1b4b] border border-[#0d1b4b]/20 rounded-lg px-2 py-0.5 font-medium">
                        {matchedCourse.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {matchedCourse.level} · {matchedCourse.duration}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {reasons.map((r: string) => (
                      <span key={r} className="text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
                        ✓ {r}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-50">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      <span>#{uni.ranking} world · {uni.rating}/5</span>
                    </div>
                    {matchedCourse && (
                      <span className="text-gray-500 font-medium">
                        {matchedCourse.currency} {matchedCourse.tuitionFee?.toLocaleString()}/yr
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Getting-started checklist — last, collapsed to its progress line; the cards above cover the first steps */}
      <OnboardingChecklist defaultCollapsed />
    </div>
  );
}
