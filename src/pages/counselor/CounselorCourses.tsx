import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, BookOpen, Calendar, Award, CheckCircle, X, Plus, ShieldCheck, AlertTriangle, AlertCircle, Tag, Download } from 'lucide-react';
import { api } from '../../api';
import { checkCourseEligibility, checkCountryEligibility, ELIGIBILITY_BADGE, EligibilityResult } from '../../utils/eligibility';
import { CourseFilters, EMPTY_FILTERS, filterOptions, flattenCourses, searchCourses } from '../../utils/courseSearch';
import AdvancedCourseSearch from '../../components/AdvancedCourseSearch';
import CourseCustomDataModal, { CourseCustomChips } from '../../components/CourseCustomData';
import { usePortalName } from '../../hooks/usePortalName';
import { exportRowsToCsv } from '../../utils/exportCsv';

const LEVEL_COLORS: Record<string, string> = {
  'Bachelor': 'bg-blue-100 text-blue-700',
  'Master': 'bg-purple-100 text-purple-700',
  'PhD': 'bg-red-100 text-red-700',
  'Diploma': 'bg-green-100 text-green-700',
  'Certificate': 'bg-yellow-100 text-yellow-700',
};

function mergeEligibility(a: EligibilityResult, b: EligibilityResult | null): EligibilityResult {
  if (!b) return a;
  const missing = [...a.missing, ...b.missing];
  const warnings = [...a.warnings, ...b.warnings];
  if (missing.length > 0) return { status: 'not_eligible', missing, warnings };
  if (warnings.length > 0) return { status: 'partial', missing, warnings };
  if (a.status === 'eligible' || b.status === 'eligible') return { status: 'eligible', missing: [], warnings: [] };
  return { status: 'unknown', missing: [], warnings: [] };
}

