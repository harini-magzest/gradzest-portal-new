// Cost and comparison maths for the "Compare & cost" page. Pure functions over the catalogue data the app already
// loads (University.courses[], Country.costs / Country.eligibility), so it is easy to test and nothing about the
// student leaves the browser.
//
// Rules this file keeps on purpose:
//  - A fee of 0 is a real value (free public tuition exists); only undefined / null / NaN means "not on file".
//  - Currencies are never silently mixed. A cost in another currency is converted only with a rate the user typed in
//    (`rates`); without one, the total is withheld and the currency is listed in `needsRates`.
//  - If a cost is missing the estimate says what is missing and marks itself partial. It never presents a partial
//    figure as the whole cost.

export interface Money { amount: number; currency: string }

export interface CourseLike {
  _id?: string; id?: string; name?: string; level?: string; duration?: string;
  tuitionFee?: number | null; currency?: string; applicationFee?: number | null; registrationFee?: number | null;
  intake?: string[]; scholarshipAvailable?: boolean; scholarshipAmount?: string;
  eligibility?: { minGPA?: number; englishRequirements?: { test?: string; minScore?: number }[]; minWorkExperienceYears?: number };
}
export interface UniversityLike {
  _id?: string; id?: string; name?: string; country?: string; city?: string; ranking?: number; acceptanceRate?: number;
  applicationDeadlines?: { intake?: string; deadline?: string }[];
  scholarships?: { name?: string; amount?: number; currency?: string; deadline?: string }[];
}
export interface CountryLike {
  name?: string;
  costs?: { monthlyLivingMin?: number | null; monthlyLivingMax?: number | null; currency?: string };
  eligibility?: { minFunds?: number | null; fundsCurrency?: string };
}

export type Rates = Record<string, number>; // currency code -> how many units of the target currency one unit is worth

