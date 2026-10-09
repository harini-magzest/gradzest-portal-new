const mongoose = require('mongoose');

// Nested schemas for objects that have a field named "type" — avoids
// Mongoose mis-interpreting { type: ..., otherField: ... } as a SchemaType
// definition rather than an embedded document.
const EnglishScoreSchema = new mongoose.Schema(
  { type: { type: String, enum: ['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Other'] }, score: Number, testDate: String },
  { _id: false }
);

const EnglishTestSchema = new mongoose.Schema(
  { type: { type: String }, score: Number, testDate: String },
  { _id: false }
);

const MOISchema = new mongoose.Schema(
  { institution: String, program: String, year: String },
  { _id: false }
);

const EnglishProficiencyTestSchema = new mongoose.Schema(
  { name: String, score: String, institution: String },
  { _id: false }
);

// Each element gets its own auto-assigned _id — used to individually revoke one session
// ("log out this device") without touching any of the user's other active sessions.
const SessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expires: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
  },
);

const DocumentSchema = new mongoose.Schema({
  name: String,
  type: String,
  url: String,
  uploadedDate: String,
  status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
});

const CommentSchema = new mongoose.Schema({
  author: String,
  authorRole: String,
  text: { type: String, required: true },
}, { timestamps: true });

const ApplicationSchema = new mongoose.Schema({
  studentId: String,
  universityId: String,
  universityName: String,
  courseId: String,
  courseName: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'offer_received', 'accepted', 'rejected', 'enrolled'],
    default: 'submitted',
  },
  submittedDate: String,
  updatedDate: String,
  // When `status` last changed — distinct from updatedDate, which also bumps on notes-only edits.
  // Drives the "stuck application" / "offer response deadline" automation checks.
  statusChangedAt: { type: Date, default: Date.now },
  notes: String,
  intake: String,
  offerLetterUrl: String,
  offerType: String,
  rejectedFrom: String,

  // Application details
  studyMode: String,
  scholarshipInterest: Boolean,

  // Personal info
  dateOfBirth: String,
  gender: String,
  passportNumber: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
  },

  // Academic background
  educationLevel: String,
  previousInstitution: String,
  previousDegree: String,
  previousMajor: String,
  graduationYear: String,
  percentage: String,

  // English proficiency
  englishTest: EnglishTestSchema,
  moi: MOISchema,
  englishProficiencyTest: EnglishProficiencyTestSchema,

  // Financial
  fundingSource: String,
  sponsorName: String,

  // Statement of purpose
  whyCourse: String,
  careerGoals: String,
  whyUniversity: String,

  // Documents checklist
  documentsChecklist: {
    passport: Boolean,
    transcripts: Boolean,
    degreeCertificate: Boolean,
    englishCertificate: Boolean,
    bankStatement: Boolean,
    referenceLetters: Boolean,
    sop: Boolean,
  },

  comments: [CommentSchema],
});

const ExperienceCertSchema = new mongoose.Schema(
  { name: String, url: String, docId: String },
  { _id: false }
);

const ExperienceSchema = new mongoose.Schema({
  company: String,
  role: String,
  employmentType: String,
  from: String,
  to: String,
  current: Boolean,
  noticePeriod: String,
  description: String,
  certificates: [ExperienceCertSchema],
}, { _id: false });

const AcadDocSchema = new mongoose.Schema(
  { name: String, url: String, docId: String, docType: String },
  { _id: false }
);

const AcademicDetailSchema = new mongoose.Schema({
  level: String,
  customLevel: String,
  institution: String,
  board: String,
  course: String,
  year: String,
  percentage: String,
  city: String,
  comment: String,
  status: String,
  yearOfStudying: String,
  yearOfPassing: String,
  backlogs: String,
  attempts: String,
  docs: [AcadDocSchema],
}, { _id: false });

