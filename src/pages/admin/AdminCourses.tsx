import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, X, Search, BookOpen, Edit2, DollarSign, Check, Award,
  Calendar, ChevronDown, ChevronUp, GraduationCap, CheckCircle, Tag,
} from 'lucide-react';
import { api } from '../../api';
import { checkCourseEligibility, ELIGIBILITY_BADGE, EligibilityResult } from '../../utils/eligibility';
import { CourseFilters, EMPTY_FILTERS, filterOptions, flattenCourses, searchCourses } from '../../utils/courseSearch';
import AdvancedCourseSearch from '../../components/AdvancedCourseSearch';
import CourseCustomDataModal, { CourseCustomChips } from '../../components/CourseCustomData';

const LEVELS = ['Bachelor', 'Master', 'PhD', 'Diploma', 'Certificate'];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'SGD', 'NZD'];
const INTAKES = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'];
const PAYMENT_PLANS = ['Annual', 'Semester', 'Monthly'];

const LEVEL_COLORS: Record<string, string> = {
  'Bachelor': 'bg-blue-100 text-blue-700',
  'Master': 'bg-purple-100 text-purple-700',
  'PhD': 'bg-red-100 text-red-700',
  'Diploma': 'bg-green-100 text-green-700',
  'Certificate': 'bg-yellow-100 text-yellow-700',
};

function normalId(obj: any) { return (obj?._id || obj?.id)?.toString() ?? ''; }

function Spinner({ white = false }: { white?: boolean }) {
  return <span className={`w-4 h-4 border-2 ${white ? 'border-white/40 border-t-white' : 'border-gray-300 border-t-gray-600'} rounded-full animate-spin inline-block`} />;
}

const EDU_LEVELS = ['12th Grade', 'Diploma', 'Certificate', 'Bachelor', 'Master', 'PhD'];
const ENGLISH_TESTS = ['IELTS', 'TOEFL', 'PTE', 'Duolingo'];

const DEFAULT_COURSE = {
  name: '', level: '', duration: '', tuitionFee: '', currency: 'USD',
  department: '', description: '', intake: [] as string[], requirements: [] as string[],
  applicationFee: '', registrationFee: '', scholarshipAvailable: false,
  scholarshipAmount: '', paymentPlan: 'Annual',
  eligibility: {
    minEducationLevel: '', minGPA: '', minWorkExperienceYears: '',
    minAge: '', maxAge: '',
    englishRequirements: [] as { test: string; minScore: string }[],
    restrictedNationalities: [] as string[],
  },
};

