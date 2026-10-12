import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Star, Globe, Users, BookOpen, Award, Calendar, DollarSign, ArrowLeft, CheckCircle, XCircle, AlertCircle, ExternalLink, TrendingUp, Share2, Plus, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ApplicationModal from '../components/ApplicationModal';
import type { EligibilityResult } from '../types';

function EligibilityBadge({ result, loading }: { result: EligibilityResult | null; loading: boolean }) {
  const [open, setOpen] = useState(false);
  if (loading) return <span className="inline-flex items-center gap-1 text-xs text-gray-400 animate-pulse">Checking eligibility…</span>;
  if (!result) return null;

  const failCount = result.checks.filter(c => c.status === 'fail' || c.status === 'missing').length;
  const passCount = result.checks.filter(c => c.status === 'pass').length;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
          result.eligible
            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
        }`}
      >
        {result.eligible
          ? <><CheckCircle className="w-3.5 h-3.5" /> Eligible</>
          : <><XCircle className="w-3.5 h-3.5" /> Not Eligible</>}
        <span className="text-xs font-normal opacity-70">— {result.summary}</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && result.checks.length > 0 && (
        <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden text-xs">
          {result.checks.map((c, i) => (
            <div key={i} className={`flex items-start gap-2 px-3 py-2 ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
              {c.status === 'pass'    && <CheckCircle  className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />}
              {c.status === 'fail'    && <XCircle      className="w-3.5 h-3.5 text-red-500   mt-0.5 flex-shrink-0" />}
              {c.status === 'missing' && <XCircle      className="w-3.5 h-3.5 text-red-400   mt-0.5 flex-shrink-0" />}
              {c.status === 'info'    && <AlertCircle  className="w-3.5 h-3.5 text-amber-400  mt-0.5 flex-shrink-0" />}
              <div>
                <span className="font-medium text-gray-700">{c.req}</span>
                <span className="text-gray-400 ml-1">— {c.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useWikipediaPhoto(name: string) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    setPhoto(null);
    fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=1200&origin=*`)
      .then(r => r.json())
      .then(d => {
        const pages = d?.query?.pages;
        if (!pages) return;
        const page = Object.values(pages)[0] as any;
        if (page?.thumbnail?.source) setPhoto(page.thumbnail.source);
      })
      .catch(() => {});
  }, [name]);
  return photo;
}

function CounselorApplyModal({ course, uni, students, onClose, onApplied }: {
  course: any; uni: any; students: any[]; onClose: () => void; onApplied: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDropOpen, setStudentDropOpen] = useState(false);
  const [intake, setIntake] = useState(course.intake?.[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligLoading, setEligLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const filteredStudents = students.filter(s =>
    !studentSearch || s.name?.toLowerCase().includes(studentSearch.toLowerCase()) || s.email?.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const selectedStudent = students.find(s => (s._id || s.id) === studentId);

  useEffect(() => {
    if (!studentDropOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setStudentDropOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [studentDropOpen]);

  useEffect(() => {
    if (!studentId) { setEligibility(null); return; }
    const uniId = (uni._id || uni.id || '').toString();
    const courseId = (course._id || course.id || '').toString();
    if (!uniId || !courseId) return;
    setEligLoading(true);
    api.applications.checkEligibility(uniId, courseId, studentId)
      .then(r => setEligibility(r))
      .catch(() => setEligibility(null))
      .finally(() => setEligLoading(false));
  }, [studentId, uni, course]);

  const handleApply = async () => {
    if (!studentId) { setError('Please select a student.'); return; }
    setSaving(true); setError('');
    try {
      await api.admin.createApplication({
        studentId,
        universityName: uni.name,
        courseName: course.name,
        intake,
        universityId: (uni._id || uni.id || '').toString(),
        courseId: (course._id || course.id || '').toString(),
      });
      setSuccess(true);
      setTimeout(() => { onApplied(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to create application.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-bold text-gray-900">Apply for Course</h2>
            <p className="text-sm font-semibold text-blue-700 mt-0.5 truncate">{course.name}</p>
            <p className="text-xs text-gray-500 truncate">{uni.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="relative" ref={dropRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Student <span className="text-red-500">*</span></label>
            <button type="button" onClick={() => setStudentDropOpen(v => !v)}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm text-left flex items-center justify-between bg-white transition-colors ${studentDropOpen ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className={selectedStudent ? 'text-gray-900' : 'text-gray-400'}>
                {selectedStudent ? `${selectedStudent.name} (${selectedStudent.email})` : '— Choose a student —'}
              </span>
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
            {studentDropOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg">
                    <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <input autoFocus type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400" />
                    {studentSearch && (
                      <button type="button" aria-label="Clear search" onClick={() => setStudentSearch('')}>
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No students found</p>
                  ) : filteredStudents.map(s => (
                    <button type="button" key={s._id || s.id}
                      onClick={() => { setStudentId(s._id || s.id); setStudentDropOpen(false); setStudentSearch(''); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex flex-col gap-0.5 ${studentId === (s._id || s.id) ? 'bg-blue-50' : ''}`}>
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-400">{s.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Eligibility for selected student */}
          {studentId && (
            <div>
              {eligLoading
                ? <p className="text-xs text-gray-400 animate-pulse">Checking eligibility…</p>
                : eligibility && (
                  <div className={`rounded-xl p-3 border text-sm ${eligibility.eligible ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`flex items-center gap-1.5 font-semibold mb-2 ${eligibility.eligible ? 'text-green-700' : 'text-red-700'}`}>
                      {eligibility.eligible ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {eligibility.eligible ? 'Student is Eligible' : 'Student is Not Eligible'}
                      <span className="font-normal text-xs opacity-70 ml-1">— {eligibility.summary}</span>
                    </div>
                    {eligibility.checks.length > 0 && (
                      <div className="space-y-1">
                        {eligibility.checks.map((c, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs">
                            {c.status === 'pass'    && <CheckCircle  className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />}
                            {c.status === 'fail'    && <XCircle      className="w-3 h-3 text-red-500   mt-0.5 flex-shrink-0" />}
                            {c.status === 'missing' && <XCircle      className="w-3 h-3 text-red-400   mt-0.5 flex-shrink-0" />}
                            {c.status === 'info'    && <AlertCircle  className="w-3 h-3 text-amber-400  mt-0.5 flex-shrink-0" />}
                            <span className={c.status === 'fail' || c.status === 'missing' ? 'text-red-700' : 'text-gray-600'}>
                              <strong>{c.req}</strong> — {c.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
            </div>
          )}

          {course.intake?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Intake</label>
              <select value={intake} onChange={e => setIntake(e.target.value)} aria-label="Select intake"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {course.intake.map((i: string) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2.5 rounded-xl">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />Application created successfully!
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="button" onClick={handleApply} disabled={saving || success}
              className="flex-1 py-2.5 bg-[#0d1b4b] hover:bg-[#152258] text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</> : <><Plus className="w-4 h-4" />Apply</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UniLogoBox({ uni }: { uni: any }) {
  const domain = uni.website ? uni.website.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] : '';
  const uniId = uni.id || uni._id;
  const [stage, setStage] = useState<'proxy' | 'favicon' | 'letter'>(uniId ? 'proxy' : domain ? 'favicon' : 'letter');
  const src = stage === 'proxy' ? `/api/unilogo/${uniId}` : `/api/favicon/${domain}`;

  return (
    <div className="w-16 h-16 bg-white rounded-xl border-2 border-white/30 shadow-lg overflow-hidden p-1.5 flex items-center justify-center flex-shrink-0">
      {stage === 'letter' ? (
        <span className="w-full h-full bg-[#0d1b4b] flex items-center justify-center text-white font-bold text-2xl rounded-lg">
          {uni.name?.charAt(0) || '?'}
        </span>
      ) : (
        <img src={src} alt={uni.name} className="w-full h-full object-contain"
          onError={() => {
            if (stage === 'proxy' && domain) setStage('favicon');
            else setStage('letter');
          }} />
      )}
    </div>
  );
}

export default function UniversityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [uni, setUni] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applyModal, setApplyModal] = useState<any>(null);
  const [counselorApplyModal, setCounselorApplyModal] = useState<any>(null);
  const [counselorStudents, setCounselorStudents] = useState<any[]>([]);
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, EligibilityResult>>({});
  const [eligLoading, setEligLoading] = useState(false);

  const wikiPhoto = useWikipediaPhoto(uni?.name || '');

  useEffect(() => {
    if (id) {
      api.universities.get(id)
        .then(setUni)
        .catch(() => setUni(null))
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    if (user?.role === 'counselor') {
      api.students.list().then(setCounselorStudents).catch(() => {});
    }
  }, [user?.role]);

  // Load eligibility for all courses when student views the page
  useEffect(() => {
    if (!uni || user?.role !== 'student') return;
    const uniId = (uni._id || uni.id || '').toString();
    if (!uniId) return;
    setEligLoading(true);
    api.applications.checkEligibilityBulk(uniId)
      .then(setEligibilityMap)
      .catch(() => {})
      .finally(() => setEligLoading(false));
  }, [uni, user?.role]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!uni) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">University not found</h2>
        <Link to="/universities" className="text-blue-600 hover:underline">Back to universities</Link>
      </div>
    </div>
  );

  const levelColors: Record<string, string> = {
    Bachelor: 'bg-blue-100 text-blue-700', Master: 'bg-purple-100 text-purple-700',
    PhD: 'bg-red-100 text-red-700', Diploma: 'bg-green-100 text-green-700',
  };

  const student = user?.role === 'student' ? user as any : null;
  const hasApplied = (course: any) =>
    (student?.applications || []).some((a: any) => a.universityId === uni?.id && a.courseId === course.id);

  return (
    <div className="min-h-screen bg-gray-50">
      {applyModal && (
        <ApplicationModal
          course={applyModal}
          uni={uni}
          onClose={() => setApplyModal(null)}
          onSuccess={() => setApplyModal(null)}
        />
      )}
      {counselorApplyModal && (
        <CounselorApplyModal
          course={counselorApplyModal}
          uni={uni}
          students={counselorStudents}
          onClose={() => setCounselorApplyModal(null)}
          onApplied={() => setCounselorApplyModal(null)}
        />
      )}
      <div className="relative h-72 bg-gradient-to-br from-blue-600 to-indigo-700 overflow-hidden">
        <img src={wikiPhoto || uni.coverImage} alt={uni.name} className="w-full h-full object-cover opacity-50" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20"></div>
        <div className="absolute top-4 left-4">
          <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg hover:bg-white/30 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-4">
              {/* University logo */}
              <UniLogoBox uni={uni} />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full">#{uni.ranking} World Ranking</span>
                  <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">{uni.type}</span>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-white">{uni.name}</h1>
                <div className="flex items-center gap-2 mt-2 text-white/90">
                  <MapPin className="w-4 h-4" /><span>{uni.city}, {uni.country}</span>
                  <span>•</span><span>Est. {uni.founded}</span>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center text-white">
                <div className="flex items-center gap-1 justify-center">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span className="text-xl font-bold">{uni.rating}</span>
                </div>
                <span className="text-xs">Rating</span>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center text-white">
                <div className="text-xl font-bold">{uni.acceptanceRate}%</div>
                <span className="text-xs">Accept Rate</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: 'Total Students', value: uni.totalStudents != null ? uni.totalStudents.toLocaleString() : '—' },
                { icon: Globe, label: 'Intl. Students', value: uni.internationalStudents != null ? uni.internationalStudents.toLocaleString() : '—' },
                { icon: BookOpen, label: 'Courses Offered', value: (uni.courses?.length ?? 0).toString() },
                { icon: TrendingUp, label: 'Acceptance Rate', value: uni.acceptanceRate != null ? `${uni.acceptanceRate}%` : '—' },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-2xl p-4 text-center border border-gray-100 shadow-sm">
                  <stat.icon className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <div className="text-xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">About {uni.name}</h2>
              <p className="text-gray-600 leading-relaxed">{uni.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {uni.tags.map((tag: string) => <span key={tag} className="bg-sky-50 text-blue-700 text-sm px-3 py-1 rounded-full">{tag}</span>)}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-5">Available Courses</h2>
              <div className="space-y-4">
                {uni.courses.map((course: any, idx: number) => (
                  <div key={course._id || course.id || idx} className="border border-gray-100 rounded-xl p-5 hover:border-blue-200 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelColors[course.level] || 'bg-gray-100 text-gray-700'}`}>{course.level}</span>
                          <span className="text-xs text-gray-400">{course.department}</span>
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg">{course.name}</h3>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-700">{course.currency} {course.tuitionFee != null ? course.tuitionFee.toLocaleString() : '—'}</p>
                        <p className="text-xs text-gray-400">per year</p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm mb-3">{course.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {course.duration}</span>
                      {course.intake?.length > 0 && <span>Intake: {course.intake.join(', ')}</span>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {course.requirements?.map((req: string) => (
                        <span key={req} className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
                          <CheckCircle className="w-3 h-3 text-green-500" /> {req}
                        </span>
                      ))}
                    </div>
                    {/* Eligibility badge for students */}
                    {isAuthenticated && user?.role === 'student' && (
                      <EligibilityBadge
                        result={eligibilityMap[course.id || course._id?.toString()] ?? null}
                        loading={eligLoading && !eligibilityMap[course.id || course._id?.toString()]}
                      />
                    )}
                    {isAuthenticated && user?.role === 'student' && (
                      hasApplied(course) ? (
                        <span className="mt-4 inline-flex items-center gap-1 text-sm text-green-700 font-medium">
                          <CheckCircle className="w-4 h-4" /> Applied
                        </span>
                      ) : (
                        <button type="button" onClick={() => setApplyModal(course)}
                          className="mt-4 bg-[#0d1b4b] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#152258] transition-colors font-medium">
                          Apply to this Course
                        </button>
                      )
                    )}
                    {isAuthenticated && user?.role === 'counselor' && (
                      <button type="button" onClick={() => setCounselorApplyModal(course)}
                        className="mt-4 flex items-center gap-1.5 bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />Apply for Student
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Campus Facilities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {uni.facilities.map((f: string) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />{f}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {wikiPhoto && (
              <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                <div className="relative h-44">
                  <img src={wikiPhoto} alt={`${uni.name} campus`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <p className="absolute bottom-2 right-3 text-white/70 text-[10px]">Photo · Wikipedia</p>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-6 shadow-lg">
              <h3 className="font-bold text-lg mb-4">Interested in {uni.name}?</h3>
              {isAuthenticated && user?.role === 'student' ? (
                <button type="button"
                  onClick={() => uni?.courses?.[0] && setApplyModal(uni.courses[0])}
                  className="block w-full text-center bg-[#0d1b4b] hover:bg-[#152258] text-white font-bold py-3 rounded-xl transition-colors">
                  Start Application
                </button>
              ) : isAuthenticated && user?.role === 'counselor' ? (
                <button type="button"
                  onClick={() => uni?.courses?.[0] && setCounselorApplyModal(uni.courses[0])}
                  className="flex items-center justify-center gap-2 w-full bg-[#0d1b4b] hover:bg-[#152258] text-white font-bold py-3 rounded-xl transition-colors">
                  <Plus className="w-4 h-4" />Apply for a Student
                </button>
              ) : isAuthenticated ? (
                <Link to="/counselor/applications" className="block w-full text-center bg-white text-blue-700 font-bold py-3 rounded-xl hover:bg-sky-50 transition-colors">View Applications</Link>
              ) : (
                <Link to="/login" className="block w-full text-center bg-white text-blue-700 font-bold py-3 rounded-xl hover:bg-sky-50 transition-colors">Sign In to Apply</Link>
              )}
              <a href={uni.website} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 mt-3 text-white/80 text-sm hover:text-white">
                <ExternalLink className="w-4 h-4" /> Visit Official Website
              </a>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-blue-600" /> Tuition Fees</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-gray-600 text-sm">Undergraduate</span><span className="font-bold text-gray-900">{uni.averageFees.currency} {uni.averageFees.undergraduate.toLocaleString()}/yr</span></div>
                <div className="flex justify-between"><span className="text-gray-600 text-sm">Postgraduate</span><span className="font-bold text-gray-900">{uni.averageFees.currency} {uni.averageFees.postgraduate.toLocaleString()}/yr</span></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-600" /> Application Deadlines</h3>
              <div className="space-y-3">
                {uni.applicationDeadlines.map((d: any) => (
                  <div key={d.intake} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{d.intake}</span>
                    <span className="text-sm text-blue-700 font-semibold">{d.deadline}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" /> Scholarships</h3>
              <div className="space-y-4">
                {uni.scholarships.map((s: any) => (
                  <div key={s.name} className="border-l-4 border-yellow-400 pl-4">
                    <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                    <p className="text-yellow-700 font-bold">{s.currency} {s.amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.eligibility}</p>
                    <p className="text-xs text-gray-400">Deadline: {s.deadline}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Social media links */}
            {uni.socialLinks && Object.values(uni.socialLinks).some(Boolean) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-blue-600" /> Follow on Social Media
                </h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'facebook',  label: 'Facebook',   cls: 'bg-blue-600 hover:bg-blue-700' },
                    { key: 'twitter',   label: 'Twitter / X', cls: 'bg-black hover:bg-gray-800' },
                    { key: 'linkedin',  label: 'LinkedIn',   cls: 'bg-sky-600 hover:bg-sky-700' },
                    { key: 'instagram', label: 'Instagram',  cls: 'bg-pink-600 hover:bg-pink-700' },
                    { key: 'youtube',   label: 'YouTube',    cls: 'bg-red-600 hover:bg-red-700' },
                  ]
                    .filter(s => uni.socialLinks[s.key])
                    .map(s => (
                      <a
                        key={s.key}
                        href={uni.socialLinks[s.key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors ${s.cls}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {s.label}
                      </a>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
