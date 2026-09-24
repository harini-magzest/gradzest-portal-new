import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Calendar, DollarSign, CheckCircle, Award,
  MapPin, Clock, Users, ExternalLink, Globe, Star, X, Plus
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ApplicationModal from '../components/ApplicationModal';

const LEVEL_COLORS: Record<string, string> = {
  Bachelor: 'bg-blue-100 text-blue-700',
  "Bachelor's": 'bg-blue-100 text-blue-700',
  Master: 'bg-purple-100 text-purple-700',
  "Master's": 'bg-purple-100 text-purple-700',
  PhD: 'bg-red-100 text-red-700',
  Diploma: 'bg-green-100 text-green-700',
  Certificate: 'bg-yellow-100 text-yellow-700',
};

function StaffApplyModal({ course, uni, students, onClose }: {
  course: any; uni: any; students: any[]; onClose: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [intake, setIntake] = useState(course.intake?.[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleApply = async () => {
    if (!studentId) { setError('Please select a student.'); return; }
    setSaving(true); setError('');
    try {
      await api.admin.createApplication({
        studentId,
        universityId: uni.id || uni._id,
        universityName: uni.name,
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
            <p className="text-xs text-gray-500 truncate">{uni.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Student <span className="text-red-500">*</span></label>
            <select value={studentId} onChange={e => setStudentId(e.target.value)} aria-label="Select student"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">— Choose a student —</option>
              {students.map(s => (
                <option key={s._id || s.id} value={s._id || s.id}>{s.name} ({s.email})</option>
              ))}
            </select>
          </div>
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
              <CheckCircle className="w-4 h-4 flex-shrink-0" /> Application created successfully!
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleApply} disabled={saving || success}
              className="flex-1 py-2.5 bg-[#0d1b4b] hover:bg-[#152258] text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-60 transition-all flex items-center justify-center gap-2">
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

export default function CourseDetail() {
  const { uniId, courseId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [uni, setUni] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [applyModal, setApplyModal] = useState(false);
  const [staffApplyModal, setStaffApplyModal] = useState(false);
  const [students, setStudents] = useState<any[]>([]);

  useEffect(() => {
    if (uniId) {
      api.universities.get(uniId)
        .then(setUni)
        .catch(() => setUni(null))
        .finally(() => setLoading(false));
    }
  }, [uniId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (user?.role === 'counselor') api.students.list().then(setStudents).catch(() => {});
    else if (user?.role === 'admin') (api.admin as any).students().then(setStudents).catch(() => {});
  }, [isAuthenticated, user?.role]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const course = uni?.courses?.find(
    (c: any) => (c._id || c.id) === courseId
  );

  if (!uni || !course) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Course not found</h2>
        <Link to={`/university/${uniId}`} className="text-blue-600 hover:underline text-sm">
          Back to university
        </Link>
      </div>
    </div>
  );

  const student = user?.role === 'student' ? user as any : null;
  const hasApplied = (student?.applications || []).some(
    (a: any) => a.universityId === uni?.id && a.courseId === (course._id || course.id)
  );

  const levelColor = LEVEL_COLORS[course.level] || 'bg-gray-100 text-gray-700';

  return (
    <div className="min-h-screen bg-gray-50">
      {applyModal && (
        <ApplicationModal
          course={course}
          uni={uni}
          onClose={() => setApplyModal(false)}
          onSuccess={() => setApplyModal(false)}
        />
      )}
      {staffApplyModal && course && uni && (
        <StaffApplyModal
          course={course}
          uni={uni}
          students={students}
          onClose={() => setStaffApplyModal(false)}
        />
      )}

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0d1b4b] to-indigo-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10">
          <button
            type="button"
            onClick={() => navigate(`/university/${uniId}`)}
            className="flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {uni.name}
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelColor}`}>
              {course.level}
            </span>
            {course.department && (
              <span className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full">
                {course.department}
              </span>
            )}
            {course.scholarshipAvailable && (
              <span className="text-xs bg-amber-400 text-amber-900 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Award className="w-3 h-3" /> Scholarship Available
              </span>
            )}
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold mb-2">{course.name}</h1>

          <Link
            to={`/university/${uniId}`}
            className="flex items-center gap-2 text-white/80 hover:text-white text-sm transition-colors w-fit"
          >
            <MapPin className="w-3.5 h-3.5" />
            {uni.name} · {uni.city}, {uni.country}
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {course.tuitionFee > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <DollarSign className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-gray-900">
                    {course.currency || 'USD'} {Number(course.tuitionFee).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">per year</p>
                </div>
              )}
              {course.duration && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-gray-900">{course.duration}</p>
                  <p className="text-xs text-gray-500">Duration</p>
                </div>
              )}
              {course.intake?.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                  <Calendar className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-gray-900">{course.intake.join(', ')}</p>
                  <p className="text-xs text-gray-500">Intake</p>
                </div>
              )}
            </div>

            {/* Description */}
            {course.description && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" /> About this Course
                </h2>
                <p className="text-gray-600 leading-relaxed">{course.description}</p>
              </div>
            )}

            {/* Requirements */}
            {course.requirements?.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" /> Entry Requirements
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {course.requirements.map((req: string) => (
                    <div key={req} className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{req}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment plan */}
            {course.paymentPlan && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" /> Payment Plan
                </h2>
                <p className="text-gray-600">{course.paymentPlan}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">

            {/* Apply card */}
            <div className="bg-gradient-to-br from-[#0d1b4b] to-indigo-700 text-white rounded-2xl p-6 shadow-lg">
              <h3 className="font-bold text-lg mb-1">{course.name}</h3>
              <p className="text-white/70 text-sm mb-4">{uni.name}</p>

              {isAuthenticated && user?.role === 'student' ? (
                hasApplied ? (
                  <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-xl px-4 py-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-300 font-semibold">Already Applied</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setApplyModal(true)}
                    className="w-full bg-white text-[#0d1b4b] font-bold py-3 rounded-xl hover:bg-sky-50 transition-colors"
                  >
                    Apply to this Course
                  </button>
                )
              ) : isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setStaffApplyModal(true)}
                  className="w-full bg-white text-[#0d1b4b] font-bold py-3 rounded-xl hover:bg-sky-50 transition-colors"
                >
                  Apply for Student
                </button>
              ) : (
                <Link
                  to="/login"
                  className="block w-full text-center bg-white text-[#0d1b4b] font-bold py-3 rounded-xl hover:bg-sky-50 transition-colors"
                >
                  Sign In to Apply
                </Link>
              )}

              {uni.website && (
                <a
                  href={uni.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 mt-3 text-white/70 text-sm hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Visit Official Website
                </a>
              )}
            </div>

            {/* University summary */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" /> About the University
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  {uni.city}, {uni.country}
                </div>
                {uni.ranking && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Award className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    World Ranking #{uni.ranking}
                  </div>
                )}
                {uni.rating && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                    {uni.rating} / 5.0 rating
                  </div>
                )}
                {uni.totalStudents != null && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    {uni.totalStudents.toLocaleString()} students
                  </div>
                )}
              </div>
              <Link
                to={`/university/${uniId}`}
                className="mt-4 flex items-center justify-center gap-2 w-full border border-[#0d1b4b] text-[#0d1b4b] py-2 rounded-xl text-sm font-semibold hover:bg-[#0d1b4b] hover:text-white transition-colors"
              >
                View Full University Profile
              </Link>
            </div>

            {/* Other courses at this uni */}
            {uni.courses?.length > 1 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-3 text-sm">
                  More Courses at {uni.name}
                </h3>
                <div className="space-y-2">
                  {uni.courses
                    .filter((c: any) => (c._id || c.id) !== courseId)
                    .slice(0, 4)
                    .map((c: any) => (
                      <Link
                        key={c._id || c.id}
                        to={`/university/${uniId}/course/${c._id || c.id}`}
                        className="flex items-start gap-2 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
                      >
                        <BookOpen className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-gray-400">{c.level} · {c.duration}</p>
                        </div>
                      </Link>
                    ))}
                </div>
                {uni.courses.length > 5 && (
                  <Link
                    to={`/university/${uniId}`}
                    className="mt-2 text-xs text-blue-600 hover:underline block text-center"
                  >
                    View all {uni.courses.length} courses →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
