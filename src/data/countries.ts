export const COUNTRY_SEED: any[] = [
  {
    id: 'us', name: 'United States', flag: '🇺🇸', code: 'US',
    capital: 'Washington D.C.', region: 'North America', currency: 'USD', language: 'English',
    visa: {
      type: 'F-1 Student Visa', processingTime: '3–8 weeks', cost: 'USD 160',
      validity: 'Duration of course + 60 days',
      documents: ['DS-160 Form', 'SEVIS I-20 Form', 'Bank statements (3 months)', 'Academic transcripts', 'TOEFL/IELTS scores', 'Passport (6 months validity)', 'Visa photos'],
      notes: 'OPT (Optional Practical Training) work authorization available for 12–36 months post-graduation. CPT allowed during studies.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Indian passport holders must obtain F-1 visa before travel. No visa-on-arrival.' },
    costs: { monthlyLivingMin: 800, monthlyLivingMax: 2500, currency: 'USD', applicationFee: 'USD 50–100 per university', tuitionRange: 'USD 15,000–60,000 / year' },
    popular: ['Computer Science', 'MBA', 'Engineering', 'Data Science', 'Medicine'],
  },
  {
    id: 'uk', name: 'United Kingdom', flag: '🇬🇧', code: 'GB',
    capital: 'London', region: 'Europe', currency: 'GBP', language: 'English',
    visa: {
      type: 'Student Visa (formerly Tier 4)', processingTime: '3 weeks', cost: 'GBP 363',
      validity: 'Duration of course + 4 months',
      documents: ['CAS (Confirmation of Acceptance for Studies)', 'Bank statements (28 days)', 'Academic transcripts', 'IELTS scores (6.0+)', 'TB test results (Indian nationals)', 'Passport', 'Visa photos'],
      notes: 'Graduate Route visa allows 2 years post-study work (3 for PhD). IHS payment of GBP 776/year is mandatory.',
    },
    passport: { minValidity: '6 months from travel date', notes: 'TB test mandatory for Indian nationals. IHS (Immigration Health Surcharge) must be paid upfront.' },
    costs: { monthlyLivingMin: 900, monthlyLivingMax: 2000, currency: 'GBP', applicationFee: 'GBP 20–100 (via UCAS)', tuitionRange: 'GBP 10,000–38,000 / year' },
    popular: ['Business & MBA', 'Law', 'Engineering', 'Computer Science', 'Medicine'],
  },
  {
    id: 'ca', name: 'Canada', flag: '🇨🇦', code: 'CA',
    capital: 'Ottawa', region: 'North America', currency: 'CAD', language: 'English / French',
    visa: {
      type: 'Study Permit', processingTime: '4–12 weeks', cost: 'CAD 150',
      validity: 'Duration of program + 90 days',
      documents: ['Acceptance letter from DLI', 'Proof of funds (CAD 10,000+)', 'Passport', 'Statement of purpose', 'Biometrics enrollment', 'IELTS/TOEFL scores'],
      notes: 'PGWP (Post-Graduate Work Permit) up to 3 years available. Express Entry immigration pathway after graduation.',
    },
    passport: { minValidity: 'Valid for entire stay', notes: 'Biometrics enrollment required at a VAC. Medical exam may be required based on country of residence.' },
    costs: { monthlyLivingMin: 700, monthlyLivingMax: 2000, currency: 'CAD', applicationFee: 'CAD 50–200 per university', tuitionRange: 'CAD 15,000–40,000 / year' },
    popular: ['Computer Science', 'Engineering', 'Business', 'Data Science', 'Nursing'],
  },
  {
    id: 'au', name: 'Australia', flag: '🇦🇺', code: 'AU',
    capital: 'Canberra', region: 'Oceania', currency: 'AUD', language: 'English',
    visa: {
      type: 'Student Visa (Subclass 500)', processingTime: '1–4 months', cost: 'AUD 650',
      validity: 'Duration of course + 1 month',
      documents: ['CoE (Confirmation of Enrolment)', 'OSHC (health cover)', 'Proof of funds', 'IELTS 6.0+ scores', 'GTE statement', 'Passport', 'Police clearance'],
      notes: 'Temporary Graduate visa (subclass 485) available post-graduation. Can work 48 hours per fortnight during studies.',
    },
    passport: { minValidity: '6 months beyond intended stay', notes: 'Health exam may be required. Overseas Student Health Cover (OSHC) is mandatory for duration of stay.' },
    costs: { monthlyLivingMin: 1000, monthlyLivingMax: 2500, currency: 'AUD', applicationFee: 'AUD 0–100 per university', tuitionRange: 'AUD 20,000–45,000 / year' },
    popular: ['Engineering', 'Business', 'Medicine', 'IT', 'Hospitality'],
  },
  {
    id: 'de', name: 'Germany', flag: '🇩🇪', code: 'DE',
    capital: 'Berlin', region: 'Europe', currency: 'EUR', language: 'German / English',
    visa: {
      type: 'National Visa (D) – Student', processingTime: '6–12 weeks', cost: 'EUR 75',
      validity: 'Up to 90 days (converted to residence permit on arrival)',
      documents: ['University admission letter', 'Blocked account (EUR 11,208/year)', 'Academic transcripts', 'German/English proficiency', 'Health insurance', 'Passport', 'Motivationsschreiben (SOP)'],
      notes: 'Most public universities charge NO tuition (only semester fees ~EUR 150–350). 18-month job-seeker visa available after graduation.',
    },
    passport: { minValidity: '3 months beyond stay', notes: 'Blocked account (Sperrkonto) is mandatory. Apply at German embassy/consulate in India.' },
    costs: { monthlyLivingMin: 700, monthlyLivingMax: 1200, currency: 'EUR', applicationFee: 'EUR 0–75 per university', tuitionRange: 'EUR 0 (public) – 20,000 (private) / year' },
    popular: ['Engineering', 'Computer Science', 'Automotive', 'Physics', 'MBA'],
  },
  {
    id: 'sg', name: 'Singapore', flag: '🇸🇬', code: 'SG',
    capital: 'Singapore', region: 'Southeast Asia', currency: 'SGD', language: 'English',
    visa: {
      type: "Student's Pass (STP)", processingTime: '4–8 weeks', cost: 'SGD 30 (IPA) + SGD 60 (card)',
      validity: 'Duration of course',
      documents: ['IPA (In-Principle Approval) letter', 'SOLAR online registration', 'Passport', 'Academic transcripts', 'Medical examination', 'Passport photos'],
      notes: 'Administered through ICA SOLAR system. Government scholarships (MOE Tuition Grant) available for eligible students.',
    },
    passport: { minValidity: '6 months from date of STP application', notes: 'Medical examination required. Must register with ICA within 30 days of arrival.' },
    costs: { monthlyLivingMin: 1200, monthlyLivingMax: 3000, currency: 'SGD', applicationFee: 'SGD 0–100 per university', tuitionRange: 'SGD 17,000–45,000 / year' },
    popular: ['Business', 'Finance', 'Engineering', 'Computing', 'Science'],
  },
  {
    id: 'nl', name: 'Netherlands', flag: '🇳🇱', code: 'NL',
    capital: 'Amsterdam', region: 'Europe', currency: 'EUR', language: 'Dutch / English',
    visa: {
      type: 'MVV + Residence Permit (for non-EU)', processingTime: '2–4 weeks (MVV)', cost: 'EUR 207',
      validity: 'Duration of study',
      documents: ['Admission letter', 'Proof of funds (EUR 863/month)', 'Health insurance', 'Passport', 'Apostilled documents', 'Notarized diploma'],
      notes: 'Orientation Year (Zoekjaar) permit — 1 year after graduation to find work. Many programs fully in English.',
    },
    passport: { minValidity: '6 months beyond duration of stay', notes: 'University often arranges MVV application on behalf of student.' },
    costs: { monthlyLivingMin: 900, monthlyLivingMax: 1500, currency: 'EUR', applicationFee: 'EUR 0–75 per university', tuitionRange: 'EUR 8,000–20,000 / year' },
    popular: ['Engineering', 'Business', 'Design', 'Agriculture', 'Psychology'],
  },
  {
    id: 'nz', name: 'New Zealand', flag: '🇳🇿', code: 'NZ',
    capital: 'Wellington', region: 'Oceania', currency: 'NZD', language: 'English',
    visa: {
      type: 'Student Visa', processingTime: '1–3 months', cost: 'NZD 375',
      validity: 'Duration of course',
      documents: ['Offer of place from NZ institution', 'Proof of funds (NZD 15,000/year)', 'Return ticket', 'Health certificate', 'IELTS 5.5+ scores', 'Passport'],
      notes: 'Post-study work visa available for 1–3 years. Can work 20 hours/week during studies. Police clearance from India required.',
    },
    passport: { minValidity: '3 months beyond intended stay', notes: 'Medical and chest X-ray required if staying 12+ months.' },
    costs: { monthlyLivingMin: 900, monthlyLivingMax: 2000, currency: 'NZD', applicationFee: 'NZD 0–100 per university', tuitionRange: 'NZD 22,000–35,000 / year' },
    popular: ['Agriculture', 'Engineering', 'Business', 'IT', 'Healthcare'],
  },
];

const LS_KEY = 'mgz_admin_countries_v1';

export function loadCountries(): any[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [...COUNTRY_SEED];
  } catch { return [...COUNTRY_SEED]; }
}
