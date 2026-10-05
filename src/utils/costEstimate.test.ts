import { describe, it, expect } from 'vitest';
import {
  parseDurationYears, estimateCost, compareToBudget, findCountry, courseKey, formatMoney, formatRange,
  type CourseLike, type UniversityLike, type CountryLike,
} from './costEstimate';

const uk: UniversityLike = { _id: 'u1', name: 'London Uni', country: 'United Kingdom' };
const ukCountry: CountryLike = { name: 'United Kingdom', costs: { monthlyLivingMin: 1000, monthlyLivingMax: 1500, currency: 'GBP' }, eligibility: { minFunds: 18000, fundsCurrency: 'GBP' } };

describe('parseDurationYears', () => {
  it('reads years, months and semesters', () => {
    expect(parseDurationYears('2 years')).toBe(2);
    expect(parseDurationYears('1 year')).toBe(1);
    expect(parseDurationYears('1.5 yrs')).toBe(1.5);
    expect(parseDurationYears('18 months')).toBe(1.5);
    expect(parseDurationYears('24 Months')).toBe(2);
    expect(parseDurationYears('4 semesters')).toBe(2);
    expect(parseDurationYears('2-year programme')).toBe(2);
  });
  it('returns null instead of guessing', () => {
    for (const bad of ['', undefined, 'full-time', '0 years', 'a few years', '12']) expect(parseDurationYears(bad as any)).toBeNull();
  });
});

describe('estimateCost: single currency', () => {
  it('adds tuition, one-off fees and a living-cost range over the whole course', () => {
    const c: CourseLike = { duration: '2 years', tuitionFee: 20000, currency: 'GBP', applicationFee: 100, registrationFee: 50 };
    const e = estimateCost(uk, c, { ...ukCountry, costs: { monthlyLivingMin: 800, monthlyLivingMax: 1000, currency: 'GBP' } });
    expect(e.years).toBe(2);
    expect(e.tuitionTotal).toEqual({ amount: 40000, currency: 'GBP' });
    expect(e.oneOffFees).toEqual({ amount: 150, currency: 'GBP' });
    // low = 40000 + 150 + 2 * (800*12) = 59350 ; high = 40000 + 150 + 2 * (1000*12) = 64150
    expect(e.total).toEqual({ low: 59350, high: 64150 });
    // first year = 20000 + 150 + 9600 .. 12000
    expect(e.firstYear).toEqual({ low: 29750, high: 32150 });
    expect(e.partial).toBe(false);
    expect(e.missing).toEqual([]);
    expect(e.needsRates).toEqual([]);
  });

  it('treats a tuition fee of 0 as a real value, not as missing', () => {
    const c: CourseLike = { duration: '2 years', tuitionFee: 0, currency: 'EUR' };
    const de: CountryLike = { name: 'Germany', costs: { monthlyLivingMin: 900, monthlyLivingMax: 1100, currency: 'EUR' } };
    const e = estimateCost({ name: 'TU', country: 'Germany' }, c, de);
    expect(e.missing).toEqual([]);
    expect(e.total).toEqual({ low: 21600, high: 26400 });
  });

  it('says what is missing and marks the estimate partial', () => {
    const noFee = estimateCost(uk, { duration: '1 year', currency: 'GBP' }, ukCountry);
    expect(noFee.missing).toContain('tuition fee');
    expect(noFee.total).toBeNull();
    expect(noFee.partial).toBe(true);

    const noDuration = estimateCost(uk, { tuitionFee: 10000, currency: 'GBP' }, ukCountry);
    expect(noDuration.missing).toContain('course duration');
    expect(noDuration.total).toBeNull();

    const noCountry = estimateCost({ ...uk, country: 'Germany' }, { duration: '1 year', tuitionFee: 5000, currency: 'EUR' }, undefined);
    expect(noCountry.missing).toContain('living costs for Germany');
    expect(noCountry.partial).toBe(true);
    expect(noCountry.total).toEqual({ low: 5000, high: 5000 }); // tuition only, and flagged as partial
  });

  it('rejects negative and non-numeric fees as missing', () => {
    const e = estimateCost(uk, { duration: '1 year', tuitionFee: -5 as any, currency: 'GBP' }, ukCountry);
    expect(e.missing).toContain('tuition fee');
    const f = estimateCost(uk, { duration: '1 year', tuitionFee: NaN, currency: 'GBP' }, ukCountry);
    expect(f.missing).toContain('tuition fee');
  });

  it('shows the visa funds requirement without adding it to the cost', () => {
    const e = estimateCost(uk, { duration: '1 year', tuitionFee: 10000, currency: 'GBP' }, ukCountry);
    expect(e.visaFunds).toEqual({ amount: 18000, currency: 'GBP' });
    expect(e.total!.low).toBe(10000 + 12000); // not 10000 + 12000 + 18000
  });
});