function EligibilityPanel({ result }: { result: EligibilityResult }) {
  const badge = ELIGIBILITY_BADGE[result.status];
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      result.status === 'eligible'     ? 'bg-green-50 border-green-200' :
      result.status === 'not_eligible' ? 'bg-red-50 border-red-200' :
      result.status === 'partial'      ? 'bg-yellow-50 border-yellow-200' :
                                         'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center gap-2">
        {result.status === 'eligible'     && <ShieldCheck className="w-4 h-4 text-green-600" />}
        {result.status === 'not_eligible' && <AlertCircle className="w-4 h-4 text-red-600" />}
        {result.status === 'partial'      && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
        {result.status === 'unknown'      && <ShieldCheck className="w-4 h-4 text-gray-400" />}
        <span className={`text-xs font-bold ${badge.classes.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
          {result.status === 'eligible'     ? 'Student meets all requirements' :
           result.status === 'not_eligible' ? 'Student does not meet requirements' :
           result.status === 'partial'      ? 'Some profile info missing — review before applying' :
                                              'No eligibility criteria defined'}
        </span>
      </div>
      {result.missing.length > 0 && (
        <ul className="space-y-1">
          {result.missing.map((m, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
              <X className="w-3 h-3 mt-0.5 flex-shrink-0" />{m}
            </li>
          ))}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="space-y-1">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-yellow-700">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />{w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ApplyModal({ course, students, country, onClose }: {
  course: { name: string; uniId: string; uniName: string; intake?: string[]; tuitionFee?: number; currency?: string; level?: string; eligibility?: any };
  students: any[];
  country: any | null;
  onClose: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDropOpen, setStudentDropOpen] = useState(false);
  const [intake, setIntake] = useState(course.intake?.[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);
  const filteredStudents = students.filter(s =>
    !studentSearch || s.name?.toLowerCase().includes(studentSearch.toLowerCase()) || s.email?.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const selectedStudent = students.find(s => (s._id || s.id) === studentId);

  const eligResult: EligibilityResult | null = selectedStudent
    ? mergeEligibility(
        checkCourseEligibility(selectedStudent, course),
        country ? checkCountryEligibility(selectedStudent, country) : null
      )
    : null;

  const isBlocked = eligResult?.status === 'not_eligible';

  useEffect(() => {
    if (!studentDropOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setStudentDropOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [studentDropOpen]);

  const handleApply = async () => {
    if (!studentId) { setError('Please select a student.'); return; }
    if (isBlocked) { setError('Cannot apply — student does not meet eligibility requirements.'); return; }
    setSaving(true); setError('');
    try {
      await api.admin.createApplication({
        studentId,
        universityId: course.uniId,
        universityName: course.uniName,
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
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-bold text-gray-900">Apply for Course</h2>
            <p className="text-sm font-semibold text-blue-700 mt-0.5 truncate">{course.name}</p>
            <p className="text-xs text-gray-500 truncate">{course.uniName}</p>
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
          {/* Student selector */}
          <div className="relative" ref={dropRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Select Student <span className="text-red-500">*</span>
            </label>
            <button type="button"
              onClick={() => setStudentDropOpen(v => !v)}
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
                    <input
                      autoFocus
                      type="text"
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
                    />
                    {studentSearch && (
                      <button type="button" onClick={() => setStudentSearch('')}>
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No students found</p>
                  ) : (
                    filteredStudents.map(s => (
                      <button type="button" key={s._id || s.id}
                        onClick={() => { setStudentId(s._id || s.id); setStudentDropOpen(false); setStudentSearch(''); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex flex-col gap-0.5 ${studentId === (s._id || s.id) ? 'bg-blue-50' : ''}`}>
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <span className="text-xs text-gray-400">{s.email}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Eligibility result */}
          {eligResult && <EligibilityPanel result={eligResult} />}

          {/* Intake */}
          {course.intake && course.intake.length > 0 && (
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
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleApply} disabled={saving || success || isBlocked}
              title={isBlocked ? 'Student does not meet eligibility requirements' : undefined}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 ${
                isBlocked
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#0d1b4b] hover:bg-[#152258] text-white disabled:opacity-60'
              }`}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</>
                : isBlocked
                  ? <><AlertCircle className="w-4 h-4" />Not Eligible</>
                  : <><Plus className="w-4 h-4" />Apply</>}
            </button>
          </div>
        </div>
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

export default function CounselorCourses() {
  const { portal } = usePortalName();
  const [universities, setUniversities] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [filters, setFilters] = useState<CourseFilters>(EMPTY_FILTERS);
  const [applyModal, setApplyModal] = useState<any | null>(null);
  const [customEdit, setCustomEdit] = useState<any | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadCourses = () => {
    setLoadError('');
    api.universities.list().then(setUniversities).catch(() => setLoadError('Failed to load courses.'));
  };

  useEffect(() => {
    loadCourses();
    api.students.list().then(setStudents).catch(() => {});
    api.countries.list().then(setCountries).catch(() => {});
  }, []);

  const allCourses = useMemo(() => flattenCourses(universities), [universities]);
  const results = useMemo(() => searchCourses(allCourses, filters, students), [allCourses, filters, students]);
  const opts = useMemo(() => filterOptions(allCourses), [allCourses]);

  const handleExport = () => {
    exportRowsToCsv('courses.csv', results.map((c: any) => ({
      Course: c.name || '', Level: c.level || '', University: c.uniName || '',
      City: c.city || '', Country: c.country || '', Duration: c.duration || '',
      'Tuition Fee': c.tuitionFee || '', Currency: c.currency || '', Intake: (c.intake || []).join('; '),
    })));
  };

  const applyCustom = (course: any, data: { tags: string[]; customFields: { key: string; value: string }[] }) => {
    const cid = String(course._id || course.id);
    setUniversities(prev => prev.map(u => String(u.id || u._id) !== course.uniId ? u : {
      ...u, courses: (u.courses || []).map((c: any) => String(c._id || c.id) === cid ? { ...c, ...data } : c),
    }));
    setCustomEdit(null);
  };

  const modalCountry = applyModal
    ? (countries.find((c: any) => c.name?.toLowerCase() === applyModal.country?.toLowerCase()) || null)
    : null;

  return (
    <div className="space-y-6">
      {applyModal && (
        <ApplyModal
          course={applyModal}
          students={students}
          country={modalCountry}
          onClose={() => setApplyModal(null)}
        />
      )}
      {customEdit && (
        <CourseCustomDataModal course={customEdit} uniId={customEdit.uniId}
          knownTags={opts.tags} knownKeys={opts.customFieldKeys}
          onClose={() => setCustomEdit(null)} onSaved={data => applyCustom(customEdit, data)} />
      )}

      <div className="bg-gradient-to-r from-green-600 via-green-700 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-green-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
              <h1 className="text-2xl font-bold leading-tight">Available Courses</h1>
            </div>
          </div>
          <button type="button" onClick={handleExport} disabled={results.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0">
            <Download className="w-4 h-4" />Export CSV
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loadError}</div>
          <button type="button" onClick={loadCourses} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      )}

      <AdvancedCourseSearch courses={allCourses} students={students} value={filters} onSearch={setFilters} accent="green" resultCount={results.length} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.map(({ course, eligibility }, i) => (
          <div key={course.id || course._id || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col">
            <div className="flex items-start gap-3 mb-2">
              <div className="w-10 h-10 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden p-1 flex-shrink-0 mt-0.5">
                <UniLogoImg name={course.uniName} website={course.website} uniId={course.uniId} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[course.level] || 'bg-gray-100 text-gray-700'}`}>
                    {course.level}
                  </span>
                  {course.department && <span className="text-xs text-gray-400">{course.department}</span>}
                </div>
                <p className="font-bold text-gray-900">{course.name}</p>
                <p className="text-xs text-[#0d1b4b] mt-0.5">{course.uniName} · {course.city}, {course.country}</p>
              </div>
              {course.tuitionFee > 0 && (
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-[#0d1b4b] text-sm">{course.currency || 'USD'} {Number(course.tuitionFee).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">per year</p>
                </div>
              )}
            </div>

            {course.description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{course.description}</p>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
              {course.duration && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{course.duration}</span>}
              {course.intake?.length > 0 && <span className="text-indigo-600">Intake: {course.intake.join(', ')}</span>}
              {course.paymentPlan && <span className="text-purple-600">{course.paymentPlan} billing</span>}
            </div>

            {(course.applicationFee > 0 || course.scholarshipAvailable) && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {course.applicationFee > 0 && (
                  <span className="text-xs text-gray-600">App fee: <span className="font-semibold text-gray-800">{course.currency || 'USD'} {Number(course.applicationFee).toLocaleString()}</span></span>
                )}
                {course.scholarshipAvailable && (
                  <span className="text-xs font-semibold text-yellow-700 flex items-center gap-1">
                    <Award className="w-3 h-3" />{course.scholarshipAmount || 'Scholarship available'}
                  </span>
                )}
              </div>
            )}

            {eligibility && eligibility.status !== 'unknown' && (() => {
              const badge = ELIGIBILITY_BADGE[eligibility.status];
              const why = [...eligibility.missing, ...eligibility.warnings];
              return (
                <div className="mb-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.classes}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />{badge.label}
                  </span>
                  {why.length > 0 && <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{why.join(' · ')}</p>}
                </div>
              );
            })()}

            <div className="mb-2"><CourseCustomChips course={course} /></div>

            {course.requirements?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {course.requirements.map((req: string) => (
                  <span key={req} className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                    <CheckCircle className="w-3 h-3 text-green-500" />{req}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto pt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setApplyModal(course)}
                className="flex items-center gap-1.5 bg-[#0d1b4b] hover:bg-[#152258] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm">
                <Plus className="w-4 h-4" />Apply for Student
              </button>
              <button type="button" onClick={() => setCustomEdit(course)}
                className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                <Tag className="w-4 h-4" />Tags &amp; details
              </button>
            </div>
          </div>
        ))}

        {results.length === 0 && (
          <div className="col-span-2 text-center py-14 text-gray-400">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{allCourses.length === 0 ? 'Loading courses…' : 'No courses match your filters.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
