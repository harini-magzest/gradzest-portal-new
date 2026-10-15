import { describe, it, expect } from 'vitest';
import source from './eligibility.ts?raw';
import { ELIGIBILITY_STUDENT_FIELDS, checkCourseEligibility, checkCountryEligibility } from './eligibility';

// Pages that only run these checks ask the server for exactly ELIGIBILITY_STUDENT_FIELDS (instead of every student's
// whole record). If a check starts reading another field of a student, that page would silently evaluate it as missing:
// this fails first, so the list is extended in the same change.
describe('ELIGIBILITY_STUDENT_FIELDS', () => {
  it('covers every field of a student the eligibility checks read', () => {
    const read = new Set<string>();
    for (const m of source.matchAll(/\bstudent\??\.([A-Za-z_]\w*)/g)) read.add(m[1]);
    expect(read.size).toBeGreaterThan(5); // the pattern really found the reads
    const listed = new Set(ELIGIBILITY_STUDENT_FIELDS);
    const missing = [...read].filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
  });

  it('is enough for a check to reach the same verdict as with the whole record', () => {
    const whole = {
      name: 'Asha', email: 'a@example.com', phone: '+911', status: 'active', applications: [{ id: 1 }], documents: [{ id: 2 }],
      educationLevel: 'Bachelor', gpa: 72, englishScore: { type: 'IELTS', score: 6.5 },
      experienceDetails: [{ startDate: '2020-01-01', endDate: '2022-01-01' }],
      dateOfBirth: '2000-05-05', nationality: 'Indian', budget: 30000,
    } as Record<string, unknown>;
    const narrow = Object.fromEntries(ELIGIBILITY_STUDENT_FIELDS.filter((f) => f in whole).map((f) => [f, whole[f]]));
    const course = { eligibility: { minEducationLevel: 'Master', minGPA: 60, englishRequirements: [{ type: 'IELTS', minScore: 6.5 }], minWorkExperienceYears: 1 } };
    const country = { eligibility: { minFunds: 20000, restrictedNationalities: ['Nowhere'] } };
    expect(checkCourseEligibility(narrow, course)).toEqual(checkCourseEligibility(whole, course));
    expect(checkCountryEligibility(narrow, country)).toEqual(checkCountryEligibility(whole, country));
  });
});