export interface Estimate {
  targetCurrency: string;
  years: number | null;
  tuitionPerYear: Money | null;
  tuitionTotal: Money | null;
  oneOffFees: Money | null; // application + registration
  livingPerYear: { low: Money; high: Money } | null;
  visaFunds: Money | null; // proof of funds the visa requires; shown, but not added to the cost
  total: { low: number; high: number } | null; // in targetCurrency; null when it cannot be worked out
  firstYear: { low: number; high: number } | null;
  needsRates: string[]; // currencies that need an exchange rate before a total can be shown
  missing: string[]; // what is not on file
  partial: boolean; // true when `missing` leaves the total out something real
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const cur = (c?: string): string => String(c || '').trim().toUpperCase();

// "2 years", "18 months", "1.5 yrs", "4 semesters" -> years. Anything else is unknown, not guessed.
export function parseDurationYears(text?: string): number | null {
  const m = String(text ?? '').toLowerCase().match(/(\d+(?:\.\d+)?)[\s-]*(years?|yrs?|y|months?|mos?|semesters?|sems?)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!(n > 0)) return null;
  const unit = m[2];
  if (unit.startsWith('y')) return n;
  if (unit.startsWith('m')) return n / 12;
  return n / 2; // semesters
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'united kingdom', 'u.k.': 'united kingdom', england: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom',
  usa: 'united states', us: 'united states', 'u.s.': 'united states', 'u.s.a.': 'united states', america: 'united states', 'united states of america': 'united states',
  uae: 'united arab emirates',
};
const countryKey = (n?: string) => { const k = String(n ?? '').trim().toLowerCase(); return COUNTRY_ALIASES[k] || k; };

export function findCountry(countries: CountryLike[], name?: string): CountryLike | undefined {
  const key = countryKey(name);
  return key ? countries.find((c) => countryKey(c.name) === key) : undefined;
}

export function courseKey(u: UniversityLike, c: CourseLike): string {
  return `${u._id ?? u.id ?? u.name}:${c._id ?? c.id ?? c.name}`;
}

// Converts one amount into the target currency, or reports the currency that needs a rate.
function toTarget(m: Money, target: string, rates: Rates, needs: Set<string>): number | null {
  if (m.currency === target || !m.currency) return m.amount;
  const r = rates[m.currency];
  if (typeof r === 'number' && r > 0) return m.amount * r;
  needs.add(m.currency);
  return null;
}

export function estimateCost(
  university: UniversityLike,
  course: CourseLike,
  country: CountryLike | undefined,
  opts: { targetCurrency?: string; rates?: Rates } = {},
): Estimate {
  const target = cur(opts.targetCurrency) || cur(course.currency) || 'USD';
  const rates = opts.rates || {};
  const missing: string[] = [];
  const needs = new Set<string>();

  const years = parseDurationYears(course.duration);
  if (years === null) missing.push('course duration');

  const tuitionAmount = num(course.tuitionFee);
  const tuitionCur = cur(course.currency) || cur(country?.costs?.currency) || target;
  const tuitionPerYear: Money | null = tuitionAmount === null ? null : { amount: tuitionAmount, currency: tuitionCur };
  if (tuitionPerYear === null) missing.push('tuition fee');
  // Tuition is quoted per year in this catalogue; the total needs the duration.
  const tuitionTotal: Money | null = tuitionPerYear && years !== null ? { amount: tuitionPerYear.amount * years, currency: tuitionCur } : null;

  const app = num(course.applicationFee);
  const reg = num(course.registrationFee);
  const oneOffFees: Money | null = app === null && reg === null ? null : { amount: (app ?? 0) + (reg ?? 0), currency: tuitionCur };

  const livLo = num(country?.costs?.monthlyLivingMin);
  const livHi = num(country?.costs?.monthlyLivingMax);
  const livCur = cur(country?.costs?.currency) || target;
  let livingPerYear: Estimate['livingPerYear'] = null;
  if (livLo === null && livHi === null) {
    missing.push(country?.name ? `living costs for ${country.name}` : `living costs for ${university.country || 'this country'}`);
  } else {
    const lo = livLo ?? livHi!;
    const hi = livHi ?? livLo!;
    livingPerYear = { low: { amount: lo * 12, currency: livCur }, high: { amount: hi * 12, currency: livCur } };
  }

  const fundsAmount = num(country?.eligibility?.minFunds);
  const visaFunds: Money | null = fundsAmount === null ? null : { amount: fundsAmount, currency: cur(country?.eligibility?.fundsCurrency) || livCur };

  // Totals, in the target currency, only when every component that exists can be converted.
  let total: Estimate['total'] = null;
  let firstYear: Estimate['firstYear'] = null;
  if (tuitionPerYear && years !== null) {
    const tuitionTotalT = toTarget(tuitionTotal!, target, rates, needs);
    const tuitionYearT = toTarget(tuitionPerYear, target, rates, needs);
    const oneOffT = oneOffFees ? toTarget(oneOffFees, target, rates, needs) : 0;
    const livLoT = livingPerYear ? toTarget(livingPerYear.low, target, rates, needs) : 0;
    const livHiT = livingPerYear ? toTarget(livingPerYear.high, target, rates, needs) : 0;
    if ([tuitionTotalT, tuitionYearT, oneOffT, livLoT, livHiT].every((v) => v !== null)) {
      total = {
        low: tuitionTotalT! + oneOffT! + livLoT! * years,
        high: tuitionTotalT! + oneOffT! + livHiT! * years,
      };
      firstYear = {
        low: tuitionYearT! + oneOffT! + livLoT!,
        high: tuitionYearT! + oneOffT! + livHiT!,
      };
    }
  } else {
    // Still note which currencies would need a rate, so the page can ask for them up front.
    for (const m of [tuitionPerYear, oneOffFees, livingPerYear?.low].filter(Boolean) as Money[]) toTarget(m, target, rates, needs);
  }

  const partial = missing.length > 0;
  return { targetCurrency: target, years, tuitionPerYear, tuitionTotal, oneOffFees, livingPerYear, visaFunds, total, firstYear, needsRates: [...needs].sort(), missing, partial };
}

export type Verdict = 'within' | 'tight' | 'over' | 'unknown';
export type BudgetPeriod = 'year' | 'total';

// How a budget (in `budgetCurrency`, for a year or for the whole course) lines up against an estimate.
//  within  — covers even the higher end
//  tight   — covers the lower end but not the higher end
//  over    — does not cover even the lower end
//  unknown — cannot tell (a rate or a cost is missing); never guessed
export function compareToBudget(
  est: Estimate,
  budget: number | null | undefined,
  budgetCurrency: string,
  period: BudgetPeriod,
  rates: Rates = {},
): Verdict {
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) return 'unknown';
  const bc = cur(budgetCurrency) || est.targetCurrency;
  let b = budget;
  if (bc !== est.targetCurrency) {
    const r = rates[bc];
    if (!(typeof r === 'number' && r > 0)) return 'unknown';
    b = budget * r;
  }
  const range = period === 'year' ? est.firstYear : est.total;
  if (!range) return 'unknown';
  // A partial estimate leaves real costs out, so it can prove "over" but never "within".
  if (est.partial) return b < range.low ? 'over' : 'unknown';
  if (b >= range.high) return 'within';
  if (b >= range.low) return 'tight';
  return 'over';
}

export function formatMoney(m: Money | null | undefined): string {
  if (!m) return '—';
  return `${m.currency ? `${m.currency} ` : ''}${Math.round(m.amount).toLocaleString('en-US')}`;
}
export function formatRange(range: { low: number; high: number } | null, currency: string): string {
  if (!range) return '—';
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  return Math.round(range.low) === Math.round(range.high) ? `${currency} ${f(range.low)}` : `${currency} ${f(range.low)} – ${f(range.high)}`;
}
