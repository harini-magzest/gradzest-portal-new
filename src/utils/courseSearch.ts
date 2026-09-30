import { checkCourseEligibility } from './eligibility';

// Course-finder filtering. Courses come flattened from universities (see flattenCourses);
// filters are applied only when the user clicks "Advanced Search", so this is pure and synchronous.

export interface CustomFieldFilter { key: string; op: 'is' | 'contains' | 'gte' | 'lte'; value: string }

export interface CourseFilters {
  keyword: string;
  matchMode: 'all' | 'any' | 'exact';
  countries: string[];
  cities: string[];
  universities: string[];
  levels: string[];
  departments: string[];
  intakes: string[];
  durationMin: string;   // years
  durationMax: string;
  feeMin: string;        // approx. USD per year
  feeMax: string;
  appFeeMax: string;
  appFeeWaived: boolean;
  scholarship: boolean;
  rankingMax: string;
  uniTypes: string[];
  acceptanceMin: string; // %
  // Eligibility — either a real student or manually entered scores
  studentId: string;
  eligibility: 'any' | 'hide_not_eligible' | 'eligible_only';
  educationLevel: string;
  gpa: string;
  englishTest: string;
  englishScore: string;
  noEnglishTest: boolean;
  workYears: string;
  age: string;
  nationality: string;
  // Staff-entered custom data
  tags: string[];
  tagMode: 'all' | 'any';
  customFields: CustomFieldFilter[];
  sort: 'relevance' | 'fee_asc' | 'fee_desc' | 'ranking' | 'app_fee' | 'duration' | 'name' | 'recent';
}

export const EMPTY_FILTERS: CourseFilters = {
  keyword: '', matchMode: 'all',
  countries: [], cities: [], universities: [], levels: [], departments: [], intakes: [],
  durationMin: '', durationMax: '', feeMin: '', feeMax: '', appFeeMax: '', appFeeWaived: false, scholarship: false,
  rankingMax: '', uniTypes: [], acceptanceMin: '',
  studentId: '', eligibility: 'any', educationLevel: '', gpa: '', englishTest: '', englishScore: '', noEnglishTest: false,
  workYears: '', age: '', nationality: '',
  tags: [], tagMode: 'any', customFields: [],
  sort: 'relevance',
};

// Approximate conversion so fees in different currencies can share one range filter
const USD_RATE: Record<string, number> = {
  USD: 1, GBP: 1.27, EUR: 1.08, CAD: 0.73, AUD: 0.66, NZD: 0.6, SGD: 0.74, CHF: 1.12, SEK: 0.095, NOK: 0.093,
  DKK: 0.145, JPY: 0.0067, KRW: 0.00075, CNY: 0.14, HKD: 0.128, MYR: 0.21, AED: 0.27, INR: 0.012,
};
export const toUSD = (amount: number, currency?: string) => amount * (USD_RATE[(currency || 'USD').toUpperCase()] ?? 1);

