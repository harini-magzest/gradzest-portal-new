const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Country = require('../models/Country');
const { buildChecklist, destinationNames } = require('../lib/documentChecklist');
const { buildTimeline } = require('../lib/applicationTimeline');

describe('buildChecklist', () => {
  const doc = (name, type, status = 'pending', url = '/uploads/x.pdf') => ({ _id: `${name}-${type}`, name, type, status, url });

  it('lists the standard documents as missing for a student with nothing uploaded', () => {
    const { items, summary } = buildChecklist({ documents: [] }, []);
    expect(items.map((i) => i.key)).toEqual(['passport', 'transcripts', 'english', 'sop', 'lor', 'cv', 'financial']);
    expect(items.every((i) => i.status === 'missing')).toBe(true);
    expect(summary.percent).toBe(0);
  });

  it('marks verified, uploaded and requested documents distinctly', () => {
    const { items, summary } = buildChecklist({
      documents: [
        doc('passport.pdf', 'Passport', 'verified'),
        doc('ielts.pdf', 'English Test Certificate', 'pending'),
        { _id: 'r', name: 'SOP', type: 'SOP', status: 'pending' }, // staff request, no file yet
      ],
    }, []);
    const by = Object.fromEntries(items.map((i) => [i.key, i.status]));
    expect(by).toMatchObject({ passport: 'verified', english: 'uploaded', sop: 'requested', lor: 'missing' });
    expect(summary.verified).toBe(1);
    expect(summary.uploaded).toBe(1);
  });

  it('prefers a verified match over a pending one, and does not count an English certificate as a transcript', () => {
    const { items } = buildChecklist({
      documents: [doc('a.pdf', 'Transcript', 'pending'), doc('b.pdf', 'Degree Certificate', 'verified'), doc('c.pdf', 'English Test Certificate', 'verified')],
    }, []);
    expect(items.find((i) => i.key === 'transcripts').status).toBe('verified');
    expect(items.find((i) => i.key === 'transcripts').docName).toBe('b.pdf');
  });

  it("adds a destination country's extra visa documents once, and skips ones the standard set already covers", () => {
    const uk = { name: 'United Kingdom', visa: { documents: ['Valid passport', 'Tuberculosis test certificate', 'CAS letter'] } };
    const aus = { name: 'Australia', visa: { documents: ['Tuberculosis test certificate', 'Overseas health cover'] } };
    const { items } = buildChecklist({ documents: [doc('tuberculosis-result.pdf', 'Other', 'verified')] }, [uk, aus]);
    const extras = items.filter((i) => i.key.startsWith('visa:'));
    expect(extras.map((i) => i.label)).toEqual(['Tuberculosis test certificate', 'CAS letter', 'Overseas health cover']);
    expect(extras[0].scope).toBe('United Kingdom, Australia');
    expect(extras[0].status).toBe('verified'); // matched on the word "tuberculosis" in the file name
    expect(extras[1].status).toBe('missing');
  });
});

describe('destinationNames', () => {
  it('merges preferred and applied-to countries without case duplicates', () => {
    expect(destinationNames({ preferredCountries: ['UK', 'Canada'] }, ['uk', 'Australia'])).toEqual(['UK', 'Canada', 'Australia']);
  });
});

describe('buildTimeline', () => {
  const now = new Date('2026-10-05T00:00:00Z').getTime();

  it('marks earlier steps done, the current one current and later ones upcoming', () => {
    const [t] = buildTimeline([{ _id: 'a1', status: 'offer_received', submittedDate: '2026-09-01', statusChangedAt: '2026-10-01T00:00:00Z', intake: 'January 2027', universityName: 'U', courseName: 'C' }], now);
    expect(t.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(t.daysInStage).toBe(4);
    expect(t.daysToIntake).toBeGreaterThan(80);
    expect(t.next).toMatch(/accept/i);
  });

  it('handles a rejected application and a draft', () => {
    const [rej, draft] = buildTimeline([{ _id: 'r', status: 'rejected' }, { _id: 'd', status: 'draft' }], now);
    expect(rej.rejected).toBe(true);
    expect(rej.steps.every((s) => s.state === 'upcoming')).toBe(true);
    expect(draft.steps.every((s) => s.state === 'upcoming')).toBe(true);
    expect(draft.next).toMatch(/submit/i);
  });

  it('flags an intake that has already passed', () => {
    const [t] = buildTimeline([{ _id: 'p', status: 'submitted', intake: '2026-01-01' }], now);
    expect(t.intakePassed).toBe(true);
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `progress-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `P ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('student progress routes', () => {
  it("gives a student their own checklist, including their preferred country's extra documents", async () => {
    await Country.create({ name: 'Testland', visa: { documents: ['Police clearance certificate'] } });
    const student = await mk('student', { preferredCountries: ['Testland'] });
    const res = await request(app).get('/api/students/me/checklist').set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.countries).toEqual(['Testland']);
    expect(res.body.items.some((i) => i.label === 'Police clearance certificate' && i.scope === 'Testland')).toBe(true);
  });

  it("gives a student their application timeline, and keeps other students' data out", async () => {
    const student = await mk('student');
    await User.findByIdAndUpdate(student.id, { $push: { applications: { universityName: 'Mine Uni', courseName: 'CS', status: 'under_review' } } });
    const res = await request(app).get('/api/students/me/timeline').set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.applications).toHaveLength(1);
    expect(res.body.applications[0].universityName).toBe('Mine Uni');
  });

  it('lets an admin see a student checklist but not a student see anyone elses', async () => {
    const admin = await mk('admin');
    const a = await mk('student');
    const b = await mk('student');
    expect((await request(app).get(`/api/students/${a.id}/checklist`).set(as(admin))).status).toBe(200);
    expect((await request(app).get(`/api/students/${b.id}/checklist`).set(as(a))).status).toBe(403);
    expect((await request(app).get('/api/students/me/checklist').set(as(admin))).status).toBe(403);
  });
});
