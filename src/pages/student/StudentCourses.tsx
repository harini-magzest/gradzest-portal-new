import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, BookOpen, Calendar, Award, CheckCircle, X, ShieldCheck, AlertCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ApplicationModal from '../../components/ApplicationModal';
import { checkCourseEligibility, ELIGIBILITY_BADGE } from '../../utils/eligibility';
import { useShortlist } from '../../hooks/useShortlist';

const LEVELS = ['Bachelor', 'Master', 'PhD', 'Diploma', 'Certificate'];
const LEVEL_COLORS: Record<string, string> = {
  'Bachelor': 'bg-blue-100 text-blue-700',
  'Master': 'bg-purple-100 text-purple-700',
  'PhD': 'bg-red-100 text-red-700',
  'Diploma': 'bg-green-100 text-green-700',
  'Certificate': 'bg-yellow-100 text-yellow-700',
};

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

export default function StudentCourses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [student, setStudent] = useState<any>(user);
  const [universities, setUniversities] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [uniFilter, setUniFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [applyModal, setApplyModal] = useState<{ course: any; uni: any } | null>(null);
  const shortlist = useShortlist();

  const loadCourses = () => {
    setLoadError('');
    api.universities.list().then(setUniversities).catch(() => setLoadError('Failed to load courses.'));
  };

  useEffect(() => {
    loadCourses();
    api.students.me().then(setStudent).catch(() => toast.error('Failed to load your eligibility info.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCourses = universities.flatMap(uni =>
    (uni.courses || []).map((c: any) => ({ ...c, uniName: uni.name, uniId: uni.id || uni._id, city: uni.city, country: uni.country, website: uni.website, uniLogo: uni.logo, _uniUpdatedAt: uni.updatedAt || uni.createdAt || 0 }))
  );

  const uniNames = [...new Set(universities.map(u => u.name))].sort() as string[];
  const countryList = [...new Set(universities.map((u: any) => u.country).filter(Boolean))].sort() as string[];

  const coursesWithElig = allCourses.map(c => ({
    ...c,
    _elig: checkCourseEligibility(student, c),
  }));

  const filtered = coursesWithElig.filter(c => {
    const q = query.toLowerCase();
    const matchQ = !query || c.name?.toLowerCase().includes(q) || c.uniName?.toLowerCase().includes(q) || c.department?.toLowerCase().includes(q);
    const matchLevel = !level || c.level === level;
    const matchUni = !uniFilter || c.uniName === uniFilter;
    const matchCountry = !countryFilter || c.country === countryFilter;
    const matchElig = !eligibleOnly || c._elig.status === 'eligible';
    return matchQ && matchLevel && matchUni && matchCountry && matchElig;
  }).sort((a, b) => new Date(b._uniUpdatedAt).getTime() - new Date(a._uniUpdatedAt).getTime());

  const hasFilters = query || level || uniFilter || countryFilter || eligibleOnly;

  return (
    <div className="space-y-6">
      {applyModal && (
        <ApplicationModal
          course={applyModal.course}
          uni={applyModal.uni}
          onClose={() => setApplyModal(null)}
          onSuccess={() => setApplyModal(null)}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Available Courses</h1>
          <p className="text-gray-500 mt-1">Browse and apply to courses across partner universities</p>
        </div>
        <Link to="/student/shortlist" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg">
          <Bookmark className="w-4 h-4" aria-hidden="true" /> Compare shortlist{shortlist.count ? ` (${shortlist.count})` : ''}
        </Link>
      </div>
      {shortlist.error && <p role="alert" className="text-sm text-red-600">{shortlist.error}</p>}

      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by course name, university, department..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select aria-label="Filter by level" value={level} onChange={e => setLevel(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Levels</option>
            {LEVELS.map(l => <option key={l}>{l}</option>)}
          </select>
          <select aria-label="Filter by university" value={uniFilter} onChange={e => setUniFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Universities</option>
            {uniNames.map(n => <option key={n}>{n}</option>)}
          </select>
          <select aria-label="Filter by country" value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Countries</option>
            {countryList.map(c => <option key={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => setEligibleOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${eligibleOnly ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
            <ShieldCheck className="w-4 h-4" />Eligible Only
          </button>
          {hasFilters && (
            <button type="button" onClick={() => { setQuery(''); setLevel(''); setUniFilter(''); setCountryFilter(''); setEligibleOnly(false); }}
              className="flex items-center gap-1 px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-sm">
              <X className="w-4 h-4" />Clear
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-3">{filtered.length} courses found</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((course, i) => (
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
                  {course._elig.status !== 'unknown' && (() => {
                    const badge = ELIGIBILITY_BADGE[course._elig.status as keyof typeof ELIGIBILITY_BADGE];
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        {badge.label}
                      </span>
                    );
                  })()}
                  {course.department && <span className="text-xs text-gray-400">{course.department}</span>}
                </div>
                <p className="font-bold text-gray-900">{course.name}</p>
                <p className="text-xs text-blue-600 mt-0.5">{course.uniName} · {course.city}, {course.country}</p>
              </div>
              {course.tuitionFee > 0 && (
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-green-700 text-sm">{course.currency || 'USD'} {Number(course.tuitionFee).toLocaleString()}</p>
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

            {course.requirements?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {course.requirements.map((req: string) => (
                  <span key={req} className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                    <CheckCircle className="w-3 h-3 text-green-500" />{req}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto pt-2 flex flex-wrap items-center gap-3">
              {(() => {
                const courseId = String(course.id || course._id);
                const saved = shortlist.has(course.uniId, courseId);
                return (
                  <button
                    type="button"
                    onClick={() => shortlist.toggle(course.uniId, courseId)}
                    disabled={shortlist.busyKey === `${course.uniId}:${courseId}`}
                    aria-pressed={saved}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${saved ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {saved ? <BookmarkCheck className="w-4 h-4" aria-hidden="true" /> : <Bookmark className="w-4 h-4" aria-hidden="true" />}
                    {saved ? 'Saved' : 'Save to compare'}
                  </button>
                );
              })()}
              {(student?.applications || []).some((a: any) => a.universityId === course.uniId && a.courseId === (course.id || course._id)) ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                  <CheckCircle className="w-4 h-4" /> Applied
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const uni = universities.find(u => (u.id || u._id) === course.uniId);
                    if (uni) setApplyModal({ course, uni });
                  }}
                  className="bg-[#0d1b4b] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#152258] transition-colors font-medium"
                >
                  Apply Now
                </button>
              )}
            </div>
          </div>
        ))}

        {loadError && (
          <div className="col-span-2 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loadError}</div>
            <button type="button" onClick={loadCourses} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
          </div>
        )}

        {!loadError && filtered.length === 0 && (
          <div className="col-span-2 text-center py-14 text-gray-400">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{allCourses.length === 0 ? 'Loading courses…' : 'No courses match your filters.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
