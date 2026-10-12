// Education levels in ascending order
const EDU_ORDER = [
  '12th Grade', 'Diploma', 'Certificate',
  'Bachelor', 'Master', 'PhD',
];

// Normalize strings like "Bachelor's (Completed)" → "Bachelor"
function normalizeEduLevel(level: string): string {
  if (!level) return '';
  return level
    .replace(/\s*\(.*?\)/g, '')  // strip "(Completed)", "(In Progress)" etc.
    .replace(/[''']s\b/g, '')    // "Bachelor's" → "Bachelor", "Master's" → "Master"
    .trim();
}

function eduIndex(level: string): number {
  return EDU_ORDER.indexOf(normalizeEduLevel(level));
}

function calcAge(dateOfBirth: string): number {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() ||
     (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return age;
}

function calcWorkExpYears(exp: any[]): number {
  if (!exp?.length) return 0;
  let months = 0;
  for (const e of exp) {
    if (!e.from) continue;
    const from = new Date(e.from);
    const to   = e.current ? new Date() : (e.to ? new Date(e.to) : new Date());
    months += (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }
  return Math.max(0, months / 12);
}

export type EligibilityStatus = 'eligible' | 'partial' | 'not_eligible' | 'unknown';

export interface EligibilityResult {
  status: EligibilityStatus;
  missing: string[];   // hard fails — student definitely doesn't qualify
  warnings: string[];  // soft — data missing from profile, can't confirm
}

// Parse "IELTS 6.5", "TOEFL 90", "PTE 65", "Duolingo 110" out of a plain string array
function parseEnglishFromRequirements(requirements: string[]): { test: string; minScore: number }[] {
  if (!requirements?.length) return [];
  const parsed: { test: string; minScore: number }[] = [];
  for (const r of requirements) {
    const m = /\b(IELTS|TOEFL|PTE|Duolingo)\s+([\d.]+)/i.exec(r);
    if (m) parsed.push({ test: m[1].toUpperCase(), minScore: parseFloat(m[2]) });
  }
  return parsed;
}

// ─── Course eligibility ────────────────────────────────────────────────────────
export function checkCourseEligibility(student: any, course: any): EligibilityResult {
  const elig = course?.eligibility ?? {};

  const missing: string[] = [];
  const warnings: string[] = [];

  // Education level
  if (elig.minEducationLevel) {
    if (!student.educationLevel) {
      warnings.push(`${elig.minEducationLevel} required — add education level to profile`);
    } else if (eduIndex(student.educationLevel) < eduIndex(elig.minEducationLevel)) {
      missing.push(`${elig.minEducationLevel} required (you have: ${student.educationLevel})`);
    }
  }

  // GPA / percentage
  if (elig.minGPA != null && elig.minGPA > 0) {
    if (student.gpa == null) {
      warnings.push(`Min ${elig.minGPA}% GPA required — add GPA to profile`);
    } else if (student.gpa < elig.minGPA) {
      missing.push(`Min ${elig.minGPA}% GPA (you have: ${student.gpa}%)`);
    }
  }

  // English proficiency — use structured eligibility if present, else parse plain requirements
  const englishReqs: { test: string; minScore: number }[] =
    elig.englishRequirements?.length > 0
      ? elig.englishRequirements
      : parseEnglishFromRequirements(course?.requirements);

  if (englishReqs.length > 0) {
    if (!student.englishScore?.type) {
      const req = englishReqs.map((r: any) => `${r.test} ${r.minScore}`).join(' / ');
      warnings.push(`English test required: ${req} — add score to profile`);
    } else {
      const { type, score } = student.englishScore;
      const matched = englishReqs.find((r: any) => r.test === type);
      if (matched) {
        if (score < matched.minScore) {
          missing.push(`${type} min ${matched.minScore} (you have: ${score})`);
        }
      } else {
        const req = englishReqs.map((r: any) => `${r.test} ${r.minScore}`).join(' / ');
        warnings.push(`Course requires: ${req} — your test (${type}) not listed`);
      }
    }
  }

  // Work experience
  if (elig.minWorkExperienceYears > 0) {
    const years = calcWorkExpYears(student.experienceDetails);
    if (!student.experienceDetails?.length) {
      warnings.push(`${elig.minWorkExperienceYears}y experience required — add work history to profile`);
    } else if (years < elig.minWorkExperienceYears) {
      missing.push(`${elig.minWorkExperienceYears}y experience required (you have: ${years.toFixed(1)}y)`);
    }
  }

  // Age
  if (elig.minAge || elig.maxAge) {
    if (!student.dateOfBirth) {
      warnings.push('Age requirement exists — add date of birth to profile');
    } else {
      const age = calcAge(student.dateOfBirth);
      if (elig.minAge && age < elig.minAge) missing.push(`Min age: ${elig.minAge} (you are: ${age})`);
      if (elig.maxAge && age > elig.maxAge) missing.push(`Max age: ${elig.maxAge} (you are: ${age})`);
    }
  }

  // Nationality restriction
  if (elig.restrictedNationalities?.length > 0 && student.nationality) {
    if (elig.restrictedNationalities.includes(student.nationality)) {
      missing.push(`Your nationality (${student.nationality}) is not eligible for this course`);
    }
  }

  if (missing.length > 0) return { status: 'not_eligible', missing, warnings };
  if (warnings.length > 0) return { status: 'partial',      missing, warnings };

  // No criteria found at all → unknown
  const hasCriteria = elig.minEducationLevel || (elig.minGPA && elig.minGPA > 0) ||
    englishReqs.length > 0 || elig.minWorkExperienceYears > 0 ||
    elig.minAge || elig.maxAge || elig.restrictedNationalities?.length > 0;
  if (!hasCriteria) return { status: 'unknown', missing: [], warnings: [] };

  return { status: 'eligible', missing: [], warnings: [] };
}

// ─── Country eligibility ───────────────────────────────────────────────────────
export function checkCountryEligibility(student: any, country: any): EligibilityResult {
  const elig = country?.eligibility;
  if (!elig || Object.keys(elig).length === 0) return { status: 'unknown', missing: [], warnings: [] };

  const missing: string[] = [];
  const warnings: string[] = [];

  if (elig.minAge || elig.maxAge) {
    if (!student.dateOfBirth) {
      warnings.push('Age requirement exists — add date of birth to profile');
    } else {
      const age = calcAge(student.dateOfBirth);
      if (elig.minAge && age < elig.minAge) missing.push(`Min age: ${elig.minAge} (you are: ${age})`);
      if (elig.maxAge && age > elig.maxAge) missing.push(`Max age: ${elig.maxAge} (you are: ${age})`);
    }
  }

  if (elig.minFunds && elig.minFunds > 0) {
    if (student.budget == null) {
      warnings.push(`Min funds ${elig.fundsCurrency || ''}${elig.minFunds?.toLocaleString()} required — add budget to profile`);
    } else if (student.budget < elig.minFunds) {
      missing.push(`Min funds ${elig.fundsCurrency || ''}${elig.minFunds?.toLocaleString()} (your budget: ${elig.fundsCurrency || ''}${student.budget?.toLocaleString()})`);
    }
  }

  if (elig.restrictedNationalities?.length > 0 && student.nationality) {
    if (elig.restrictedNationalities.includes(student.nationality)) {
      missing.push(`Your nationality (${student.nationality}) is restricted for this country`);
    }
  }

  if (missing.length > 0) return { status: 'not_eligible', missing, warnings };
  if (warnings.length > 0) return { status: 'partial',      missing, warnings };
  return { status: 'eligible', missing: [], warnings: [] };
}

// ─── Shared badge config ───────────────────────────────────────────────────────
export const ELIGIBILITY_BADGE: Record<EligibilityStatus, { label: string; classes: string; dot: string }> = {
  eligible:     { label: 'Eligible',     classes: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500' },
  partial:      { label: 'Check Profile', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  not_eligible: { label: 'Not Eligible', classes: 'bg-red-100 text-red-700 border-red-200',        dot: 'bg-red-500' },
  unknown:      { label: 'No Criteria',  classes: 'bg-gray-100 text-gray-500 border-gray-200',     dot: 'bg-gray-400' },
};