/** "2 years", "18 months", "1.5 yrs", "3-4 years" → months (upper bound of a range). */
export function durationMonths(d?: string): number | null {
  if (!d) return null;
  const nums = (d.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  const n = Math.max(...nums);
  if (/month|mo\b/i.test(d)) return n;
  if (/week/i.test(d)) return n / 4.33;
  return n * 12;   // years by default
}

export function flattenCourses(universities: any[]) {
  return universities.flatMap(uni =>
    (uni.courses || []).map((c: any) => ({
      ...c,
      uniId: String(uni.id || uni._id),   // custom id first — applications store this value
      uniMongoId: String(uni._id || uni.id),
      uniName: uni.name,
      city: uni.city,
      country: uni.country,
      website: uni.website,
      uniLogo: uni.logo,
      uniRanking: uni.ranking,
      uniType: uni.type,
      uniAcceptance: uni.acceptanceRate,
      _uniUpdatedAt: uni.updatedAt || uni.createdAt || 0,
    }))
  );
}

const uniq = (xs: any[]) => Array.from(new Set(xs.filter(x => x !== undefined && x !== null && String(x).trim() !== '').map(x => String(x).trim())))
  .sort((a, b) => a.localeCompare(b));

/** Every distinct value present in the data, so each filter only offers options that can match. */
export function filterOptions(courses: any[]) {
  const fieldValues: Record<string, string[]> = {};
  courses.forEach(c => (c.customFields || []).forEach((f: any) => {
    (fieldValues[f.key] ||= []).push(f.value);
  }));
  Object.keys(fieldValues).forEach(k => { fieldValues[k] = uniq(fieldValues[k]); });
  return {
    countries: uniq(courses.map(c => c.country)),
    cities: uniq(courses.map(c => c.city)),
    universities: uniq(courses.map(c => c.uniName)),
    levels: uniq(courses.map(c => c.level)),
    departments: uniq(courses.map(c => c.department)),
    intakes: uniq(courses.flatMap(c => c.intake || [])),
    uniTypes: uniq(courses.map(c => c.uniType)),
    tags: uniq(courses.flatMap(c => c.tags || [])),
    customFieldKeys: Object.keys(fieldValues).sort((a, b) => a.localeCompare(b)),
    customFieldValues: fieldValues,
    nationalities: uniq(courses.flatMap(c => c.eligibility?.restrictedNationalities || [])),
  };
}

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const num = (s: string) => (s.trim() === '' ? null : Number(s));

// Weighted text fields: a hit in the course name counts more than one in the description
function searchFields(c: any): [string, number][] {
  return [
    [norm(c.name), 6], [norm(c.department), 4], [norm((c.tags || []).join(' ')), 4], [norm(c.uniName), 3],
    [norm(`${c.city} ${c.country}`), 2], [norm((c.customFields || []).map((f: any) => `${f.key} ${f.value}`).join(' ')), 2],
    [norm(c.level), 2], [norm((c.requirements || []).join(' ')), 1], [norm(c.description), 1],
  ];
}

/** Relevance score for the keyword, or -1 when the course doesn't match. */
function keywordScore(c: any, keyword: string, mode: CourseFilters['matchMode']): number {
  const q = norm(keyword).trim();
  if (!q) return 0;
  const fields = searchFields(c);
  if (mode === 'exact') {
    const score = fields.reduce((s, [text, w]) => s + (text.includes(q) ? w : 0), 0);
    return score > 0 ? score : -1;
  }
  const words = q.split(/\s+/).filter(Boolean);
  // Whole-word or word-prefix match, so "art" matches "arts" but not "smart"
  const hits = words.map(w => {
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return fields.reduce((s, [text, wt]) => s + (re.test(text) ? wt : 0), 0);
  });
  if (mode === 'all' && hits.some(h => h === 0)) return -1;
  if (mode === 'any' && hits.every(h => h === 0)) return -1;
  const phraseBonus = words.length > 1 && norm(c.name).includes(q) ? 10 : 0;
  return hits.reduce((a, b) => a + b, 0) + phraseBonus;
}

const inList = (value: any, list: string[]) => !list.length || list.some(v => norm(v) === norm(value));

function customFieldMatch(c: any, f: CustomFieldFilter) {
  if (!f.key) return true;
  const field = (c.customFields || []).find((x: any) => norm(x.key) === norm(f.key));
  if (!field) return false;
  if (!f.value.trim()) return true;   // key present is enough
  const a = parseFloat(field.value), b = parseFloat(f.value);
  if (f.op === 'gte') return !isNaN(a) && !isNaN(b) && a >= b;
  if (f.op === 'lte') return !isNaN(a) && !isNaN(b) && a <= b;
  if (f.op === 'contains') return norm(field.value).includes(norm(f.value));
  return norm(field.value) === norm(f.value);
}

/** A stand-in profile built from the manually entered eligibility fields. */
function manualProfile(f: CourseFilters) {
  const p: any = {};
  if (f.educationLevel) p.educationLevel = f.educationLevel;
  if (num(f.gpa) != null) p.gpa = num(f.gpa);
  if (f.englishTest && num(f.englishScore) != null) p.englishScore = { type: f.englishTest, score: num(f.englishScore) };
  if (num(f.workYears) != null) {
    const from = new Date(); from.setMonth(from.getMonth() - Math.round(Number(f.workYears) * 12));
    p.experienceDetails = [{ from: from.toISOString().slice(0, 10), current: true }];
  }
  if (num(f.age) != null) {
    const dob = new Date(); dob.setFullYear(dob.getFullYear() - Number(f.age)); dob.setDate(dob.getDate() - 1);
    p.dateOfBirth = dob.toISOString().slice(0, 10);
  }
  if (f.nationality) p.nationality = f.nationality;
  return Object.keys(p).length ? p : null;
}

const hasEnglishRequirement = (c: any) =>
  (c.eligibility?.englishRequirements?.length || 0) > 0 || (c.requirements || []).some((r: string) => /\b(IELTS|TOEFL|PTE|Duolingo)\b/i.test(r));

export function searchCourses(courses: any[], f: CourseFilters, students: any[] = []) {
  const student = f.studentId ? students.find(s => String(s._id || s.id) === f.studentId) : null;
  const manual = student ? null : manualProfile(f);
  const profile = student || manual;
  // Typed-in scores are a filter by themselves; a picked student only filters when asked to
  const mode = f.eligibility === 'any' && manual ? 'hide_not_eligible' : f.eligibility;
  const results: { course: any; score: number; eligibility?: ReturnType<typeof checkCourseEligibility> }[] = [];

  for (const c of courses) {
    const score = keywordScore(c, f.keyword, f.matchMode);
    if (score < 0) continue;
    if (!inList(c.country, f.countries) || !inList(c.city, f.cities) || !inList(c.uniName, f.universities)) continue;
    if (!inList(c.level, f.levels) || !inList(c.department, f.departments) || !inList(c.uniType, f.uniTypes)) continue;
    if (f.intakes.length && !(c.intake || []).some((i: string) => inList(i, f.intakes))) continue;

    const months = durationMonths(c.duration);
    if (num(f.durationMin) != null && (months == null || months < Number(f.durationMin) * 12)) continue;
    if (num(f.durationMax) != null && (months == null || months > Number(f.durationMax) * 12)) continue;

    const fee = c.tuitionFee > 0 ? toUSD(c.tuitionFee, c.currency) : null;
    if (num(f.feeMin) != null && (fee == null || fee < Number(f.feeMin))) continue;
    if (num(f.feeMax) != null && (fee == null || fee > Number(f.feeMax))) continue;
    const appFee = toUSD(c.applicationFee || 0, c.currency);
    if (f.appFeeWaived && appFee > 0) continue;
    if (num(f.appFeeMax) != null && appFee > Number(f.appFeeMax)) continue;
    if (f.scholarship && !c.scholarshipAvailable) continue;

    if (num(f.rankingMax) != null && !(c.uniRanking > 0 && c.uniRanking <= Number(f.rankingMax))) continue;
    if (num(f.acceptanceMin) != null && !(c.uniAcceptance >= Number(f.acceptanceMin))) continue;
    if (f.noEnglishTest && hasEnglishRequirement(c)) continue;

    if (f.tags.length) {
      const have = (c.tags || []).map(norm);
      const ok = f.tagMode === 'all' ? f.tags.every(t => have.includes(norm(t))) : f.tags.some(t => have.includes(norm(t)));
      if (!ok) continue;
    }
    if (!f.customFields.every(cf => customFieldMatch(c, cf))) continue;

    let eligibility;
    if (profile) {
      eligibility = checkCourseEligibility(profile, c);
      if (mode === 'hide_not_eligible' && eligibility.status === 'not_eligible') continue;
      if (mode === 'eligible_only' &&!['eligible', 'unknown'].includes(eligibility.status)) continue;
    }
    results.push({ course: c, score, eligibility });
  }

  const fee = (c: any) => (c.tuitionFee > 0 ? toUSD(c.tuitionFee, c.currency) : Infinity);
  const sorters: Record<CourseFilters['sort'], (a: any, b: any) => number> = {
    relevance: (a, b) => b.score - a.score || new Date(b.course._uniUpdatedAt).getTime() - new Date(a.course._uniUpdatedAt).getTime(),
    recent: (a, b) => new Date(b.course._uniUpdatedAt).getTime() - new Date(a.course._uniUpdatedAt).getTime(),
    fee_asc: (a, b) => fee(a.course) - fee(b.course),
    fee_desc: (a, b) => (b.course.tuitionFee > 0 ? fee(b.course) : -1) - (a.course.tuitionFee > 0 ? fee(a.course) : -1),
    ranking: (a, b) => (a.course.uniRanking > 0 ? a.course.uniRanking : Infinity) - (b.course.uniRanking > 0 ? b.course.uniRanking : Infinity),
    app_fee: (a, b) => toUSD(a.course.applicationFee || 0, a.course.currency) - toUSD(b.course.applicationFee || 0, b.course.currency),
    duration: (a, b) => (durationMonths(a.course.duration) ?? Infinity) - (durationMonths(b.course.duration) ?? Infinity),
    name: (a, b) => String(a.course.name).localeCompare(String(b.course.name)),
  };
  return results.sort(sorters[f.sort] || sorters.relevance);
}

/** Human-readable chips for the filters currently applied, each with a way to remove it. */
export function activeFilterChips(f: CourseFilters, students: any[] = []): { label: string; clear: (f: CourseFilters) => CourseFilters }[] {
  const chips: { label: string; clear: (f: CourseFilters) => CourseFilters }[] = [];
  const listChip = (key: keyof CourseFilters, name: string) => {
    ((f[key] as string[]) || []).forEach(v => chips.push({ label: `${name}: ${v}`, clear: x => ({ ...x, [key]: (x[key] as string[]).filter(y => y !== v) }) }));
  };
  const valChip = (key: keyof CourseFilters, label: string) => {
    if (f[key] !== '' && f[key] !== false) chips.push({ label, clear: x => ({ ...x, [key]: typeof EMPTY_FILTERS[key] === 'boolean' ? false : '' }) });
  };
  if (f.keyword.trim()) chips.push({ label: `"${f.keyword.trim()}"${f.matchMode === 'exact' ? ' (exact)' : f.matchMode === 'any' ? ' (any word)' : ''}`, clear: x => ({ ...x, keyword: '' }) });
  listChip('countries', 'Country'); listChip('cities', 'City'); listChip('universities', 'University');
  listChip('levels', 'Level'); listChip('departments', 'Discipline'); listChip('intakes', 'Intake'); listChip('uniTypes', 'Type');
  valChip('durationMin', `Duration ≥ ${f.durationMin}y`); valChip('durationMax', `Duration ≤ ${f.durationMax}y`);
  valChip('feeMin', `Tuition ≥ $${Number(f.feeMin).toLocaleString()}`); valChip('feeMax', `Tuition ≤ $${Number(f.feeMax).toLocaleString()}`);
  valChip('appFeeMax', `App fee ≤ $${f.appFeeMax}`); valChip('appFeeWaived', 'No application fee'); valChip('scholarship', 'Scholarship');
  valChip('rankingMax', `Top ${f.rankingMax} ranked`); valChip('acceptanceMin', `Acceptance ≥ ${f.acceptanceMin}%`);
  if (f.studentId) {
    const s = students.find(x => String(x._id || x.id) === f.studentId);
    chips.push({ label: `Student: ${s?.name || 'selected'}`, clear: x => ({ ...x, studentId: '' }) });
  }
  valChip('educationLevel', `Education: ${f.educationLevel}`); valChip('gpa', `GPA ${f.gpa}`);
  if (f.englishTest && f.englishScore) chips.push({ label: `${f.englishTest} ${f.englishScore}`, clear: x => ({ ...x, englishTest: '', englishScore: '' }) });
  valChip('noEnglishTest', 'No English test'); valChip('workYears', `${f.workYears}y experience`);
  valChip('age', `Age ${f.age}`); valChip('nationality', `Nationality: ${f.nationality}`);
  if (f.eligibility !== 'any') chips.push({ label: f.eligibility === 'eligible_only' ? 'Eligible only' : 'Hide not eligible', clear: x => ({ ...x, eligibility: 'any' }) });
  f.tags.forEach(t => chips.push({ label: `#${t}`, clear: x => ({ ...x, tags: x.tags.filter(y => y !== t) }) }));
  f.customFields.forEach((cf, i) => cf.key && chips.push({
    label: `${cf.key} ${({ is: '=', contains: '∋', gte: '≥', lte: '≤' })[cf.op]} ${cf.value || 'any'}`,
    clear: x => ({ ...x, customFields: x.customFields.filter((_, j) => j !== i) }),
  }));
  return chips;
}
