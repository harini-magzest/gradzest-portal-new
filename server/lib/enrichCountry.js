const axios = require("axios");

const HEADERS = {
  "User-Agent": "EduAbroad/1.0 (country-info-fetcher; contact@eduabroad.com)",
};

const _cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getCached(name) {
  const entry = _cache.get(name.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(name.toLowerCase());
    return null;
  }
  return entry.data;
}
function setCache(name, data) {
  _cache.set(name.toLowerCase(), { data, expiresAt: Date.now() + CACHE_TTL });
}

const SUBREGION_MAP = {
  "South America": "South America",
  "South-Eastern Asia": "Southeast Asia",
  "Southern Asia": "Asia",
  "Eastern Asia": "Asia",
  "Central Asia": "Asia",
  "Western Asia": "Middle East",
  "Northern America": "North America",
  "Central America": "North America",
  Caribbean: "North America",
  "Northern Europe": "Europe",
  "Southern Europe": "Europe",
  "Western Europe": "Europe",
  "Eastern Europe": "Europe",
  "Southern Africa": "Africa",
  "Eastern Africa": "Africa",
  "Western Africa": "Africa",
  "Northern Africa": "Africa",
  "Middle Africa": "Africa",
  "Australia and New Zealand": "Oceania",
  Melanesia: "Oceania",
  Micronesia: "Oceania",
  Polynesia: "Oceania",
};

const REGION_FALLBACK = {
  Americas: "North America",
  Africa: "Africa",
  Oceania: "Oceania",
  Europe: "Europe",
  Asia: "Asia",
};

