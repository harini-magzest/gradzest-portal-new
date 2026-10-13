import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Star, BookOpen, DollarSign, CheckCircle, ExternalLink, X, Plus, GraduationCap, ChevronRight, AlertCircle, Download } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { usePortalName } from '../../hooks/usePortalName';
import { exportRowsToCsv } from '../../utils/exportCsv';

const LEVEL_COLORS: Record<string, string> = {
  "Bachelor's": 'bg-blue-100 text-blue-700',
  "Master's": 'bg-purple-100 text-purple-700',
  'PhD': 'bg-red-100 text-red-700',
  'Diploma': 'bg-green-100 text-green-700',
  'Certificate': 'bg-yellow-100 text-yellow-700',
};

// ── Apply Modal ───────────────────────────────────────────────────────────────

function ApplyModal({ course, universityName, universityId, students, onClose, onApplied }: {
  course: any; universityName: string; universityId: string;
  students: any[]; onClose: () => void; onApplied: () => void;
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
    setSaving(true); setError('');
    try {
      await api.admin.createApplication({
        studentId,
        universityName,
        courseName: course.name,
        intake,
        universityId,
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
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-base font-bold text-gray-900">Apply for Course</h2>
            <p className="text-sm font-semibold text-blue-700 mt-0.5 truncate">{course.name}</p>
            <p className="text-xs text-gray-500 truncate">{universityName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Course info chips */}
        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {course.level && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${LEVEL_COLORS[course.level] || 'bg-gray-100 text-gray-700'}`}>
              {course.level}
            </span>
          )}
          {course.tuitionFee > 0 && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              {course.currency || 'USD'} {Number(course.tuitionFee).toLocaleString()}/yr
            </span>
          )}
          {course.duration && (
            <span className="text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">{course.duration}</span>
          )}
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div className="relative" ref={dropRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Student <span className="text-red-500">*</span></label>
            <button type="button"
              onClick={() => setStudentDropOpen(v => !v)}
              className={`w-full px-3 py-2.5 border rounded-xl text-sm text-left flex items-center justify-between bg-white transition-colors ${studentDropOpen ? 'border-green-500 ring-2 ring-green-500' : 'border-gray-200 hover:border-gray-300'}`}>
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
                      <button aria-label="Clear search" type="button" onClick={() => setStudentSearch('')}>
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
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 transition-colors flex flex-col gap-0.5 ${studentId === (s._id || s.id) ? 'bg-green-50' : ''}`}>
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <span className="text-xs text-gray-400">{s.email}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {course.intake?.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Intake</label>
              <select value={intake} onChange={e => setIntake(e.target.value)}
                aria-label="Select intake"
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
            <button type="button" onClick={handleApply} disabled={saving || success}
              className="flex-1 py-2.5 bg-white hover:bg-green-50 text-green-700 border-2 border-gray-300 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-60 transition-all flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Applying…</>
                : <><Plus className="w-4 h-4" />Apply</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Course Row ────────────────────────────────────────────────────────────────

// ── University Card ───────────────────────────────────────────────────────────

function UniLogoImg({ name, website, uniId }: { name: string; website?: string; uniId?: string }) {
  const domain = website ? website.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] : '';
  const initial: 'proxy' | 'favicon' | 'letter' = uniId ? 'proxy' : domain ? 'favicon' : 'letter';
  const [stage, setStage] = useState(initial);

  if (stage === 'letter') {
    return (
      <span className="w-full h-full bg-[#0d1b4b] flex items-center justify-center text-white font-bold text-xl rounded-lg leading-none">
        {name?.charAt(0) || '?'}
      </span>
    );
  }
  const src = stage === 'proxy' ? `/api/unilogo/${uniId}` : `/api/favicon/${domain}`;
  return (
    <img
      src={src}
      alt={name}
      className="w-full h-full object-contain"
      onError={() => {
        if (stage === 'proxy' && domain) setStage('favicon');
        else setStage('letter');
      }}
    />
  );
}

function UniversityCard({ uni }: { uni: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-5">
        <div className="w-14 h-14 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center justify-center overflow-hidden p-1.5 flex-shrink-0">
          <UniLogoImg name={uni.name} website={uni.website} uniId={uni.id || uni._id} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/university/${uni.id || uni._id}`} className="font-bold text-gray-900 leading-tight hover:text-green-700 hover:underline">{uni.name}</Link>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap font-semibold">#{uni.ranking}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
            <MapPin className="w-3 h-3" /> {uni.city}, {uni.country}
            {uni.type && <span className="text-gray-400 ml-1">• {uni.type}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{uni.rating}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <BookOpen className="w-3 h-3" />{uni.courses?.length || 0} courses
            </span>
            {uni.acceptanceRate && (
              <span className="text-xs text-gray-600">{uni.acceptanceRate}% acceptance</span>
            )}
            {uni.averageFees?.postgraduate > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <DollarSign className="w-3 h-3" />
                {uni.averageFees.currency} {Number(uni.averageFees.postgraduate).toLocaleString()}/yr PG
              </span>
            )}
          </div>
        </div>
      </div>

      {uni.tags?.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1">
          {uni.tags.slice(0, 4).map((t: string) => (
            <span key={t} className="text-xs bg-sky-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-5 pb-4 flex gap-2">
        <Link
          to={`/university/${uni.id || uni._id}`}
          className="flex-1 relative flex items-center justify-center bg-white hover:bg-green-50 text-green-700 border-2 border-gray-300 py-2 rounded-xl text-sm font-semibold transition-colors"
        >
          <BookOpen className="w-4 h-4 absolute left-3" />
          View Courses & Info
          <ChevronRight className="w-4 h-4 absolute right-3" />
        </Link>
        {uni.website && (
          <a href={uni.website} target="_blank" rel="noopener noreferrer"
            title="Visit university website"
            className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CounselorUniversities() {
  const { portal } = usePortalName();
  const { user } = useAuth();
  const [universities, setUniversities] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [applyTarget, setApplyTarget] = useState<{ course: any; universityName: string; universityId: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  const loadUniversities = () => {
    setLoadError('');
    api.universities.list().then(setUniversities).catch(() => setLoadError('Failed to load universities.'));
  };

  useEffect(() => {
    loadUniversities();
    api.students.list().then(setStudents).catch(() => {});
  }, []);

  const myStudents = user?.role === 'counselor'
    ? students.filter((s: any) => (user as any).assignedStudents?.includes(s._id || s.id))
    : students;

  const countries = [...new Set(universities.map((u: any) => u.country))].sort();

  const filtered = universities.filter((u: any) => {
    const q = query.toLowerCase();
    const matchQuery = !query || u.name?.toLowerCase().includes(q) || u.city?.toLowerCase().includes(q) || u.country?.toLowerCase().includes(q);
    const matchCountry = !country || u.country === country;
    const matchLevel = !level || u.courses?.some((c: any) => c.level === level);
    return matchQuery && matchCountry && matchLevel;
  }).sort((a: any, b: any) =>
    new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
  );

  const hasFilters = query || country || level;

  const handleExport = () => {
    exportRowsToCsv('universities.csv', filtered.map((u: any) => ({
      Name: u.name || '', City: u.city || '', Country: u.country || '',
      Ranking: u.ranking ?? '', Rating: u.rating ?? '', Courses: u.courses?.length ?? 0,
      Website: u.website || '',
    })));
  };

  return (
    <div className="space-y-6">
      {applyTarget && (
        <ApplyModal
          course={applyTarget.course}
          universityName={applyTarget.universityName}
          universityId={applyTarget.universityId}
          students={myStudents.length > 0 ? myStudents : students}
          onClose={() => setApplyTarget(null)}
          onApplied={() => setApplyTarget(null)}
        />
      )}

      <div className="bg-gradient-to-r from-green-600 via-green-700 to-teal-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-green-200 text-xs font-medium uppercase tracking-wide">{portal}</p>
            <h1 className="text-2xl font-bold leading-tight">Partner Universities</h1>
          </div>
        </div>
        <button type="button" onClick={handleExport} disabled={filtered.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0">
          <Download className="w-4 h-4" />Export CSV
        </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" />{loadError}</div>
          <button type="button" onClick={loadUniversities} className="text-xs font-semibold text-red-700 hover:text-red-800 flex-shrink-0">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, city, country..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select aria-label="Filter by country" value={country} onChange={e => setCountry(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Countries</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Filter by level" value={level} onChange={e => setLevel(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Levels</option>
            {["Bachelor's", "Master's", 'PhD', 'Diploma', 'Certificate'].map(l => <option key={l}>{l}</option>)}
          </select>
          {hasFilters && (
            <button type="button" onClick={() => { setQuery(''); setCountry(''); setLevel(''); }}
              className="flex items-center gap-1 px-3 py-2.5 text-red-500 hover:bg-red-50 rounded-xl text-sm">
              <X className="w-4 h-4" />Clear
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-3">{filtered.length} universities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map(uni => (
          <UniversityCard key={uni.id} uni={uni} />
        ))}
      </div>
    </div>
  );
}