describe('estimateCost: currencies are never mixed silently', () => {
  const course: CourseLike = { duration: '1 year', tuitionFee: 20000, currency: 'GBP' };
  const eurLiving: CountryLike = { name: 'United Kingdom', costs: { monthlyLivingMin: 1000, monthlyLivingMax: 1000, currency: 'EUR' } };

  it('withholds the total and asks for a rate when currencies differ', () => {
    const e = estimateCost(uk, course, eurLiving);
    expect(e.total).toBeNull();
    expect(e.needsRates).toEqual(['EUR']);
  });

  it('converts with the rate the user supplies', () => {
    const e = estimateCost(uk, course, eurLiving, { rates: { EUR: 0.85 } });
    // living = 12000 EUR * 0.85 = 10200 GBP
    expect(e.total).toEqual({ low: 30200, high: 30200 });
    expect(e.needsRates).toEqual([]);
  });

  it('ignores a zero or negative rate', () => {
    expect(estimateCost(uk, course, eurLiving, { rates: { EUR: 0 } }).total).toBeNull();
    expect(estimateCost(uk, course, eurLiving, { rates: { EUR: -1 } }).needsRates).toEqual(['EUR']);
  });

  it('can express everything in another target currency', () => {
    const e = estimateCost(uk, course, eurLiving, { targetCurrency: 'EUR', rates: { GBP: 1.2 } });
    // tuition 20000 GBP * 1.2 = 24000 EUR ; living 12000 EUR
    expect(e.targetCurrency).toBe('EUR');
    expect(e.total).toEqual({ low: 36000, high: 36000 });
  });
});

describe('compareToBudget', () => {
  // total 42150 .. 48150, first year the same (1-year course)
  const e = estimateCost(uk, { duration: '1 year', tuitionFee: 30000, currency: 'GBP', applicationFee: 100, registrationFee: 50 }, ukCountry);

  it('within / tight / over for the whole course', () => {
    expect(compareToBudget(e, 50000, 'GBP', 'total')).toBe('within');
    expect(compareToBudget(e, 48150, 'GBP', 'total')).toBe('within');
    expect(compareToBudget(e, 45000, 'GBP', 'total')).toBe('tight');
    expect(compareToBudget(e, 40000, 'GBP', 'total')).toBe('over');
  });

  it('can compare a per-year budget with the first year', () => {
    const two = estimateCost(uk, { duration: '2 years', tuitionFee: 20000, currency: 'GBP' }, { ...ukCountry, costs: { monthlyLivingMin: 1000, monthlyLivingMax: 1000, currency: 'GBP' } });
    // first year = 20000 + 12000 = 32000 ; whole course = 64000
    expect(compareToBudget(two, 33000, 'GBP', 'year')).toBe('within');
    expect(compareToBudget(two, 33000, 'GBP', 'total')).toBe('over');
  });

  it('uses a rate for a budget in another currency, and says unknown without one', () => {
    expect(compareToBudget(e, 60000, 'USD', 'total')).toBe('unknown');
    expect(compareToBudget(e, 60000, 'USD', 'total', { USD: 0.8 })).toBe('tight'); // 48000 GBP
  });

  it('is unknown for a missing or invalid budget, or an estimate with no total', () => {
    for (const b of [undefined, null, 0, -5, NaN]) expect(compareToBudget(e, b as any, 'GBP', 'total')).toBe('unknown');
    const noTotal = estimateCost(uk, { duration: '1 year', currency: 'GBP' }, ukCountry);
    expect(compareToBudget(noTotal, 100000, 'GBP', 'total')).toBe('unknown');
  });

  it('a partial estimate can prove "over" but never "within"', () => {
    const partial = estimateCost({ ...uk, country: 'Germany' }, { duration: '1 year', tuitionFee: 5000, currency: 'EUR' }, undefined);
    expect(partial.partial).toBe(true);
    expect(compareToBudget(partial, 1000, 'EUR', 'total')).toBe('over'); // cannot even cover the tuition
    expect(compareToBudget(partial, 100000, 'EUR', 'total')).toBe('unknown'); // living costs unknown
  });
});

describe('helpers', () => {
  it('finds a country through common aliases, case-insensitively', () => {
    const list: CountryLike[] = [{ name: 'United Kingdom' }, { name: 'United States' }, { name: 'Germany' }];
    expect(findCountry(list, 'UK')?.name).toBe('United Kingdom');
    expect(findCountry(list, 'usa')?.name).toBe('United States');
    expect(findCountry(list, ' germany ')?.name).toBe('Germany');
    expect(findCountry(list, 'Atlantis')).toBeUndefined();
    expect(findCountry(list, undefined)).toBeUndefined();
  });

  it('builds a stable key per university and course', () => {
    expect(courseKey({ _id: 'u1' }, { _id: 'c9' })).toBe('u1:c9');
    expect(courseKey({ id: 'uni-x' }, { id: 'crs-y' })).toBe('uni-x:crs-y');
  });

  it('formats money and ranges', () => {
    expect(formatMoney({ amount: 12345.6, currency: 'GBP' })).toBe('GBP 12,346');
    expect(formatMoney(null)).toBe('—');
    expect(formatRange({ low: 100, high: 100 }, 'USD')).toBe('USD 100');
    expect(formatRange({ low: 1000, high: 2500 }, 'USD')).toBe('USD 1,000 – 2,500');
    expect(formatRange(null, 'USD')).toBe('—');
  });
});