// Curated student visa & cost data for popular study destinations
const STUDY_DATA = {
  "United States": {
    visa: {
      type: "F-1 Student Visa",
      processingTime: "3–8 weeks",
      cost: "USD 160",
      validity: "Duration of course + 60 days",
      documents: [
        "Valid passport (6+ months validity)",
        "I-20 form from US institution",
        "DS-160 online application",
        "SEVIS fee payment (USD 350)",
        "Bank statements (3 months)",
        "English proficiency (TOEFL/IELTS)",
        "Academic transcripts",
      ],
      notes:
        "OPT work authorization available: 12 months (24 months for STEM graduates). Must maintain full-time enrollment (12+ credit hours/semester).",
    },
    passport: {
      minValidity: "6 months beyond intended stay",
      notes:
        "Biometric passport recommended. TB test required for applicants from certain countries.",
    },
    costs: {
      monthlyLivingMin: 800,
      monthlyLivingMax: 2500,
      currency: "USD",
      applicationFee: "USD 50–150 per university",
      tuitionRange: "USD 15,000–60,000 / year",
    },
    popular: [
      "Computer Science",
      "Business Administration",
      "Engineering",
      "Medicine",
      "Law",
      "Data Science",
    ],
  },
  "United Kingdom": {
    visa: {
      type: "UK Student Visa",
      processingTime: "3–5 weeks",
      cost: "GBP 363",
      validity: "Course duration + 4–6 months",
      documents: [
        "Valid passport",
        "CAS (Confirmation of Acceptance for Studies)",
        "English proficiency (IELTS 5.5+)",
        "Bank statements (28 consecutive days)",
        "TB test results (some nationalities)",
        "ATAS certificate (certain subjects)",
      ],
      notes:
        "IHS (Immigration Health Surcharge) required — GBP 470/year. Work rights: up to 20 hrs/week during term. Graduate Route allows 2–3 years post-study work.",
    },
    passport: {
      minValidity: "6 months beyond visa expiry",
      notes:
        "TB test required for applicants from high-risk countries including India, Pakistan, Bangladesh.",
    },
    costs: {
      monthlyLivingMin: 900,
      monthlyLivingMax: 2200,
      currency: "GBP",
      applicationFee: "GBP 20–25 (UCAS)",
      tuitionRange: "GBP 11,000–38,000 / year",
    },
    popular: [
      "Business & Management",
      "Engineering",
      "Computer Science",
      "Medicine",
      "Architecture",
      "Law",
    ],
  },
  Canada: {
    visa: {
      type: "Canadian Study Permit",
      processingTime: "4–12 weeks",
      cost: "CAD 150",
      validity: "Duration of course + 90 days",
      documents: [
        "Valid passport",
        "Letter of Acceptance (LOA)",
        "Proof of financial support (CAD 10,000+ / year)",
        "English/French proficiency (IELTS / TEF)",
        "Medical exam (some applicants)",
        "Police clearance certificate",
      ],
      notes:
        "PGWP (Post-Graduation Work Permit) allows working for up to 3 years after graduation. Co-op/internship work permitted during studies.",
    },
    passport: {
      minValidity: "Valid throughout the study period",
      notes:
        "Biometric data required for most applicants. eTA required for visa-exempt nationals flying into Canada.",
    },
    costs: {
      monthlyLivingMin: 700,
      monthlyLivingMax: 2000,
      currency: "CAD",
      applicationFee: "CAD 50–200 per university",
      tuitionRange: "CAD 14,000–50,000 / year",
    },
    popular: [
      "Engineering",
      "Business Administration",
      "Computer Science",
      "Healthcare",
      "Environmental Science",
    ],
  },
  Australia: {
    visa: {
      type: "Student Visa (Subclass 500)",
      processingTime: "4–6 weeks",
      cost: "AUD 710",
      validity: "Duration of course + 1–2 months",
      documents: [
        "Valid passport",
        "CoE (Confirmation of Enrolment)",
        "English proficiency (IELTS 5.5+)",
        "OSHC (Overseas Student Health Cover)",
        "Genuine Temporary Entrant (GTE) statement",
        "Financial capacity evidence",
      ],
      notes:
        "Work rights: up to 48 hrs/fortnight during semester. Post-Study Work visa (subclass 485) available for 2–4 years after graduation.",
    },
    passport: {
      minValidity: "6 months beyond intended stay",
      notes:
        "Health and character requirements apply. Must maintain OSHC for entire duration of stay.",
    },
    costs: {
      monthlyLivingMin: 900,
      monthlyLivingMax: 2000,
      currency: "AUD",
      applicationFee: "AUD 50–100 per university",
      tuitionRange: "AUD 20,000–45,000 / year",
    },
    popular: [
      "Business & Commerce",
      "Engineering",
      "IT & Computer Science",
      "Health Sciences",
      "Agriculture",
    ],
  },
  Germany: {
    visa: {
      type: "German Student Visa",
      processingTime: "4–8 weeks",
      cost: "EUR 75",
      validity: "3 months (converted to residence permit on arrival)",
      documents: [
        "Valid passport",
        "University admission letter",
        "Proof of blocked account (EUR 11,208 / year)",
        "Health insurance certificate",
        "Language proficiency (B2 German or English)",
        "Academic certificates (authenticated)",
      ],
      notes:
        "Most public universities charge only semester fees (EUR 100–400). Must open a blocked account (Sperrkonto). 18-month job-seeker visa available after graduation.",
    },
    passport: { minValidity: "3 months beyond intended stay" },
    costs: {
      monthlyLivingMin: 700,
      monthlyLivingMax: 1200,
      currency: "EUR",
      applicationFee: "EUR 0 (public universities)",
      tuitionRange: "EUR 0–20,000 / year",
    },
    popular: [
      "Engineering",
      "Computer Science",
      "Natural Sciences",
      "Business",
      "Automotive Engineering",
    ],
  },
  France: {
    visa: {
      type: "Long-Stay Student Visa (VLS-TS)",
      processingTime: "2–8 weeks",
      cost: "EUR 99",
      validity: "Duration of course",
      documents: [
        "Valid passport",
        "University enrollment confirmation",
        "Bank statements / financial proof",
        "French proficiency (DELF B2 or equivalent)",
        "Proof of accommodation",
        "Health insurance",
      ],
      notes:
        "Register with Campus France before applying. CVEC fee (EUR 103) required annually. Paris is significantly more expensive than other cities.",
    },
    passport: {
      minValidity: "3 months beyond visa expiry",
      notes: "Some nationalities apply through VFS Global.",
    },
    costs: {
      monthlyLivingMin: 700,
      monthlyLivingMax: 1500,
      currency: "EUR",
      applicationFee: "EUR 85 (Campus France fee)",
      tuitionRange: "EUR 170–15,000 / year",
    },
    popular: [
      "Culinary Arts",
      "Fashion Design",
      "Business (Grande École)",
      "Engineering",
      "International Relations",
    ],
  },
  Netherlands: {
    visa: {
      type: "MVV + Residence Permit",
      processingTime: "3–4 weeks",
      cost: "EUR 192",
      validity: "90 days (converted to residence permit)",
      documents: [
        "Valid passport",
        "University admission letter",
        "Proof of tuition payment",
        "Financial sufficiency (EUR 987 / month)",
        "Health insurance",
        "English proficiency (IELTS 6.0+)",
      ],
      notes:
        "Dutch universities handle most of the IND application on your behalf. Work rights: 16 hrs/week during studies. Orientation Year permit after graduation.",
    },
    passport: { minValidity: "6 months beyond intended stay" },
    costs: {
      monthlyLivingMin: 900,
      monthlyLivingMax: 1400,
      currency: "EUR",
      applicationFee: "EUR 50–100",
      tuitionRange: "EUR 8,000–20,000 / year",
    },
    popular: [
      "Business & Economics",
      "Engineering",
      "Technology",
      "Agriculture",
      "Design",
    ],
  },
  Sweden: {
    visa: {
      type: "Residence Permit for Studies",
      processingTime: "2–4 months",
      cost: "SEK 1,500",
      validity: "Duration of studies",
      documents: [
        "Valid passport",
        "University acceptance letter",
        "Proof of funds (SEK 8,620 / month)",
        "Comprehensive health insurance",
        "English proficiency",
      ],
      notes:
        "Apply via Migrationsverket at least 3 months before studies begin.",
    },
    passport: { minValidity: "Valid throughout the study period" },
    costs: {
      monthlyLivingMin: 8000,
      monthlyLivingMax: 14000,
      currency: "SEK",
      applicationFee: "SEK 900 per university",
      tuitionRange: "SEK 80,000–295,000 / year (non-EU)",
    },
    popular: [
      "Engineering & Technology",
      "Computer Science",
      "Business",
      "Environmental Science",
      "Medicine",
    ],
  },
  Switzerland: {
    visa: {
      type: "Swiss Student Residence Permit",
      processingTime: "8–12 weeks",
      cost: "CHF 65–100",
      validity: "Duration of course (annual renewal)",
      documents: [
        "Valid passport",
        "University acceptance letter",
        "Proof of accommodation",
        "Financial sufficiency (CHF 2,000–2,500 / month)",
        "Health insurance",
        "Police clearance certificate",
      ],
      notes:
        "Apply through Swiss embassy/consulate in your home country. Language requirements vary by institution.",
    },
    passport: { minValidity: "6 months beyond intended stay" },
    costs: {
      monthlyLivingMin: 1500,
      monthlyLivingMax: 2500,
      currency: "CHF",
      applicationFee: "CHF 100–200",
      tuitionRange: "CHF 500–50,000 / year",
    },
    popular: [
      "Finance & Banking",
      "Hospitality Management",
      "Engineering",
      "International Relations",
      "Business",
    ],
  },
  Singapore: {
    visa: {
      type: "Student Pass",
      processingTime: "3–6 weeks",
      cost: "SGD 30 (ICA) + SGD 60 (eDP)",
      validity: "Duration of course + 1 month",
      documents: [
        "Valid passport",
        "SOLAR e-application form",
        "Bank statements",
        "School enrollment letter",
        "Medical examination report",
        "Passport-sized photos",
      ],
      notes:
        "Application via SOLAR (Student's Pass On-Line Application & Registration). Work rights: 16 hrs/week during term, full-time during vacations.",
    },
    passport: { minValidity: "6 months beyond course completion" },
    costs: {
      monthlyLivingMin: 1200,
      monthlyLivingMax: 2500,
      currency: "SGD",
      applicationFee: "SGD 10–50 per university",
      tuitionRange: "SGD 15,000–45,000 / year",
    },
    popular: [
      "Business & Finance",
      "Engineering",
      "Computer Science",
      "Design",
      "Biotechnology",
    ],
  },
  "New Zealand": {
    visa: {
      type: "Student Visa",
      processingTime: "4–6 weeks",
      cost: "NZD 375",
      validity: "Duration of course",
      documents: [
        "Valid passport",
        "Enrollment offer letter",
        "Proof of funds (NZD 15,000 / year)",
        "Return ticket or funds for return travel",
        "Medical certificate (some applicants)",
        "Police certificate",
      ],
      notes:
        "Work rights: 20 hrs/week during semester, full-time during scheduled breaks. Post-study work visa available for 1–3 years.",
    },
    passport: { minValidity: "3 months beyond intended departure" },
    costs: {
      monthlyLivingMin: 900,
      monthlyLivingMax: 1800,
      currency: "NZD",
      applicationFee: "NZD 50–100",
      tuitionRange: "NZD 22,000–32,000 / year",
    },
    popular: [
      "Agriculture & Environmental Science",
      "Business",
      "Engineering",
      "Film & Media",
      "Tourism",
    ],
  },
  Japan: {
    visa: {
      type: "College Student Visa (留学ビザ)",
      processingTime: "1–3 months",
      cost: "JPY 3,000 (approx.)",
      validity: "Duration of studies (renewable)",
      documents: [
        "Valid passport",
        "Certificate of Eligibility (CoE) from institution",
        "Visa application form",
        "Passport photos",
        "Academic certificates",
        "Financial proof",
      ],
      notes:
        "CoE is issued by the school and must be submitted with your visa application. Work rights: 28 hrs/week with permission.",
    },
    passport: { minValidity: "6 months beyond intended stay" },
    costs: {
      monthlyLivingMin: 80000,
      monthlyLivingMax: 150000,
      currency: "JPY",
      applicationFee: "JPY 30,000–50,000",
      tuitionRange: "JPY 500,000–2,000,000 / year",
    },
    popular: [
      "Japanese Language",
      "Engineering",
      "IT",
      "Business",
      "Animation & Arts",
    ],
  },
  Ireland: {
    visa: {
      type: "Study Visa (Long Stay D)",
      processingTime: "4–8 weeks",
      cost: "EUR 60–100",
      validity: "Duration of course",
      documents: [
        "Valid passport",
        "University acceptance letter",
        "Proof of funds (EUR 10,000+ / year)",
        "Private medical insurance",
        "English proficiency",
        "Academic certificates",
      ],
      notes:
        "EU nationals do not need a visa. Work rights: 20 hrs/week during term, 40 hrs/week in summer. Third Level Graduate Programme: 12–24 months post-study.",
    },
    passport: {
      minValidity: "12 months beyond intended departure",
      notes: "Must register with GNIB/IRP within 90 days of arrival.",
    },
    costs: {
      monthlyLivingMin: 800,
      monthlyLivingMax: 1500,
      currency: "EUR",
      applicationFee: "EUR 50–100",
      tuitionRange: "EUR 10,000–30,000 / year",
    },
    popular: [
      "Technology & IT",
      "Business & Finance",
      "Pharmaceutical Sciences",
      "Engineering",
      "Data Analytics",
    ],
  },
  "South Korea": {
    visa: {
      type: "D-2 Student Visa",
      processingTime: "3–5 weeks",
      cost: "KRW 60,000 (approx. USD 45)",
      validity: "Duration of course (renewable)",
      documents: [
        "Valid passport",
        "University acceptance letter",
        "Bank balance certificate (USD 12,000+)",
        "Medical insurance",
        "Visa application form",
        "Passport photos",
      ],
      notes:
        "TOPIK (Korean language test) may be required. Work rights: 20 hrs/week during term. Government KGSP scholarships available.",
    },
    passport: { minValidity: "6 months beyond course end" },
    costs: {
      monthlyLivingMin: 600000,
      monthlyLivingMax: 1200000,
      currency: "KRW",
      applicationFee: "KRW 50,000–100,000",
      tuitionRange: "KRW 3,000,000–10,000,000 / semester",
    },
    popular: [
      "Korean Language",
      "Business",
      "Engineering",
      "Korean Culture & Media",
      "Medicine",
    ],
  },
  Malaysia: {
    visa: {
      type: "Student Pass (EMGS)",
      processingTime: "2–6 weeks",
      cost: "MYR 60–500",
      validity: "Duration of course (renewable annually)",
      documents: [
        "Valid passport",
        "EMGS approval letter",
        "University offer letter",
        "Financial proof",
        "Medical examination",
        "Medical insurance",
      ],
      notes:
        "All international student visas processed through EMGS (Education Malaysia Global Services). EduMalaysia card issued upon approval.",
    },
    passport: { minValidity: "18 months beyond entry date" },
    costs: {
      monthlyLivingMin: 1500,
      monthlyLivingMax: 3000,
      currency: "MYR",
      applicationFee: "MYR 1,000–3,000",
      tuitionRange: "MYR 12,000–70,000 / year",
    },
    popular: [
      "Medicine & Health Sciences",
      "Engineering",
      "Business",
      "IT",
      "Architecture",
    ],
  },
  "United Arab Emirates": {
    visa: {
      type: "Student Residence Visa",
      processingTime: "2–4 weeks",
      cost: "AED 750–1,500",
      validity: "1 year (renewable)",
      documents: [
        "Valid passport",
        "University enrollment letter",
        "Passport photos",
        "Medical fitness certificate",
        "Emirates ID registration",
        "Health insurance",
      ],
      notes:
        "Visa is sponsored by the university. Health insurance is mandatory. Multiple global university campuses available in Dubai and Abu Dhabi free zones.",
    },
    passport: { minValidity: "6 months beyond visa expiry" },
    costs: {
      monthlyLivingMin: 3000,
      monthlyLivingMax: 7000,
      currency: "AED",
      applicationFee: "AED 200–500",
      tuitionRange: "AED 30,000–100,000 / year",
    },
    popular: [
      "Business & Finance",
      "Engineering",
      "Architecture",
      "Media & Communications",
      "Hospitality",
    ],
  },
  Italy: {
    visa: {
      type: "Student Visa (Type D)",
      processingTime: "4–8 weeks",
      cost: "EUR 50–100",
      validity: "1 year (renewable)",
      documents: [
        "Valid passport",
        "University enrollment/offer letter",
        "Proof of accommodation",
        "Financial proof (EUR 448 / month)",
        "Health insurance",
        "Pre-enrollment via Universitaly portal",
      ],
      notes:
        "Universitaly portal pre-enrollment required. Dichiarazione di Valore (DoV) may be required for academic qualifications.",
    },
    passport: { minValidity: "3 months beyond visa expiry" },
    costs: {
      monthlyLivingMin: 700,
      monthlyLivingMax: 1500,
      currency: "EUR",
      applicationFee: "EUR 30–100",
      tuitionRange: "EUR 900–20,000 / year",
    },
    popular: [
      "Architecture & Design",
      "Fashion",
      "Culinary Arts",
      "Art & Restoration",
      "Business",
    ],
  },
  Spain: {
    visa: {
      type: "Long-Term Student Visa (National D)",
      processingTime: "4–8 weeks",
      cost: "EUR 80",
      validity: "1 year (renewable)",
      documents: [
        "Valid passport",
        "University enrollment confirmation",
        "Financial proof (EUR 664 / month)",
        "Health insurance",
        "Spanish language proficiency",
        "Apostilled academic credentials",
      ],
      notes:
        "TIE (Tarjeta de Identidad de Extranjero) residence card required within 30 days of arrival.",
    },
    passport: { minValidity: "1 year beyond visa expiry" },
    costs: {
      monthlyLivingMin: 600,
      monthlyLivingMax: 1400,
      currency: "EUR",
      applicationFee: "EUR 50–100",
      tuitionRange: "EUR 1,000–18,000 / year",
    },
    popular: [
      "Spanish Language",
      "Business",
      "Tourism & Hospitality",
      "Architecture",
      "Arts",
    ],
  },
  China: {
    visa: {
      type: "X1 / X2 Student Visa",
      processingTime: "2–6 weeks",
      cost: "USD 140 (approx.)",
      validity: "X1: valid 180 days to enter; X2: single / double entry",
      documents: [
        "Valid passport",
        "JW201 or JW202 admission form",
        "University admission notice",
        "Physical examination form (X1)",
        "Bank statement",
        "Passport photos",
      ],
      notes:
        "X1 for courses 6+ months; X2 for shorter programs. Residence permit must be obtained within 30 days of arrival.",
    },
    passport: { minValidity: "6 months beyond intended stay" },
    costs: {
      monthlyLivingMin: 2000,
      monthlyLivingMax: 5000,
      currency: "CNY",
      applicationFee: "CNY 500–1,000",
      tuitionRange: "CNY 20,000–60,000 / year",
    },
    popular: [
      "Chinese Language (HSK)",
      "Medicine (MBBS)",
      "Engineering",
      "Business",
      "Traditional Chinese Medicine",
    ],
  },
};