function ApplyModal({ course, students, onClose }: {
  course: any;
  students: any[];
  onClose: () => void;
}) {
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [intake, setIntake] = useState(course.intake?.[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const matchedStudents = studentQuery.trim().length >= 1
    ? students.filter(s =>
        s.name?.toLowerCase().includes(studentQuery.toLowerCase()) ||
        s.email?.toLowerCase().includes(studentQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  useEffect(() => {
    if (!selectedStudent) { setStudentProfile(null); return; }
    setLoadingProfile(true);
    api.students.get(normalId(selectedStudent))
      .then(p => { setStudentProfile(p); setLoadingProfile(false); })
      .catch(() => { setStudentProfile(selectedStudent); setLoadingProfile(false); });
  }, [selectedStudent]);

  const elig = studentProfile
    ? checkCourseEligibility(studentProfile, course)
    : { status: 'unknown' as const, missing: [] as string[], warnings: [] as string[] };
  const badge = ELIGIBILITY_BADGE[elig.status];
  const isNotEligible = elig.status === 'not_eligible';

  const handleApply = async () => {
    if (!selectedStudent) { setError('Please select a student.'); return; }
    if (isNotEligible) { setError('Student is not eligible for this course.'); return; }
    setSaving(true); setError('');
    try {
      await api.admin.createApplication({
        studentId: normalId(selectedStudent),
        universityId: course._uniId,
        universityName: course._uniName,
        courseName: course.name,
        intake,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to create application.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-bold text-gray-900">Apply for Course</h2>
            <p className="text-sm font-semibold text-blue-700 mt-0.5 truncate">{course.name}</p>
            <p className="text-xs text-gray-500 truncate">{course._uniName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {course.level && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[course.level] || 'bg-gray-100 text-gray-700'}`}>
              {course.level}
            </span>
          )}
          {course.tuitionFee && course.tuitionFee > 0 && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              {course.currency || 'USD'} {Number(course.tuitionFee).toLocaleString()}/yr
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Student search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Student <span className="text-red-500">*</span></label>
            {selectedStudent ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900 truncate">{selectedStudent.name}</p>
                  <p className="text-xs text-blue-600 truncate">{selectedStudent.email}</p>
                </div>
                <button type="button" aria-label="Clear student" onClick={() => { setSelectedStudent(null); setStudentProfile(null); setStudentQuery(''); }}
                  className="text-blue-400 hover:text-blue-700 flex-shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  value={studentQuery}
                  onChange={e => { setStudentQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Type name or email…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {showDropdown && matchedStudents.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {matchedStudents.map(s => (
                      <button key={normalId(s)} type="button"
                        onMouseDown={() => { setSelectedStudent(s); setStudentQuery(''); setShowDropdown(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0">
                        <p className="text-sm font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Eligibility result */}
          {selectedStudent && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              {loadingProfile ? (
                <p className="text-xs text-gray-500 flex items-center gap-2"><Spinner />Checking eligibility…</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">Eligibility:</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.classes}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />{badge.label}
                    </span>
                  </div>
                  {elig.missing.map((m, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                      <X className="w-3 h-3 flex-shrink-0" />{m}
                    </p>
                  ))}
                  {elig.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-700 flex items-center gap-1.5">
                      <span className="text-yellow-500 font-bold flex-shrink-0">⚠</span>{w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {course.intake && course.intake.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Intake</label>
              <select value={intake} onChange={e => setIntake(e.target.value)} aria-label="Select intake"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
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
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            {isNotEligible ? (
              <div className="flex-1 py-2.5 bg-red-100 text-red-700 border border-red-200 rounded-xl text-sm font-semibold text-center">
                Not Eligible
              </div>
            ) : (
              <button type="button" onClick={handleApply} disabled={saving || success || !selectedStudent}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</>
                  : <><Plus className="w-4 h-4" />Apply</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseModal({ universities, uniId: initialUniId, course, onClose, onSaved }: {
  universities: any[]; uniId?: string; course?: any; onClose: () => void; onSaved: () => void;
}) {
  const editing = !!course;
  const [uniId, setUniId] = useState(initialUniId || '');
  const [form, setForm] = useState(editing ? {
    name: course.name || '', level: course.level || '', duration: course.duration || '',
    tuitionFee: String(course.tuitionFee || ''), currency: course.currency || 'USD',
    department: course.department || '', description: course.description || '',
    intake: course.intake || [], requirements: course.requirements || [],
    applicationFee: String(course.applicationFee || ''), registrationFee: String(course.registrationFee || ''),
    scholarshipAvailable: course.scholarshipAvailable || false,
    scholarshipAmount: course.scholarshipAmount || '', paymentPlan: course.paymentPlan || 'Annual',
    eligibility: {
      minEducationLevel: course.eligibility?.minEducationLevel || '',
      minGPA: String(course.eligibility?.minGPA || ''),
      minWorkExperienceYears: String(course.eligibility?.minWorkExperienceYears || ''),
      minAge: String(course.eligibility?.minAge || ''),
      maxAge: String(course.eligibility?.maxAge || ''),
      englishRequirements: (course.eligibility?.englishRequirements || []).map((r: any) => ({ test: r.test, minScore: String(r.minScore) })),
      restrictedNationalities: course.eligibility?.restrictedNationalities || [],
    },
  } : { ...DEFAULT_COURSE });
  const [reqInput, setReqInput] = useState('');
  const [engTest, setEngTest]   = useState('IELTS');
  const [engScore, setEngScore] = useState('');
  const [natInput, setNatInput] = useState('');
  const [showElig, setShowElig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setElig = (k: string, v: any) => setForm(f => ({ ...f, eligibility: { ...f.eligibility, [k]: v } }));
  const toggleIntake = (m: string) => set('intake', form.intake.includes(m) ? form.intake.filter((x: string) => x !== m) : [...form.intake, m]);
  const addReq = () => { if (reqInput.trim()) { set('requirements', [...form.requirements, reqInput.trim()]); setReqInput(''); } };
  const addEngReq = () => {
    if (!engScore.trim()) return;
    const existing = form.eligibility.englishRequirements.filter((r: any) => r.test !== engTest);
    setElig('englishRequirements', [...existing, { test: engTest, minScore: engScore }]);
    setEngScore('');
  };
  const addNat = () => {
    if (!natInput.trim()) return;
    setElig('restrictedNationalities', [...form.eligibility.restrictedNationalities, natInput.trim()]);
    setNatInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uniId) { setError('Please select a university.'); return; }
    if (!form.name.trim()) { setError('Course name is required.'); return; }
    setSaving(true); setError('');
    try {
      const elig = form.eligibility;
      const payload = {
        ...form,
        tuitionFee: parseFloat(form.tuitionFee) || 0,
        applicationFee: parseFloat(form.applicationFee) || 0,
        registrationFee: parseFloat(form.registrationFee) || 0,
        eligibility: {
          minEducationLevel: elig.minEducationLevel || null,
          minGPA: parseFloat(elig.minGPA) || null,
          minWorkExperienceYears: parseFloat(elig.minWorkExperienceYears) || null,
          minAge: parseInt(elig.minAge) || null,
          maxAge: parseInt(elig.maxAge) || null,
          englishRequirements: elig.englishRequirements.map((r: any) => ({ test: r.test, minScore: parseFloat(r.minScore) || 0 })),
          restrictedNationalities: elig.restrictedNationalities,
        },
      };
      if (editing) {
        await api.admin.updateCourse(uniId, normalId(course), payload);
      } else {
        await api.admin.addCourse(uniId, payload);
      }
      onSaved();
    } catch (err: any) { setError(err.message || 'Failed to save course.'); }
    setSaving(false);
  };

  const inp = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Course' : 'Add Course'}</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">University <span className="text-red-500">*</span></label>
              <select value={uniId} onChange={e => setUniId(e.target.value)} className={`${inp} bg-white`}>
                <option value="">Select university…</option>
                {universities.map(u => <option key={normalId(u)} value={normalId(u)}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Course Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. MSc Computer Science" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Level</label>
              <select value={form.level} onChange={e => set('level', e.target.value)} className={`${inp} bg-white`}>
                <option value="">Select…</option>
                {LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration</label>
              <input value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="e.g. 2 years" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tuition Fee / year</label>
              <input type="number" min="0" value={form.tuitionFee} onChange={e => set('tuitionFee', e.target.value)} placeholder="e.g. 25000" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className={`${inp} bg-white`}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Application Fee</label>
              <input type="number" min="0" value={form.applicationFee} onChange={e => set('applicationFee', e.target.value)} placeholder="e.g. 75" className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Registration Fee</label>
              <input type="number" min="0" value={form.registrationFee} onChange={e => set('registrationFee', e.target.value)} placeholder="e.g. 200" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Plan</label>
            <div className="flex gap-2">
              {PAYMENT_PLANS.map(p => (
                <button key={p} type="button" onClick={() => set('paymentPlan', p)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${form.paymentPlan === p ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Department</label>
            <input value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. School of Engineering" className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              placeholder="Brief course description…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Intake Months</label>
            <div className="flex flex-wrap gap-1.5">
              {INTAKES.map(m => (
                <button key={m} type="button" onClick={() => toggleIntake(m)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${form.intake.includes(m) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'}`}>
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Entry Requirements</label>
            <div className="flex gap-2 mb-2">
              <input value={reqInput} onChange={e => setReqInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addReq(); } }}
                placeholder="e.g. IELTS 6.5+" className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <button type="button" onClick={addReq} className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100">Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.requirements.map((r: string, i: number) => (
                <span key={i} className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full border border-purple-100">
                  {r}
                  <button type="button" onClick={() => set('requirements', form.requirements.filter((_: string, j: number) => j !== i))} className="text-purple-400 hover:text-purple-700 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.scholarshipAvailable} onChange={e => set('scholarshipAvailable', e.target.checked)} className="w-4 h-4 accent-purple-600 rounded" />
              <span className="text-sm font-medium text-gray-700">Scholarship Available</span>
            </label>
            {form.scholarshipAvailable && (
              <input value={form.scholarshipAmount} onChange={e => set('scholarshipAmount', e.target.value)} placeholder="e.g. Up to USD 5,000/year"
                className="mt-2 w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            )}
          </div>

          {/* Eligibility Criteria */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setShowElig(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700">
              <span className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-500" />
                Eligibility Criteria
              </span>
              {showElig ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showElig && (
              <div className="p-4 space-y-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Education Level</label>
                    <select value={form.eligibility.minEducationLevel} onChange={e => setElig('minEducationLevel', e.target.value)}
                      className={`${inp} bg-white text-sm`}>
                      <option value="">No requirement</option>
                      {EDU_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min GPA (%)</label>
                    <input type="number" min="0" max="100" value={form.eligibility.minGPA}
                      onChange={e => setElig('minGPA', e.target.value)}
                      placeholder="e.g. 60" className={inp} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Work Exp (years)</label>
                    <input type="number" min="0" value={form.eligibility.minWorkExperienceYears}
                      onChange={e => setElig('minWorkExperienceYears', e.target.value)}
                      placeholder="e.g. 2" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Min Age</label>
                    <input type="number" min="0" value={form.eligibility.minAge}
                      onChange={e => setElig('minAge', e.target.value)}
                      placeholder="e.g. 18" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Age</label>
                    <input type="number" min="0" value={form.eligibility.maxAge}
                      onChange={e => setElig('maxAge', e.target.value)}
                      placeholder="e.g. 35" className={inp} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">English Requirements</label>
                  <div className="flex gap-2 mb-2">
                    <select value={engTest} onChange={e => setEngTest(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                      {ENGLISH_TESTS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <input type="number" min="0" value={engScore} onChange={e => setEngScore(e.target.value)}
                      placeholder="Min score" className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <button type="button" onClick={addEngReq}
                      className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100 whitespace-nowrap">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.eligibility.englishRequirements.map((r: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-100">
                        {r.test} ≥ {r.minScore}
                        <button type="button"
                          onClick={() => setElig('englishRequirements', form.eligibility.englishRequirements.filter((_: any, j: number) => j !== i))}
                          className="text-blue-400 hover:text-blue-700 ml-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Restricted Nationalities</label>
                  <div className="flex gap-2 mb-2">
                    <input value={natInput} onChange={e => setNatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNat(); } }}
                      placeholder="e.g. Iran, North Korea…"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <button type="button" onClick={addNat}
                      className="px-3 py-2 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-100">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.eligibility.restrictedNationalities.map((n: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2.5 py-1 rounded-full border border-red-100">
                        {n}
                        <button type="button"
                          onClick={() => setElig('restrictedNationalities', form.eligibility.restrictedNationalities.filter((_: string, j: number) => j !== i))}
                          className="text-red-400 hover:text-red-700 ml-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <><Spinner white />{editing ? 'Saving…' : 'Adding…'}</> : <><Check className="w-4 h-4" />{editing ? 'Update Course' : 'Add Course'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UniLogoImg({ name, website, uniId }: { name: string; website?: string; uniId?: string }) {
  const domain = website ? website.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] : '';
  const initial: 'proxy' | 'favicon' | 'letter' = uniId ? 'proxy' : domain ? 'favicon' : 'letter';
  const [stage, setStage] = useState(initial);
  if (stage === 'letter') {
    return (
      <span className="w-full h-full bg-[#0d1b4b] flex items-center justify-center text-white font-bold text-base rounded-lg leading-none">
        {name?.charAt(0) || '?'}
      </span>
    );
  }
  const src = stage === 'proxy' ? `/api/unilogo/${uniId}` : `/api/favicon/${domain}`;
  return (
    <img src={src} alt={name} className="w-full h-full object-contain"
      onError={() => { if (stage === 'proxy' && domain) setStage('favicon'); else setStage('letter'); }} />
  );
}

function CourseCard({ course, uniName, uniId, onEdit, onDelete, onApply, onCustom, eligibility }: {
  course: any; uniName: string; uniId?: string; onEdit: () => void; onDelete: () => void; onApply: () => void;
  onCustom: () => void; eligibility?: EligibilityResult;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="w-10 h-10 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden p-1 flex-shrink-0 mt-0.5">
          <UniLogoImg name={uniName} website={course.website} uniId={uniId} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900">{course.name}</p>
            {course.level && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[course.level] || 'bg-gray-100 text-gray-600'}`}>
                {course.level}
              </span>
            )}
            {course.scholarshipAvailable && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                <Award className="w-3 h-3" /> Scholarship
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <GraduationCap className="w-3 h-3" /> {uniName}
            </span>
            {course.department && <span className="text-xs text-gray-400">{course.department}</span>}
            {course.duration && <span className="text-xs text-gray-400">{course.duration}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 mt-1">
            {course.tuitionFee > 0 && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> {course.currency} {Number(course.tuitionFee).toLocaleString()} / year
              </span>
            )}
            {course.intake?.length > 0 && (
              <span className="text-xs text-sky-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {course.intake.slice(0, 3).map((m: string) => m.slice(0, 3)).join(', ')}{course.intake.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
          {eligibility && eligibility.status !== 'unknown' && (
            <span title={[...eligibility.missing, ...eligibility.warnings].join(' · ')}
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border mt-1.5 ${ELIGIBILITY_BADGE[eligibility.status].classes}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ELIGIBILITY_BADGE[eligibility.status].dot}`} />{ELIGIBILITY_BADGE[eligibility.status].label}
            </span>
          )}
          <div className="mt-1.5"><CourseCustomChips course={course} /></div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={onApply}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0d1b4b] hover:bg-[#152258] active:scale-95 transition-all shadow-sm">
            <Plus className="w-3.5 h-3.5" /> Apply
          </button>
          <button type="button" onClick={onCustom}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all">
            <Tag className="w-3.5 h-3.5" /> Tags
          </button>
          <button type="button" onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100 active:scale-95 transition-all">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <button type="button" onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 active:scale-95 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          {(course.description || course.requirements?.length > 0) && (
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? 'Hide' : 'More'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 space-y-3">
          {course.description && <p className="text-sm text-gray-600">{course.description}</p>}
          {course.requirements?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Entry Requirements</p>
              <div className="flex flex-wrap gap-2">
                {course.requirements.map((r: string, i: number) => (
                  <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-100">{r}</span>
                ))}
              </div>
            </div>
          )}
          {(course.applicationFee > 0 || course.registrationFee > 0 || course.scholarshipAmount) && (
            <div className="grid grid-cols-3 gap-3 text-xs">
              {course.applicationFee > 0 && (
                <div><span className="text-gray-400">App Fee:</span> <span className="font-medium text-gray-700">{course.currency} {Number(course.applicationFee).toLocaleString()}</span></div>
              )}
              {course.registrationFee > 0 && (
                <div><span className="text-gray-400">Reg Fee:</span> <span className="font-medium text-gray-700">{course.currency} {Number(course.registrationFee).toLocaleString()}</span></div>
              )}
              {course.scholarshipAmount && (
                <div><span className="text-gray-400">Scholarship:</span> <span className="font-medium text-amber-700">{course.scholarshipAmount}</span></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminCourses() {
  const [universities, setUniversities] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CourseFilters>(EMPTY_FILTERS);
  const [customEdit, setCustomEdit] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<{ course: any; uniId: string } | null>(null);
  const [applyModal, setApplyModal] = useState<any | null>(null);

  const fetchUniversities = () => {
    setLoading(true);
    api.universities.list()
      .then(setUniversities)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUniversities();
    api.admin.students().then(setStudents).catch(() => {});
  }, []);

  const allCourses = useMemo(() => flattenCourses(universities).map(c => ({
    ...c, _uniId: c.uniMongoId, _uniName: c.uniName, _uniCountry: c.country || '', _uniLogo: c.uniLogo,
  })), [universities]);
  const results = useMemo(() => searchCourses(allCourses, filters, students), [allCourses, filters, students]);
  const opts = useMemo(() => filterOptions(allCourses), [allCourses]);

  const applyCustom = (course: any, data: { tags: string[]; customFields: { key: string; value: string }[] }) => {
    const cid = normalId(course);
    setUniversities(prev => prev.map(u => normalId(u) !== course._uniId ? u : {
      ...u, courses: (u.courses || []).map((c: any) => normalId(c) === cid ? { ...c, ...data } : c),
    }));
    setCustomEdit(null);
  };

  const handleDelete = async (uniId: string, courseId: string) => {
    if (!window.confirm('Delete this course? This cannot be undone.')) return;
    try {
      await api.admin.deleteCourse(uniId, courseId);
      fetchUniversities();
    } catch { alert('Failed to delete course.'); }
  };

  const totalCourses = allCourses.length;
  const withScholarship = allCourses.filter(c => c.scholarshipAvailable).length;

  return (
    <>
      {showAdd && (
        <CourseModal
          universities={universities}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchUniversities(); }}
        />
      )}
      {editing && (
        <CourseModal
          universities={universities}
          uniId={editing.uniId}
          course={editing.course}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchUniversities(); }}
        />
      )}
      {applyModal && (
        <ApplyModal
          course={applyModal}
          students={students}
          onClose={() => setApplyModal(null)}
        />
      )}
      {customEdit && (
        <CourseCustomDataModal course={customEdit} uniId={customEdit._uniId}
          knownTags={opts.tags} knownKeys={opts.customFieldKeys}
          onClose={() => setCustomEdit(null)} onSaved={data => applyCustom(customEdit, data)} />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wide">Admin Portal</p>
                <h1 className="text-2xl font-bold leading-tight">Courses Management</h1>
              </div>
            </div>
            <button type="button" onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-50 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Add Course
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Courses', value: totalCourses },
              { label: 'Universities', value: universities.length },
              { label: 'With Scholarship', value: withScholarship },
            ].map(s => (
              <div key={s.label} className="bg-white/10 border border-white/20 rounded-xl p-4 backdrop-blur-sm">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-xs text-white/60 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <AdvancedCourseSearch courses={allCourses} students={students} value={filters} onSearch={setFilters} accent="purple" resultCount={results.length} />

        {/* Course list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center text-gray-400 shadow-sm">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">
              {allCourses.length ? 'No courses match your filters.' : 'No courses yet. Add courses via universities or use the button above.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map(({ course: c, eligibility }) => (
              <CourseCard
                key={`${c._uniId}-${normalId(c)}`}
                course={c}
                uniName={c._uniName}
                uniId={c._uniId}
                onEdit={() => setEditing({ course: c, uniId: c._uniId })}
                onDelete={() => handleDelete(c._uniId, normalId(c))}
                onApply={() => setApplyModal(c)}
                onCustom={() => setCustomEdit(c)}
                eligibility={eligibility}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
