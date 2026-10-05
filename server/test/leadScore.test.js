const { scoreLead, bandOf } = require('../lib/leadScore');

const now = new Date('2026-10-05T00:00:00Z').getTime();
const daysAgo = (n) => new Date(now - n * 86400000);

describe('scoreLead', () => {
  it('ranks a lead in the visa process with an offer above a fresh enquiry', () => {
    const advanced = scoreLead({ leadStage: 'visa_process', leadStageChangedAt: daysAgo(1), applications: [{ status: 'offer_received' }] }, { now });
    const fresh = scoreLead({ leadStage: 'new_enquiry', leadStageChangedAt: daysAgo(1) }, { now });
    expect(advanced.score).toBeGreaterThan(fresh.score);
    expect(advanced.band).toBe('hot');
    expect(fresh.band).toBe('cool');
  });

  it('explains every point in the score', () => {
    const r = scoreLead({
      leadStage: 'counselling', leadStageChangedAt: daysAgo(2), phone: '1', preferredCountries: ['UK'], budget: 1, educationLevel: 'UG', gpa: 3, englishScore: { score: 7 },
      documents: [{ status: 'verified', url: 'a' }, { url: 'b' }, { url: 'c' }], sessions: [{ lastUsedAt: daysAgo(1) }],
    }, { meetingsLast30d: 2, now });
    expect(r.reasons.reduce((n, x) => n + x.points, 0)).toBe(r.score);
    expect(r.reasons.map((x) => x.text)).toEqual(expect.arrayContaining([
      'Pipeline stage: counselling', 'Has a verified document', 'Has uploaded 3 or more documents', '2 meetings in the last 30 days', 'Signed in within the last 7 days',
    ]));
  });

  it('lowers the score the longer a lead sits at one stage', () => {
    const base = { leadStage: 'shortlisting' };
    const recent = scoreLead({ ...base, leadStageChangedAt: daysAgo(1) }, { now }).score;
    const stale = scoreLead({ ...base, leadStageChangedAt: daysAgo(20) }, { now }).score;
    const dormant = scoreLead({ ...base, leadStageChangedAt: daysAgo(45) }, { now }).score;
    expect(recent).toBeGreaterThan(stale);
    expect(stale).toBeGreaterThan(dormant);
  });

  it('treats dropped, do-not-disturb and other-agent leads as closed', () => {
    for (const leadStage of ['dropped_plans', 'dnd', 'other_agent']) {
      expect(scoreLead({ leadStage }, { now })).toMatchObject({ score: 0, band: 'closed' });
    }
  });

  it('never leaves 0-100', () => {
    const max = scoreLead({
      leadStage: 'enrolment', leadStageChangedAt: daysAgo(0), applications: [{ status: 'enrolled' }], phone: '1', preferredCountries: ['x'], budget: 1,
      educationLevel: 'x', gpa: 1, englishScore: { score: 1 }, documents: [{ status: 'verified', url: 'a' }, { url: 'b' }, { url: 'c' }], sessions: [{ lastUsedAt: daysAgo(0) }],
    }, { meetingsLast30d: 5, now });
    expect(max.score).toBeLessThanOrEqual(100);
    expect(scoreLead({ leadStage: 'not_responding', leadStageChangedAt: daysAgo(90) }, { now }).score).toBeGreaterThanOrEqual(0);
  });

  it('maps scores to bands', () => {
    expect([bandOf(70), bandOf(69), bandOf(40), bandOf(39), bandOf(15), bandOf(14)]).toEqual(['hot', 'warm', 'warm', 'cool', 'cool', 'cold']);
  });
});
