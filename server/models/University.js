const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  id: String,
  name: String,
  level: String,
  duration: String,
  tuitionFee: Number,
  currency: String,
  requirements: [String],
  description: String,
  department: String,
  intake: [String],
  applicationFee: Number,
  registrationFee: Number,
  scholarshipAvailable: Boolean,
  scholarshipAmount: String,
  paymentPlan: String,
  eligibility: {
    minEducationLevel: String,
    minGPA: Number,
    minWorkExperienceYears: Number,
    englishRequirements: [{ test: String, minScore: Number }],
    minAge: Number,
    maxAge: Number,
    restrictedNationalities: [String],
  },
  // Staff-entered labels and key/value details used by the course finder filters
  tags: [String],
  customFields: [{ _id: false, key: String, value: String }],
});

const UniversitySchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  country: String,
  city: String,
  logo: String,
  coverImage: String,
  ranking: Number,
  type: String,
  founded: Number,
  website: String,
  description: String,
  courses: [CourseSchema],
  facilities: [String],
  scholarships: [{
    name: String, amount: Number, currency: String, eligibility: String, deadline: String,
  }],
  applicationDeadlines: [{ intake: String, deadline: String }],
  averageFees: { undergraduate: Number, postgraduate: Number, currency: String },
  acceptanceRate: Number,
  totalStudents: Number,
  internationalStudents: Number,
  rating: Number,
  tags: [String],
  socialLinks: {
    facebook:  String,
    twitter:   String,
    linkedin:  String,
    instagram: String,
    youtube:   String,
  },
  enrichedAt: Date,
  enrichmentStatus: { type: String, default: 'pending' },
});

module.exports = mongoose.model('University', UniversitySchema);
