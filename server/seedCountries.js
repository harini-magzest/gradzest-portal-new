const mongoose = require('mongoose');
const Country = require('./models/Country');
require('dotenv').config();

const countries = [
  {
    name: 'United States',
    flag: '🇺🇸', code: 'US', capital: 'Washington D.C.', region: 'North America',
    currency: 'USD', language: 'English',
    visa: {
      type: 'F-1 Student Visa',
      processingTime: '3–8 weeks',
      cost: 'USD 160',
      validity: 'Duration of course + 60 days',
      documents: ['Valid passport', 'DS-160 form', 'SEVIS fee receipt (I-901)', 'I-20 from university', 'Financial proof (bank statements)', 'Visa interview appointment letter', 'Academic transcripts & test scores'],
      notes: 'OPT work authorization available for 12–36 months post-graduation. STEM graduates eligible for 24-month OPT extension.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Machine-readable passport required.' },
    costs: { monthlyLivingMin: 1000, monthlyLivingMax: 3000, currency: 'USD', applicationFee: 'USD 50–100 per university', tuitionRange: 'USD 15,000–60,000 / year' },
    popular: ['Computer Science', 'MBA', 'Engineering', 'Medicine', 'Data Science', 'Law'],
  },
  {
    name: 'United Kingdom',
    flag: '🇬🇧', code: 'GB', capital: 'London', region: 'Europe',
    currency: 'GBP', language: 'English',
    visa: {
      type: 'Student Visa (Tier 4)',
      processingTime: '3 weeks',
      cost: 'GBP 363',
      validity: 'Course duration + 4 months',
      documents: ['Valid passport', 'CAS number from university', 'Proof of English proficiency (IELTS/TOEFL)', 'Financial evidence', 'TB test certificate (if applicable)', 'Academic transcripts'],
      notes: 'Graduate Route Visa allows 2 years post-study work (3 years for PhD graduates). IHS surcharge required.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'TB test required for nationals from certain countries including India, Pakistan, and Bangladesh.' },
    costs: { monthlyLivingMin: 1200, monthlyLivingMax: 2500, currency: 'GBP', applicationFee: 'GBP 20–25 per university via UCAS', tuitionRange: 'GBP 10,000–38,000 / year' },
    popular: ['Business', 'Law', 'Medicine', 'Engineering', 'Arts & Design', 'Finance'],
  },
  {
    name: 'Canada',
    flag: '🇨🇦', code: 'CA', capital: 'Ottawa', region: 'North America',
    currency: 'CAD', language: 'English / French',
    visa: {
      type: 'Study Permit',
      processingTime: '4–12 weeks',
      cost: 'CAD 150',
      validity: 'Course duration + 90 days',
      documents: ['Acceptance letter from DLI', 'Valid passport', 'Proof of funds', 'Letter of explanation', 'Biometrics fee (CAD 85)', 'Academic transcripts', 'Language test results'],
      notes: 'PGWP allows work for up to 3 years after graduation. Canada is a popular pathway to PR.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Biometrics required for most nationalities.' },
    costs: { monthlyLivingMin: 900, monthlyLivingMax: 2200, currency: 'CAD', applicationFee: 'CAD 100–150 per university', tuitionRange: 'CAD 15,000–35,000 / year' },
    popular: ['Computer Science', 'Engineering', 'Business', 'Healthcare', 'Environmental Science'],
  },
  {
    name: 'Australia',
    flag: '🇦🇺', code: 'AU', capital: 'Canberra', region: 'Oceania',
    currency: 'AUD', language: 'English',
    visa: {
      type: 'Student Visa (Subclass 500)',
      processingTime: '4–6 weeks',
      cost: 'AUD 650',
      validity: 'Course duration + 1 month',
      documents: ['CoE from institution', 'Valid passport', 'OSHC (health insurance)', 'English proficiency proof', 'Financial evidence', 'GTE statement', 'Biometrics'],
      notes: 'Temporary Graduate Visa (Subclass 485) allows 2–4 years post-study work. Work rights: 48 hours per fortnight during studies.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Health examination may be required.' },
    costs: { monthlyLivingMin: 1500, monthlyLivingMax: 2800, currency: 'AUD', applicationFee: 'AUD 50–100 per institution', tuitionRange: 'AUD 20,000–45,000 / year' },
    popular: ['Engineering', 'Nursing', 'Business', 'IT', 'Accounting', 'Education'],
  },
  {
    name: 'Germany',
    flag: '🇩🇪', code: 'DE', capital: 'Berlin', region: 'Europe',
    currency: 'EUR', language: 'German / English',
    visa: {
      type: 'National Visa (Student)',
      processingTime: '4–12 weeks',
      cost: 'EUR 75',
      validity: 'Initially 3 months, extended after arrival',
      documents: ['University admission letter', 'Valid passport', 'Blocked account proof (EUR 11,208/year)', 'Health insurance', 'Academic transcripts', 'Language certificate', 'Motivation letter'],
      notes: 'Most public universities charge no tuition fees. Post-study work visa allows 18 months to find a job.',
    },
    passport: { minValidity: '3 months beyond visa validity', notes: 'Biometric passport required.' },
    costs: { monthlyLivingMin: 700, monthlyLivingMax: 1200, currency: 'EUR', applicationFee: 'EUR 30–75 (Uni-Assist)', tuitionRange: 'EUR 0–3,000 / year (public); EUR 5,000–20,000 (private)' },
    popular: ['Engineering', 'Computer Science', 'Natural Sciences', 'MBA', 'Architecture'],
  },
  {
    name: 'Ireland',
    flag: '🇮🇪', code: 'IE', capital: 'Dublin', region: 'Europe',
    currency: 'EUR', language: 'English / Irish',
    visa: {
      type: 'Study Visa (C or D)',
      processingTime: '4–8 weeks',
      cost: 'EUR 60–100',
      validity: 'Course duration',
      documents: ['University offer letter', 'Valid passport', 'Proof of funds (EUR 7,000+)', 'English proficiency proof', 'Private health insurance', 'Accommodation proof'],
      notes: 'Third Level Graduate Programme allows 12–24 months post-study stay. Part-time work: 20 hours/week during term.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Register with GNIB/IRP on arrival.' },
    costs: { monthlyLivingMin: 1000, monthlyLivingMax: 2000, currency: 'EUR', applicationFee: 'EUR 45–55 (CAO for undergrad)', tuitionRange: 'EUR 9,000–25,000 / year' },
    popular: ['Business', 'Pharmacy', 'Computer Science', 'Finance', 'Law'],
  },
  {
    name: 'New Zealand',
    flag: '🇳🇿', code: 'NZ', capital: 'Wellington', region: 'Oceania',
    currency: 'NZD', language: 'English',
    visa: {
      type: 'Student Visa',
      processingTime: '4–6 weeks',
      cost: 'NZD 375',
      validity: 'Course duration',
      documents: ['Offer of place from institution', 'Valid passport', 'Evidence of funds', 'Medical & character certificates', 'Travel insurance', 'English proficiency proof'],
      notes: 'Post-study work visa of up to 3 years available. Can work 20 hours/week during studies.',
    },
    passport: { minValidity: '3 months beyond visa expiry', notes: 'Medical examination required for stays over 12 months.' },
    costs: { monthlyLivingMin: 1200, monthlyLivingMax: 2000, currency: 'NZD', applicationFee: 'NZD 50–100', tuitionRange: 'NZD 22,000–35,000 / year' },
    popular: ['Agriculture', 'Tourism & Hospitality', 'Engineering', 'Business', 'IT'],
  },
  {
    name: 'France',
    flag: '🇫🇷', code: 'FR', capital: 'Paris', region: 'Europe',
    currency: 'EUR', language: 'French / English',
    visa: {
      type: 'Long-Stay Student Visa (VLS-TS)',
      processingTime: '2–4 weeks',
      cost: 'EUR 99',
      validity: 'Course duration (up to 1 year, renewable)',
      documents: ['Acceptance from French institution', 'Valid passport', 'Proof of accommodation', 'Proof of funds (EUR 615/month)', 'Health insurance', 'Campus France registration (most countries)'],
      notes: 'Part-time work: 964 hours/year. Generous public university fees (EUR 170–380/year for EU-rate programs). Grandes Écoles are selective and prestigious.',
    },
    passport: { minValidity: '3 months beyond visa validity', notes: 'OFII registration required on arrival.' },
    costs: { monthlyLivingMin: 800, monthlyLivingMax: 1800, currency: 'EUR', applicationFee: 'EUR 30–100', tuitionRange: 'EUR 170–15,000 / year' },
    popular: ['Fashion & Design', 'Culinary Arts', 'MBA', 'Engineering', 'International Relations'],
  },
  {
    name: 'Singapore',
    flag: '🇸🇬', code: 'SG', capital: 'Singapore', region: 'Southeast Asia',
    currency: 'SGD', language: 'English / Malay / Mandarin / Tamil',
    visa: {
      type: 'Student Pass',
      processingTime: '4–8 weeks',
      cost: 'SGD 30',
      validity: 'Course duration',
      documents: ['Acceptance letter from ICA-approved institution', 'Valid passport', 'Completed eForm 16', 'Academic certificates', 'Financial proof', 'Medical examination'],
      notes: 'Application through ICA\'s SOLAR+ system. No general post-study work visa — graduates apply for Employment Pass or S Pass.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Medical examination required.' },
    costs: { monthlyLivingMin: 1500, monthlyLivingMax: 3000, currency: 'SGD', applicationFee: 'SGD 20–50', tuitionRange: 'SGD 17,000–40,000 / year' },
    popular: ['Finance', 'Business', 'Engineering', 'Hospitality', 'Computing'],
  },
  {
    name: 'Netherlands',
    flag: '🇳🇱', code: 'NL', capital: 'Amsterdam', region: 'Europe',
    currency: 'EUR', language: 'Dutch / English',
    visa: {
      type: 'MVV + Residence Permit (TEV)',
      processingTime: '2–4 weeks',
      cost: 'EUR 192',
      validity: 'Course duration',
      documents: ['Acceptance letter from Dutch institution', 'Valid passport', 'Proof of sufficient funds', 'Proof of accommodation', 'Health insurance', 'Tuberculosis (TB) test (if applicable)'],
      notes: 'Orientation year visa allows 1 year to find a job post-graduation. Many programs taught fully in English.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Register with municipality (BRP) within 5 days of arrival.' },
    costs: { monthlyLivingMin: 900, monthlyLivingMax: 1800, currency: 'EUR', applicationFee: 'EUR 50–100', tuitionRange: 'EUR 2,209–15,000 / year' },
    popular: ['Business', 'Agriculture', 'Design', 'Engineering', 'International Law'],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduabroad');
  console.log('Connected to MongoDB');

  const existing = await Country.countDocuments();
  if (existing > 0) {
    console.log(`${existing} countries already exist. Skipping seed.`);
    await mongoose.disconnect();
    return;
  }

  await Country.insertMany(countries);
  console.log(`✅ Seeded ${countries.length} countries successfully.`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
