const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');
const { summarise, compare } = require('../lib/universityCompare');

const uni = (over) => ({
  id: 'u1', name: 'Alpha University', country: 'UK', ranking: 50, rating: 4.2, acceptanceRate: 40,
  averageFees: { undergraduate: 20000, postgraduate: 25000, currency: 'GBP' },
  courses: [{ name: 'CS', tuitionFee: 18000, intake: ['September', 'January'], scholarshipAvailable: true }, { name: 'Law', tuitionFee: 22000, intake: ['September'] }],
  scholarships: [{ name: 'Merit' }],
  applicationDeadlines: [{ intake: 'September', deadline: '2099-06-01' }, { intake: 'January', deadline: '2001-01-01' }],
  ...over,
});

describe('summarise', () => {
  it('boils a university down to the comparison fields', () => {
    const s = summarise(uni());
    expect(s).toMatchObject({
      id: 'u1', currency: 'GBP', cheapestCourseFee: 18000, courseCount: 2, scholarshipCount: 2, // 1 listed + 1 course with a scholarship
      intakes: ['September', 'January'], nextDeadline: { intake: 'September', deadline: '2099-06-01' },
    });
  });
  it('copes with a sparse record', () => {
    const s = summarise({ _id: 'abc', name: 'Bare' });
    expect(s).toMatchObject({ id: 'abc', cheapestCourseFee: null, courseCount: 0, nextDeadline: null, intakes: [], ranking: null });
  });
});

describe('compare', () => {
  const a = summarise(uni({ id: 'a', ranking: 50, acceptanceRate: 40 }));
  const b = summarise(uni({ id: 'b', ranking: 20, acceptanceRate: 40, averageFees: { postgraduate: 30000 } }));

  it('picks the best of each row, lower is better for rank and fees', () => {
    const { rows } = compare([a, b]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.ranking.best).toEqual([1]);
    expect(by.postgraduateFee.best).toEqual([0]);
  });
  it('names no winner when everyone is level or there is nothing to compare against', () => {
    const { rows } = compare([a, b]);
    expect(rows.find((r) => r.key === 'acceptanceRate').best).toBeNull(); // 40 vs 40
    expect(rows.find((r) => r.key === 'undergraduateFee').best).toBeNull(); // only one university has a value
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `sl-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `SL ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('saved universities routes', () => {
  let ids;
  beforeAll(async () => {
    const tag = Date.now();
    ids = [`sl-${tag}-1`, `sl-${tag}-2`, `sl-${tag}-3`];
    await University.insertMany(ids.map((id, i) => uni({ id, name: `Uni ${i + 1}`, ranking: (i + 1) * 10 })));
  });

  it('saves, lists and removes universities, ignoring duplicates', async () => {
    const student = await mk('student');
    expect((await request(app).post('/api/students/me/saved-universities').set(as(student)).send({ universityId: ids[0] })).status).toBe(201);
    expect((await request(app).post('/api/students/me/saved-universities').set(as(student)).send({ universityId: ids[0] })).body.count).toBe(1);
    await request(app).post('/api/students/me/saved-universities').set(as(student)).send({ universityId: ids[1] });

    const list = await request(app).get('/api/students/me/saved-universities').set(as(student));
    expect(list.body.map((u) => u.id)).toEqual([ids[0], ids[1]]);
    expect(list.body[0]).toMatchObject({ name: 'Uni 1', cheapestCourseFee: 18000 });

    await request(app).delete(`/api/students/me/saved-universities/${ids[0]}`).set(as(student));
    expect((await request(app).get('/api/students/me/saved-universities').set(as(student))).body.map((u) => u.id)).toEqual([ids[1]]);
  });

  it('rejects an unknown university, a full list, and non-students', async () => {
    const student = await mk('student');
    expect((await request(app).post('/api/students/me/saved-universities').set(as(student)).send({ universityId: 'nope' })).status).toBe(404);
    expect((await request(app).post('/api/students/me/saved-universities').set(as(await mk('counselor'))).send({ universityId: ids[0] })).status).toBe(403);

    await User.findByIdAndUpdate(student.id, { savedUniversities: Array.from({ length: 20 }, (_, i) => ({ universityId: `x${i}` })) });
    const full = await request(app).post('/api/students/me/saved-universities').set(as(student)).send({ universityId: ids[0] });
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/most universities/);
  });

  it('keeps one student saved universities separate from another', async () => {
    const a = await mk('student');
    const b = await mk('student');
    await request(app).post('/api/students/me/saved-universities').set(as(a)).send({ universityId: ids[2] });
    expect((await request(app).get('/api/students/me/saved-universities').set(as(b))).body).toEqual([]);
  });
});

describe('GET /api/universities/compare', () => {
  it('compares two to four universities, and says which is best', async () => {
    const tag = Date.now();
    await University.insertMany([uni({ id: `c-${tag}-1`, name: 'First', ranking: 80 }), uni({ id: `c-${tag}-2`, name: 'Second', ranking: 10 })]);
    const res = await request(app).get(`/api/universities/compare?ids=c-${tag}-1,c-${tag}-2`);
    expect(res.status).toBe(200);
    expect(res.body.universities.map((u) => u.name)).toEqual(['First', 'Second']);
    expect(res.body.rows.find((r) => r.key === 'ranking').best).toEqual([1]);
  });

  it('validates how many and which', async () => {
    expect((await request(app).get('/api/universities/compare?ids=only-one')).status).toBe(400);
    expect((await request(app).get('/api/universities/compare?ids=a,b,c,d,e')).status).toBe(400);
    expect((await request(app).get('/api/universities/compare?ids=missing1,missing2')).status).toBe(404);
  });
});