// A staff note on a student. counselorId/counselorName are the author (any staff role).
// public: every staff member who can open the student sees it; private: only the author.
// Notes written before visibility existed have no value and count as private.
const CounselorNoteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  counselorId: String,
  counselorName: String,
  visibility: { type: String, enum: ['public', 'private'], default: 'private' },
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firstName: String,
  lastName: String,
  // Required for staff and self-signups; a student lead added from a phone call may not have
  // one yet. Unique only when present — see the partial index below and lib/migrateEmailIndex.js.
  email: {
    type: String, lowercase: true, trim: true,
    required() { return this.role !== 'student'; },
    // Never store '' (it would collide in the unique index) — leave the field unset instead
    set: v => (v == null || String(v).trim() === '' ? undefined : v),
  },
  password: { type: String, required: false },
  role: { type: String, enum: ['student', 'counselor', 'admin'], required: true },
  isAppTeam: { type: Boolean, default: false },
  // Staff: position in the role hierarchy (admin Roles page)
  hierarchyRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  // Staff: permission profile (null = the default profile); see lib/access.js
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
  // Staff: deactivated users cannot log in
  active: { type: Boolean, default: true },
  // Set when the student's personal data was erased at their request (see lib/studentData.js)
  deletedAt: Date,
  // Counselor: their agent number (or agent name) in Tata Smartflo, used to match call records
  smartfloAgent: { type: String, default: '' },
  avatar: String,

  // Student fields
  phone: String,
  nationality: String,
  dateOfBirth: String,
  gender: String,
  maritalStatus: String,
  placeOfBirth: String,
  passport: {
    number: String,
    issueDate: String,
    expiryDate: String,
    issuingCountry: String,
  },
  educationLevel: String,
  gpa: Number,
  englishScore: EnglishScoreSchema,
  moi: MOISchema,
  englishProficiencyTest: EnglishProficiencyTestSchema,
  preferredCountries: [String],
  budget: Number,
  interestedCourses: [String],
  academicDetails: [AcademicDetailSchema],
  experienceDetails: [ExperienceSchema],
  applications: [ApplicationSchema],
  documents: [DocumentSchema],
  counselorNotes: [CounselorNoteSchema],
  counselorId: String,
  joinedDate: String,
  // Staff-maintained quick-reference info shown on the student record
  tags: { type: [String], default: undefined },
  summary: String,

  // Bigin-style lead details, filled in by staff (often one by one after a phone enquiry)
  secondaryEmail: String,
  universityName: String,
  altPhone: String,            // "Phone" — `phone` above is the mobile number
  socialLeadId: String,
  preferredCourseLevel: String,
  preferredIntake: String,
  qualification: String,       // free-text "Qualification and YOP"
  workSummary: String,         // free-text "Work"
  branch: String,

  // The student's own words about what they want ("My Preferences" on their profile)
  preferredUniversities: String,
  preferredCities: String,
  needsScholarship: { type: String, enum: ['yes', 'no', 'not_sure', ''] },
  needsLoan: { type: String, enum: ['yes', 'no', 'not_sure', ''] },
  needsAccommodation: { type: String, enum: ['yes', 'no', 'not_sure', ''] },
  preferenceNote: String,

  // Lead tracking — only self-signups get leadStatus 'new'; existing students are unaffected
  source: { type: String, enum: ['self_signup', 'admin_created', 'counselor_created'] },
  leadStatus: { type: String, enum: ['new', 'contacted'] },
  // Sales pipeline stage, edited by admins/counselors. Unset is shown as 'new_enquiry'.
  leadStage: { type: String, enum: ['new_enquiry', 'interested', 'counselling', 'shortlisting', 'applications', 'visa_process', 'visa_approved', 'enrolment', 'future_lead', 'other_agent', 'dropped_plans', 'test_prep', 'dnd', 'not_responding', 'other'] },
  // When leadStage last changed — drives the "stale lead" automation field (days since last movement)
  leadStageChangedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'inactive', 'counseling', 'shortlisting', 'application', 'test_preparation', 'visa_process', 'loan_process', 'enrolled'], default: 'counseling' },

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerifyToken: String,
  emailVerifyExpires: Date,

  // Onboarding — tracks which steps the student has completed
  onboarding: {
    profileComplete: { type: Boolean, default: false },
    documentUploaded: { type: Boolean, default: false },
    counselorViewed:  { type: Boolean, default: false },
    universityBrowsed: { type: Boolean, default: false },
  },

  // Password reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,

  // Account lockout — incremented on each failed login, cleared on success
  loginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },

  // Universities the student has saved with the heart on the Universities page (see GET /api/students/me/saved-universities).
  // `universityId` is the university's short id (or _id); capped at 20 by the route.
  savedUniversities: {
    type: [{ _id: false, universityId: { type: String, required: true }, addedAt: { type: Date, default: Date.now } }],
    default: undefined,
  },

  // Short code a student shares so friends can sign up as their referral (see lib/referrals.js). Created on first use.
  referralCode: { type: String, unique: true, sparse: true },

  // How this person wants reminders. Email is on unless turned off; WhatsApp is opt-in (see lib/notificationChannels.js).
  notificationPrefs: {
    email: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false },
  },

  // Active login sessions — one per device, each with its own refresh token
  // (stored as a SHA-256 hash), so logging in on a new device doesn't invalidate others.
  sessions: { type: [SessionSchema], default: [] },

  // Two-factor sign-in with an authenticator app (see lib/twoFactor.js). Everything secret is `select: false`, so no
  // query returns it unless a route asks for it by name ('+twoFactor.secret'); toJSON below also cuts the block down to
  // { enabled }. `secret` is encrypted at rest, `recoveryCodes` holds keyed hashes (never the codes), and `lastStep` is
  // the last TOTP time step accepted, so one code cannot be used twice.
  twoFactor: {
    enabled: { type: Boolean, default: false },
    enabledAt: Date,
    secret: { type: String, select: false },
    pendingSecret: { type: String, select: false },
    recoveryCodes: { type: [String], select: false, default: undefined },
    lastStep: { type: Number, select: false },
  },

  // Admin: when this admin last opened the New Subscribers list (drives the unread badge)
  subscribersSeenAt: { type: Date, default: null },

  // Counselor fields
  specialization: [String],
  assignedStudents: [String],
  experience: Number,
  title: String,
  bio: String,
  languages: [String],
  certifications: [String],
  linkedIn: String,
  website: String,
  // Staff contact details (Settings → Users)
  mobile: String,
  fax: String,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
  },
  educationBackground: {
    degree: String,
    institution: String,
    graduationYear: String,
  },
}, { timestamps: true });

// Unique only among accounts that have an email, so any number of phone-only leads can coexist
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

UserSchema.set('toJSON', {
  virtuals: true,
  // Staff notes never travel inside a user object — that would hand them to the student and
  // every private note to every colleague. They're served only by GET /api/students/:id/notes,
  // which applies public/private visibility (lib/studentNotes.js).
  transform: (doc, ret) => {
    delete ret.counselorNotes;
    // Whatever was selected, a user object never carries 2FA secrets, only whether it is on.
    if (ret.twoFactor) ret.twoFactor = { enabled: !!ret.twoFactor.enabled };
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
