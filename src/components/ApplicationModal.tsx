import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle, User, BookOpen, Globe, FileText } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { title: 'Personal Info', icon: User },
  { title: 'Academic', icon: BookOpen },
  { title: 'Language & Finance', icon: Globe },
  { title: 'Statement & Review', icon: FileText },
];

const EDUCATION_LEVEL_ORDER: Record<string, number> = {
  'PhD': 6, "Master's Degree": 5, "Bachelor's Degree": 4,
  'Diploma': 3, '12th Grade / Intermediate': 2, '10th Grade': 1, 'Other': 0,
};

// Maps academicDetails.level → application form dropdown value
const LEVEL_TO_FORM: Record<string, string> = {
  'PhD': 'PhD', "Master's Degree": 'Master', "Bachelor's Degree": 'Bachelor',
  'Diploma': 'Diploma', '12th Grade / Intermediate': 'High School', '10th Grade': 'High School',
};

interface Props {
  course: any;
  uni: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ApplicationModal({ course, uni, onClose, onSuccess }: Props) {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const student = user as any;

  // Derive highest qualification from academicDetails array
  const highestQual = (() => {
    const details: any[] = student?.academicDetails;
    if (!details?.length) return null;
    return details.reduce((best: any, curr: any) => {
      return (EDUCATION_LEVEL_ORDER[curr.level] ?? 0) > (EDUCATION_LEVEL_ORDER[best.level] ?? 0) ? curr : best;
    });
  })();

  const validGradYears = Array.from({ length: 17 }, (_, i) => String(2027 - i));
  const rawGradYear = highestQual?.yearOfPassing || highestQual?.year || '';
  const gradYearInList = rawGradYear ? validGradYears.includes(rawGradYear) : false;
  const mappedLevel = highestQual ? (LEVEL_TO_FORM[highestQual.level] ?? 'Other') : (student?.educationLevel || '');

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [personal, setPersonal] = useState({
    dateOfBirth: student?.dateOfBirth || '',
    gender: student?.gender || '',
    passportNumber: student?.passport?.number || '',
    phone: student?.phone || '',
    addressStreet: student?.address?.street || '',
    addressCity: student?.address?.city || '',
    addressState: student?.address?.state || '',
    addressCountry: student?.address?.country || student?.nationality || '',
    addressPostal: student?.address?.postalCode || '',
  });

  const [academic, setAcademic] = useState({
    educationLevel: mappedLevel,
    previousInstitution: highestQual?.institution || '',
    previousDegree: highestQual
      ? (highestQual.level === 'Other' ? (highestQual.customLevel || '') : highestQual.level)
      : '',
    previousMajor: highestQual?.course || '',
    graduationYear: rawGradYear ? (gradYearInList ? rawGradYear : 'Other') : '',
    percentage: highestQual?.percentage || '',
  });

  const [educationLevelCustom, setEducationLevelCustom] = useState(
    mappedLevel === 'Other' && highestQual ? (highestQual.customLevel || highestQual.level || '') : ''
  );
  const [graduationYearCustom, setGraduationYearCustom] = useState(
    rawGradYear && !gradYearInList ? rawGradYear : ''
  );
  const isOtherLevel = academic.educationLevel === 'Other';
  const isOtherYear = academic.graduationYear === 'Other';

  const [finance, setFinance] = useState({
    englishTestType: student?.englishScore?.type || ((student?.moi?.institution || student?.englishProficiencyTest?.name) ? 'Not Attempted' : ''),
    englishTestScore: student?.englishScore?.score ? String(student.englishScore.score) : '',
    englishTestDate: '',
    moiInstitution: student?.moi?.institution || '',
    moiProgram: student?.moi?.program || '',
    moiYear: student?.moi?.year || '',
    profTestName: student?.englishProficiencyTest?.name || '',
    profTestScore: student?.englishProficiencyTest?.score || '',
    profTestInstitution: student?.englishProficiencyTest?.institution || '',
    intake: course.intake?.[0] || '',
    studyMode: 'Full-time',
    fundingSource: '',
    sponsorName: '',
    scholarshipInterest: false,
  });

  const [sop, setSop] = useState({ whyCourse: '', careerGoals: '', whyUniversity: '' });

  const [docs, setDocs] = useState({
    passport: false,
    transcripts: false,
    degreeCertificate: false,
    englishCertificate: false,
    bankStatement: false,
    referenceLetters: false,
  });

  const validateStep = (): string => {
    if (step === 0) {
      if (!personal.dateOfBirth) return 'Date of birth is required';
      if (!personal.gender) return 'Please select your gender';
      if (!personal.passportNumber.trim()) return 'Passport number is required';
      if (!personal.addressCity.trim()) return 'City is required';
      if (!personal.addressCountry.trim()) return 'Country of residence is required';
    }
    if (step === 1) {
      if (!academic.previousInstitution.trim()) return 'Previous institution is required';
      if (!academic.previousDegree.trim()) return 'Degree name is required';
      if (!academic.graduationYear) return 'Graduation year is required';
      if (isOtherYear && !graduationYearCustom.trim()) return 'Please enter a graduation year';
      if (isOtherLevel && !educationLevelCustom.trim()) return 'Please enter your education level';
      if (!academic.percentage.trim()) return 'GPA / Percentage is required';
    }
    if (step === 2) {
      if (!finance.intake) return 'Please select an intake';
      if (!finance.fundingSource) return 'Please select a funding source';
      if (finance.englishTestType && finance.englishTestType !== 'Not Attempted' && !finance.englishTestScore) return 'Please enter your English test score';
    }
    if (step === 3) {
      if (!Object.values(docs).every(Boolean)) return 'Please confirm all required documents are ready';
    }
    return '';
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  };

  const back = () => { setError(''); setStep(s => s - 1); };

  const submit = async () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError('');
    try {
      await api.applications.create({
        universityId: uni.id,
        universityName: uni.name,
        courseId: course.id,
        courseName: course.name,
        intake: finance.intake,
        studentId: student?.id,
        studyMode: finance.studyMode,
        scholarshipInterest: finance.scholarshipInterest,
        dateOfBirth: personal.dateOfBirth,
        gender: personal.gender,
        passportNumber: personal.passportNumber,
        phone: personal.phone,
        address: {
          street: personal.addressStreet,
          city: personal.addressCity,
          state: personal.addressState,
          country: personal.addressCountry,
          postalCode: personal.addressPostal,
        },
        educationLevel: isOtherLevel ? educationLevelCustom : academic.educationLevel,
        previousInstitution: academic.previousInstitution,
        previousDegree: academic.previousDegree,
        previousMajor: academic.previousMajor,
        graduationYear: isOtherYear ? graduationYearCustom : academic.graduationYear,
        percentage: academic.percentage,
        englishTest: (finance.englishTestType && finance.englishTestType !== 'Not Attempted') ? {
          type: finance.englishTestType,
          score: parseFloat(finance.englishTestScore),
          testDate: finance.englishTestDate,
        } : undefined,
        moi: finance.englishTestType === 'Not Attempted' && finance.moiInstitution ? { institution: finance.moiInstitution, program: finance.moiProgram, year: finance.moiYear } : undefined,
        englishProficiencyTest: finance.englishTestType === 'Not Attempted' && finance.profTestName ? { name: finance.profTestName, score: finance.profTestScore, institution: finance.profTestInstitution } : undefined,
        fundingSource: finance.fundingSource,
        sponsorName: finance.sponsorName,
        whyCourse: sop.whyCourse,
        careerGoals: sop.careerGoals,
        whyUniversity: sop.whyUniversity,
        documentsChecklist: docs,
      });
      await refreshUser();
      onSuccess();
      navigate('/student/applications');
    } catch (e: any) {
      setError(e.message || 'Failed to submit application.');
    }
    setSubmitting(false);
  };

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">University Application</h2>
            <p className="text-sm text-gray-500 mt-0.5">{course.name} · {uni.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress stepper */}
        <div className="px-6 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-colors ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-[#0d1b4b] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`ml-1.5 text-xs font-medium hidden sm:block truncate ${i === step ? 'text-blue-700' : i < step ? 'text-green-600' : 'text-gray-400'}`}>{s.title}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">