async function fetchCountryData(name) {
  const cached = getCached(name);
  if (cached) return cached;

  const blank = {
    name,
    flag: "",
    code: "",
    capital: "",
    region: "",
    currency: "USD",
    language: "",
    visa: {
      type: "",
      processingTime: "",
      cost: "",
      validity: "",
      documents: [],
      notes: "",
    },
    passport: { minValidity: "", notes: "" },
    costs: {
      monthlyLivingMin: 0,
      monthlyLivingMax: 0,
      currency: "USD",
      applicationFee: "",
      tuitionRange: "",
    },
    popular: [],
  };

  let result = { ...blank };

  // Step 1: REST Countries API for basic info
  let rc = null;
  try {
    const exact = await axios
      .get(
        `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=true`,
        { timeout: 8000, headers: HEADERS },
      )
      .catch(() => null);
    rc = exact?.data?.[0] || null;

    if (!rc) {
      const fuzzy = await axios
        .get(
          `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`,
          { timeout: 8000, headers: HEADERS },
        )
        .catch(() => null);
      rc = fuzzy?.data?.[0] || null;
    }
  } catch {}

  if (rc) {
    result.name = rc.name?.common || name;
    result.flag = rc.flag || "🌍";
    result.code = rc.cca2 || "";
    result.capital = rc.capital?.[0] || "";

    const sub = rc.subregion || "";
    const reg = rc.region || "";
    result.region = SUBREGION_MAP[sub] || REGION_FALLBACK[reg] || "";

    const currencyKeys = Object.keys(rc.currencies || {});
    if (currencyKeys[0]) {
      result.currency = currencyKeys[0];
      result.costs.currency = currencyKeys[0];
    }

    const langValues = Object.values(rc.languages || {});
    result.language = langValues.slice(0, 2).join(" / ") || "";
  }

  // Step 2: Curated study destination data (visa, costs, popular programs)
  const matchKey = Object.keys(STUDY_DATA).find(
    (k) =>
      k.toLowerCase() === name.toLowerCase() ||
      k.toLowerCase() === (rc?.name?.common || "").toLowerCase(),
  );

  if (matchKey) {
    const d = STUDY_DATA[matchKey];
    if (d.visa) result.visa = { ...result.visa, ...d.visa };
    if (d.passport) result.passport = { ...result.passport, ...d.passport };
    if (d.costs) result.costs = { ...result.costs, ...d.costs };
    if (d.popular) result.popular = d.popular;
  }

  setCache(name, result);
  return result;
}

module.exports = { fetchCountryData };
