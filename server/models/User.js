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

const CounselorNoteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  counselorId: String,
  counselorName: String,
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  firstName: String,
  lastName: String,
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: false },
  role: { type: String, enum: ['student', 'counselor', 'admin'], required: true },
  isAppTeam: { type: Boolean, default: false },
  // Social login provider IDs
  githubId: { type: String, sparse: true },
  facebookId: { type: String, sparse: true },
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

  // Lead tracking — only self-signups get leadStatus 'new'; existing students are unaffected
  source: { type: String, enum: ['self_signup', 'github', 'facebook', 'admin_created', 'counselor_created'] },
  leadStatus: { type: String, enum: ['new', 'contacted'] },
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

  // JWT refresh token (stored as SHA-256 hash)
  refreshTokenHash: { type: String, default: null },
  refreshTokenExpires: { type: Date, default: null },

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

UserSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);