          {/* Step 0 — Personal Information */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Personal Information</h3>
              {(student?.dateOfBirth || student?.gender || student?.passport?.number || student?.phone || student?.address?.city) && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>Fields pre-filled from your profile — review and update if needed.</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input value={student?.name || ''} readOnly className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} />
                </div>
                <div>
                  <label className={labelCls}>Nationality</label>
                  <input value={student?.nationality || ''} readOnly className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`} />
                </div>
                <div>
                  <label className={labelCls}>Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" value={personal.dateOfBirth} onChange={e => setPersonal(p => ({ ...p, dateOfBirth: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Gender <span className="text-red-500">*</span></label>
                  <select value={personal.gender} onChange={e => setPersonal(p => ({ ...p, gender: e.target.value }))} className={`${inputCls} bg-white`}>
                    <option value="">Select gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Passport Number <span className="text-red-500">*</span></label>
                  <input type="text" value={personal.passportNumber} onChange={e => setPersonal(p => ({ ...p, passportNumber: e.target.value }))} placeholder="e.g. A12345678" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input type="tel" value={personal.phone} onChange={e => setPersonal(p => ({ ...p, phone: e.target.value }))} placeholder="+1 234 567 8900" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Street Address</label>
                <input type="text" value={personal.addressStreet} onChange={e => setPersonal(p => ({ ...p, addressStreet: e.target.value }))} placeholder="123 Main Street" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>City <span className="text-red-500">*</span></label>
                  <input type="text" value={personal.addressCity} onChange={e => setPersonal(p => ({ ...p, addressCity: e.target.value }))} placeholder="City" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State / Province</label>
                  <input type="text" value={personal.addressState} onChange={e => setPersonal(p => ({ ...p, addressState: e.target.value }))} placeholder="State" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Postal Code</label>
                  <input type="text" value={personal.addressPostal} onChange={e => setPersonal(p => ({ ...p, addressPostal: e.target.value }))} placeholder="12345" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Country of Residence <span className="text-red-500">*</span></label>
                <input type="text" value={personal.addressCountry} onChange={e => setPersonal(p => ({ ...p, addressCountry: e.target.value }))} placeholder="Country" className={inputCls} />
              </div>
            </div>
          )}

          {/* Step 1 — Academic Background */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Academic Background</h3>
              {(highestQual || student?.educationLevel || student?.gpa) && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>
                    {highestQual
                      ? `Highest qualification (${highestQual.level}) auto-filled from your academic details — review and update if needed.`
                      : 'Academic details pre-filled from your profile — review and update if needed.'}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={labelCls}>Highest Education Level</label>
                  <select value={academic.educationLevel} onChange={e => { setAcademic(a => ({ ...a, educationLevel: e.target.value })); setEducationLevelCustom(''); }} className={`${inputCls} bg-white`}>
                    <option value="">Select level</option>
                    <option>High School</option>
                    <option>Diploma</option>
                    <option>Bachelor</option>
                    <option>Master</option>
                    <option>PhD</option>
                    <option>Other</option>
                  </select>
                  {isOtherLevel && (
                    <input type="text" value={educationLevelCustom} onChange={e => setEducationLevelCustom(e.target.value)}
                      placeholder="Enter your education level" className={inputCls} autoFocus />
                  )}
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Graduation Year <span className="text-red-500">*</span></label>
                  <select value={academic.graduationYear} onChange={e => { setAcademic(a => ({ ...a, graduationYear: e.target.value })); setGraduationYearCustom(''); }} className={`${inputCls} bg-white`}>
                    <option value="">Select year</option>
                    {Array.from({ length: 17 }, (_, i) => 2027 - i).map(y => <option key={y}>{y}</option>)}
                    <option>Other</option>
                  </select>
                  {isOtherYear && (
                    <input type="text" value={graduationYearCustom} onChange={e => setGraduationYearCustom(e.target.value)}
                      placeholder="Enter graduation year" className={inputCls} autoFocus />
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>Previous Institution / School <span className="text-red-500">*</span></label>
                <input type="text" value={academic.previousInstitution} onChange={e => setAcademic(a => ({ ...a, previousInstitution: e.target.value }))} placeholder="e.g. Harvard University" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Degree / Certificate <span className="text-red-500">*</span></label>
                  <input type="text" value={academic.previousDegree} onChange={e => setAcademic(a => ({ ...a, previousDegree: e.target.value }))} placeholder="e.g. B.Sc Computer Science" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Major / Field of Study</label>
                  <input type="text" value={academic.previousMajor} onChange={e => setAcademic(a => ({ ...a, previousMajor: e.target.value }))} placeholder="e.g. Computer Science" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>GPA / Percentage / Grade <span className="text-red-500">*</span></label>
                <input type="text" value={academic.percentage} onChange={e => setAcademic(a => ({ ...a, percentage: e.target.value }))} placeholder="e.g. 3.8 / 4.0 GPA  or  85%  or  First Class Honours" className={inputCls} />
              </div>
            </div>
          )}

          {/* Step 2 — English Proficiency & Finance */}
          {step === 2 && (
            <div className="space-y-5">
              {(student?.englishScore?.type || student?.moi?.institution || student?.englishProficiencyTest?.name) && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>English proficiency pre-filled from your profile — review and update if needed.</span>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Intake & Study Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Intake <span className="text-red-500">*</span></label>
                    <select value={finance.intake} onChange={e => setFinance(f => ({ ...f, intake: e.target.value }))} className={`${inputCls} bg-white`}>
                      {(course.intake || []).map((i: string) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Study Mode</label>
                    <select value={finance.studyMode} onChange={e => setFinance(f => ({ ...f, studyMode: e.target.value }))} className={`${inputCls} bg-white`}>
                      <option>Full-time</option>
                      <option>Part-time</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-3">English Proficiency</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Test Type</label>
                      <select aria-label="English test type" value={finance.englishTestType}
                        onChange={e => setFinance(f => ({ ...f, englishTestType: e.target.value, englishTestScore: '', englishTestDate: '', moiInstitution: '', moiProgram: '', moiYear: '', profTestName: '', profTestScore: '', profTestInstitution: '' }))}
                        className={`${inputCls} bg-white`}>
                        <option value="">None / Not yet taken</option>
                        <option>IELTS</option>
                        <option>TOEFL</option>
                        <option>PTE</option>
                        <option>Duolingo</option>
                        <option>Other</option>
                        <option value="Not Attempted">Not Attempted</option>
                      </select>
                    </div>
                    {finance.englishTestType && finance.englishTestType !== 'Not Attempted' && (
                      <>
                        <div>
                          <label className={labelCls}>Score <span className="text-red-500">*</span></label>
                          <input type="number" step="0.1" value={finance.englishTestScore} onChange={e => setFinance(f => ({ ...f, englishTestScore: e.target.value }))} placeholder="e.g. 7.5" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Exam Date</label>
                          <input type="date" aria-label="Exam date" value={finance.englishTestDate} onChange={e => setFinance(f => ({ ...f, englishTestDate: e.target.value }))} className={inputCls} />
                        </div>
                      </>
                    )}
                  </div>
                  {finance.englishTestType === 'Not Attempted' && (
                    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-4">
                      <p className="text-xs font-semibold text-amber-700">Since no English test was attempted, provide your MOI certificate and English Proficiency Test Waiver details:</p>
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-2">Medium of Instruction (MOI)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className={labelCls}>Institution Name</label>
                            <input type="text" value={finance.moiInstitution} onChange={e => setFinance(f => ({ ...f, moiInstitution: e.target.value }))} placeholder="e.g. Delhi University" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Program / Course</label>
                            <input type="text" value={finance.moiProgram} onChange={e => setFinance(f => ({ ...f, moiProgram: e.target.value }))} placeholder="e.g. B.Tech Computer Science" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Year</label>
                            <input type="text" value={finance.moiYear} onChange={e => setFinance(f => ({ ...f, moiYear: e.target.value }))} placeholder="e.g. 2023" className={inputCls} />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-2">English Proficiency Test Waiver</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className={labelCls}>Waiver Reference / ID</label>
                            <input type="text" value={finance.profTestName} onChange={e => setFinance(f => ({ ...f, profTestName: e.target.value }))} placeholder="Waiver Reference / ID" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Issue Date</label>
                            <input type="text" value={finance.profTestScore} onChange={e => setFinance(f => ({ ...f, profTestScore: e.target.value }))} placeholder="e.g. Jan 2024" className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Issuing Institution</label>
                            <input type="text" value={finance.profTestInstitution} onChange={e => setFinance(f => ({ ...f, profTestInstitution: e.target.value }))} placeholder="Issuing Institution" className={inputCls} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Financial Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Funding Source <span className="text-red-500">*</span></label>
                    <select aria-label="Funding source" value={finance.fundingSource} onChange={e => setFinance(f => ({ ...f, fundingSource: e.target.value }))} className={`${inputCls} bg-white`}>
                      <option value="">Select funding source</option>
                      <option>Self-funded</option>
                      <option>Family / Parent Sponsor</option>
                      <option>Education Loan</option>
                      <option>Scholarship</option>
                      <option>Employer Sponsor</option>
                      <option>Government Scholarship</option>
                    </select>
                  </div>
                  {(finance.fundingSource === 'Family / Parent Sponsor' || finance.fundingSource === 'Employer Sponsor') && (
                    <div>
                      <label className={labelCls}>Sponsor Name</label>
                      <input type="text" value={finance.sponsorName} onChange={e => setFinance(f => ({ ...f, sponsorName: e.target.value }))} placeholder="Sponsor's full name or organization" className={inputCls} />
                    </div>
                  )}
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100">
                    <input type="checkbox" checked={finance.scholarshipInterest} onChange={e => setFinance(f => ({ ...f, scholarshipInterest: e.target.checked }))} className="w-4 h-4 accent-blue-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700">I am interested in scholarships and financial aid opportunities</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — SOP + Documents + Review */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Statement of Purpose</h3>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Why do you want to study <em>{course.name}</em>? <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                    <textarea rows={3} value={sop.whyCourse} onChange={e => setSop(s => ({ ...s, whyCourse: e.target.value }))}
                      placeholder="Describe your motivation for choosing this course..."
                      className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>What are your career goals? <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                    <textarea rows={3} value={sop.careerGoals} onChange={e => setSop(s => ({ ...s, careerGoals: e.target.value }))}
                      placeholder="Describe your career aspirations and how this program will help..."
                      className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>Why did you choose <em>{uni.name}</em>? <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
                    <textarea rows={3} value={sop.whyUniversity} onChange={e => setSop(s => ({ ...s, whyUniversity: e.target.value }))}
                      placeholder="Explain what attracted you to this university..."
                      className={`${inputCls} resize-none`} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-1">Documents Checklist</h3>
                <p className="text-sm text-gray-500 mb-3">Confirm you have these documents ready to submit when requested:</p>
                <div className="space-y-1.5">
                  {([
                    { key: 'passport', label: 'Valid Passport (at least 6 months validity remaining)' },
                    { key: 'transcripts', label: 'Official Academic Transcripts / Mark Sheets' },
                    { key: 'degreeCertificate', label: 'Degree / Graduation Certificate' },
                    { key: 'englishCertificate', label: 'English Proficiency Certificate (IELTS / TOEFL / PTE or equivalent)' },
                    { key: 'bankStatement', label: 'Bank Statement / Proof of Funds (last 3 months)' },
                    { key: 'referenceLetters', label: 'Reference / Recommendation Letters (at least 3)' },
                  ] as { key: keyof typeof docs; label: string }[]).map(doc => (
                    <label key={doc.key} className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                      <input type="checkbox" checked={docs[doc.key]} onChange={e => setDocs(d => ({ ...d, [doc.key]: e.target.checked }))} className="w-4 h-4 mt-0.5 accent-blue-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{doc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-sky-50 rounded-xl p-4">
                <h4 className="font-semibold text-blue-800 text-sm mb-3">Application Summary</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <span className="text-gray-500">University</span><span className="font-medium text-gray-900">{uni.name}</span>
                  <span className="text-gray-500">Course</span><span className="font-medium text-gray-900">{course.name}</span>
                  <span className="text-gray-500">Level</span><span className="font-medium text-gray-900">{course.level}</span>
                  <span className="text-gray-500">Intake</span><span className="font-medium text-gray-900">{finance.intake}</span>
                  <span className="text-gray-500">Study Mode</span><span className="font-medium text-gray-900">{finance.studyMode}</span>
                  <span className="text-gray-500">Funding</span><span className="font-medium text-gray-900">{finance.fundingSource}</span>
                  <span className="text-gray-500">Tuition Fee</span><span className="font-medium text-gray-900">{course.currency} {course.tuitionFee?.toLocaleString()}/yr</span>
                  {finance.scholarshipInterest && <><span className="text-gray-500">Scholarship</span><span className="font-medium text-green-700">Interested</span></>}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-lg mt-4">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {step > 0 && (
            <button type="button" onClick={back} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="flex items-center gap-1.5 px-6 py-2.5 bg-[#0d1b4b] text-white rounded-xl text-sm font-semibold hover:bg-[#152258] transition-colors">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={submitting}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
