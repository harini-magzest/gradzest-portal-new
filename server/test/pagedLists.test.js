// Paged admin lists (lib/paging.js, lib/adminLists.js, GET /api/meetings). Without ?page the lists answer exactly as
// before; with it, one page filtered and sorted in the database. Each page used to filter and sort in the browser: the
// `oracle` functions below are that browser code, run on the whole list, and every paged answer must agree with them.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const Subscriber = require('../models/Subscriber');
const Meeting = require('../models/Meeting');

const PASSWORD = 'TestPass123!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
let n = 0;
async function signedIn(role, extra = {}) {
  const email = `paged-${role}-${Date.now()}-${n++}@example.com`;
  await User.create({ name: `Paged ${role}`, email, password: HASH, role, emailVerified: true, active: true, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: res.body.token, id: String(res.body.user.id) };
}
const get = (who, url) => request(app).get(url).set('Authorization', `Bearer ${who.token}`);
const ids = (list) => list.map((x) => String(x.id || x._id));

let admin, appTeam, counselorA, counselorB;
beforeAll(async () => {
  admin = await signedIn('admin');
  appTeam = await signedIn('admin', { isAppTeam: true });
  counselorA = await signedIn('counselor');
  counselorB = await signedIn('counselor');

  // 40 students covering every filter, including stored records that lack defaulted fields
  const statuses = ['counseling', 'inactive', 'enrolled', 'application', 'visa_process'];
  const stages = ['new_enquiry', 'interested', 'counselling', 'dnd', undefined];
  const countries = [['UK'], ['Canada', 'UK'], ['Australia'], [], ['Germany']];
  const people = [];
  for (let i = 0; i < 40; i += 1) {
    people.push({
      name: i % 7 === 0 ? `Ravi Kumar ${i}` : `Student ${String(i).padStart(2, '0')}`,
      email: `paged-student-${i}-${Date.now()}@example.com`, password: HASH, role: 'student',
      phone: i % 5 === 0 ? `98765${String(i).padStart(5, '0')}` : '',
      status: statuses[i % 5], leadStage: stages[i % 5], preferredCountries: countries[i % 5],
      counselorId: i % 3 === 0 ? counselorA.id : i % 3 === 1 ? counselorB.id : (i % 2 ? '' : undefined),
      leadStatus: i % 4 === 0 ? 'new' : i % 4 === 1 ? 'contacted' : undefined,
      joinedDate: i % 9 === 4 ? undefined : `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      applications: Array.from({ length: i % 4 }, (_, k) => ({
        universityName: k === 1 ? 'University of Leeds' : `Uni ${i}-${k}`, courseName: k === 2 ? 'MSc Data Science' : 'MBA',
        status: ['submitted', 'under_review', 'offer_received', 'rejected'][(i + k) % 4],
        submittedDate: `2025-0${(k % 9) + 1}-1${k}`, updatedDate: (i + k) % 3 ? `2025-06-${String((i % 27) + 1).padStart(2, '0')}T10:00:00.000Z` : undefined,
      })),
    });
  }
  const created = await User.insertMany(people);
  // Records written before a field had a default: no status on the student, none on one application
  await User.collection.updateOne({ _id: created[5]._id }, { $unset: { status: '' } });
  await User.collection.updateOne({ _id: created[3]._id }, { $unset: { 'applications.0.status': '' } });

  const subs = [];
  for (let i = 0; i < 30; i += 1) {
    subs.push({
      name: i % 6 === 0 ? `Priya ${i}` : `Visitor ${i}`, email: `paged-sub-${i}-${Date.now()}@example.com`,
      phone: i % 3 ? `9000000${String(i).padStart(3, '0')}` : '', notes: i === 7 ? 'asked about Leeds' : '',
      leadStatus: ['new', 'contacted', 'interested', 'converted', 'not_interested'][i % 5],
      subscribedAt: new Date(Date.now() - i * 2 * 86400000),
    });
  }
  const savedSubs = await Subscriber.insertMany(subs);
  await Subscriber.collection.updateOne({ _id: savedSubs[10]._id }, { $unset: { leadStatus: '' } });
  // This admin opened the list 9 days ago
  await User.updateOne({ _id: admin.id }, { subscribersSeenAt: new Date(Date.now() - 9 * 86400000) });

  const meetings = [];
  for (let i = 0; i < 24; i += 1) {
    meetings.push({
      title: i % 5 === 0 ? `Visa briefing ${i}` : `Check-in ${i}`,
      scheduledDate: `2026-10-${String(1 + i).padStart(2, '0')}`, scheduledTime: i % 2 ? '09:30' : '16:00',
      participants: [{ userId: i % 2 ? counselorA.id : counselorB.id, name: i % 4 === 0 ? 'Asha Menon' : 'Someone', role: 'counselor' }],
    });
  }
  await Meeting.insertMany(meetings);
});

/* ── The browser code each page ran on the whole list ─────────────────────────────────────────────────────────── */

const LEAD_STAGES = User.schema.path('leadStage').enumValues;
const stageOf = (s) => (LEAD_STAGES.includes(s.leadStage) ? s.leadStage : 'new_enquiry');

function oracleStudents(all, f) {
  return all.filter((s) => {
    if (f.lead === 'new' && s.leadStatus !== 'new') return false;
    if (f.status && s.status !== f.status) return false;
    if (f.stage && stageOf(s) !== f.stage) return false;
    if (f.country && !(s.preferredCountries || []).includes(f.country)) return false;
    if (f.counselorId) {
      if (f.counselorId === 'unassigned') { if (s.counselorId) return false; } else if (s.counselorId?.toString() !== f.counselorId) return false;
    }
    const jd = (s.joinedDate || '').slice(0, 10);
    if (f.from && jd < f.from) return false;
    if (f.to && jd > f.to) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!s.name?.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q) && !s.phone?.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.joinedDate || b.createdAt || 0).getTime() - new Date(a.joinedDate || a.createdAt || 0).getTime());
}

function oracleApplications(all, f) {
  const q = (f.q || '').toLowerCase();
  return all.filter((a) => (!q || a.studentName?.toLowerCase().includes(q) || a.universityName?.toLowerCase().includes(q)
    || a.courseName?.toLowerCase().includes(q) || a.studentEmail?.toLowerCase().includes(q))
    && (!f.status || a.status === f.status))
    .sort((a, b) => new Date(b.updatedDate || b.updatedAt || b.submittedDate || b.createdAt || 0).getTime()
      - new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime());
}

function oracleSubscribers(all, f) {
  const q = (f.q || '').toLowerCase();
  return all.filter((s) => (s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q)
    || s.notes?.toLowerCase().includes(q))
    && (!f.leadStatus || (s.leadStatus || 'new') === f.leadStatus)
    && (!f.days || new Date(s.subscribedAt).getTime() >= Date.now() - Number(f.days) * 86400000));
}

// Records that sort equal came back in whatever order the database used, so only the order of the sort keys is fixed.
// The server breaks ties by id, so paging is stable: every record on exactly one page.
const studentKey = (s) => new Date(s.joinedDate || s.createdAt || 0).getTime();
const applicationKey = (a) => new Date(a.updatedDate || a.updatedAt || a.submittedDate || a.createdAt || 0).getTime();
function expectSameOrder(items, expected, key) {
  expect(items.map(key)).toEqual(expected.map(key));
  expect(ids(items).sort()).toEqual(ids(expected).sort());
  expect(new Set(ids(items)).size).toBe(items.length);
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined)).toString();

// Pages through a paged list and returns every item, in order
async function allPages(who, path, filters, limit = 7) {
  const out = [];
  for (let page = 1; page < 100; page += 1) {
    const res = await get(who, `${path}?${qs({ ...filters, page, limit })}`);
    expect(res.status).toBe(200);
    out.push(...res.body.items);
    if (page * limit >= res.body.total) return { items: out, total: res.body.total, first: res.body };
  }
  throw new Error('too many pages');
}

/* ── Students ──────────────────────────────────────────────────────────────────────────────────────────────────── */

describe('GET /api/admin/students', () => {
  it('without ?page still answers the whole list, as every other page expects', async () => {
    const res = await get(admin, '/api/admin/students');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(await User.countDocuments({ role: 'student' }));
    expect(res.body[0]).not.toHaveProperty('password');
  });

  const cases = [
    {}, { q: 'ravi' }, { q: '98765' }, { status: 'inactive' }, { status: 'counseling' }, { stage: 'new_enquiry' },
    { stage: 'dnd' }, { country: 'UK' }, { counselorId: 'unassigned' }, { lead: 'new' },
    { from: '2025-03-01', to: '2025-08-31' }, { to: '2025-05-31' }, { status: 'enrolled', country: 'Australia', q: 'student' },
  ];
  it.each(cases)('pages match the old in-browser filter and order: %o', async (filters) => {
    const whole = (await get(admin, '/api/admin/students')).body;
    const expected = oracleStudents(whole, filters);
    const { items, total } = await allPages(admin, '/api/admin/students', filters);
    expect(total).toBe(expected.length);
    expectSameOrder(items, expected, studentKey);
    // a paged item is the same object the whole list returns
    const byId = new Map(whole.map((s) => [s.id, s]));
    for (const s of items) expect(s).toEqual(byId.get(s.id));
  });

  it('filters by one counselor', async () => {
    const whole = (await get(admin, '/api/admin/students')).body;
    const { items } = await allPages(admin, '/api/admin/students', { counselorId: counselorA.id });
    expectSameOrder(items, oracleStudents(whole, { counselorId: counselorA.id }), studentKey);
    expect(items.length).toBeGreaterThan(0);
  });

  it('carries the counts and country list the page shows, over every student', async () => {
    const whole = (await get(admin, '/api/admin/students')).body;
    const res = await get(admin, '/api/admin/students?page=1&limit=5&status=enrolled');
    expect(res.body.counts).toEqual({
      total: whole.length,
      active: whole.filter((s) => !['enrolled', 'inactive'].includes(s.status)).length,
      inactive: whole.filter((s) => s.status === 'inactive').length,
      enrolled: whole.filter((s) => s.status === 'enrolled').length,
      unassigned: whole.filter((s) => !s.counselorId).length,
      newLeads: whole.filter((s) => s.leadStatus === 'new').length,
    });
    expect(res.body.countries).toEqual([...new Set(whole.flatMap((s) => s.preferredCountries || []))].filter(Boolean).sort());
    expect(res.body).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.items).toHaveLength(5);
  });

  it('?view=ids and ?view=export cover every match, in list order', async () => {
    const whole = (await get(admin, '/api/admin/students')).body;
    const expected = oracleStudents(whole, { country: 'UK' });
    const paged = ids((await allPages(admin, '/api/admin/students', { country: 'UK' })).items);
    expect(ids(expected).sort()).toEqual([...paged].sort());
    expect((await get(admin, '/api/admin/students?view=ids&country=UK')).body.ids).toEqual(paged);
    const exp = (await get(admin, '/api/admin/students?view=export&country=UK')).body.items;
    expect(ids(exp)).toEqual(paged);
    expect(Object.keys(exp[0]).sort()).toEqual(expect.arrayContaining(['id', 'name', 'email']));
    expect(exp[0]).not.toHaveProperty('password');
    expect(exp[0]).not.toHaveProperty('applications');
  });

  it('caps the page size, answers an empty page past the end, and refuses malformed paging', async () => {
    expect((await get(admin, '/api/admin/students?limit=999')).body.limit).toBe(200);
    const past = await get(admin, '/api/admin/students?page=999&limit=10');
    expect(past.body.items).toEqual([]);
    expect(past.body.total).toBeGreaterThan(0);
    for (const bad of ['page=abc', 'limit=-1', 'counselorId=nope', 'from=yesterday', 'view=all', 'q=' + 'x'.repeat(101)]) {
      expect((await get(admin, `/api/admin/students?${bad}`)).status).toBe(400);
    }
  });

  it('treats search text literally', async () => {
    const res = await get(admin, `/api/admin/students?page=1&q=${encodeURIComponent('.*')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('is still for admins only', async () => {
    expect((await get(counselorA, '/api/admin/students?page=1')).status).toBe(403);
    expect((await get(counselorA, '/api/admin/students?view=ids')).status).toBe(403);
  });
});

/* ── Applications ──────────────────────────────────────────────────────────────────────────────────────────────── */

describe('GET /api/admin/applications', () => {
  it('without ?page still answers every application', async () => {
    const res = await get(admin, '/api/admin/applications');
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(30);
  });

  it.each([{}, { status: 'rejected' }, { status: 'submitted' }, { q: 'leeds' }, { q: 'data science' }, { q: 'ravi', status: 'under_review' }])(
    'pages match the old in-browser filter and order: %o', async (filters) => {
      const whole = (await get(admin, '/api/admin/applications')).body;
      const expected = oracleApplications(whole, filters);
      const { items, total, first } = await allPages(admin, '/api/admin/applications', filters);
      expect(total).toBe(expected.length);
      expectSameOrder(items, expected, applicationKey);
      const byId = new Map(whole.map((a) => [String(a._id), a]));
      for (const a of items) expect(a).toEqual(byId.get(String(a._id)));
      // counts by status are over every application, whatever the filter
      const counts = {};
      for (const a of whole) counts[a.status] = (counts[a.status] || 0) + 1;
      expect(first.statusCounts).toEqual(counts);
    });

  it('an application stored without a status counts and filters as "submitted", as it shows', async () => {
    const whole = (await get(admin, '/api/admin/applications')).body;
    const { items } = await allPages(admin, '/api/admin/applications', { status: 'submitted' });
    expect(items.length).toBe(whole.filter((a) => a.status === 'submitted').length);
  });

  it('?view=studentIds lists each student once, in list order; ?view=export has the export columns', async () => {
    const whole = (await get(admin, '/api/admin/applications')).body;
    const expected = oracleApplications(whole, { q: 'leeds' });
    const paged = (await allPages(admin, '/api/admin/applications', { q: 'leeds' })).items;
    expectSameOrder(paged, expected, applicationKey);
    expect((await get(admin, '/api/admin/applications?view=studentIds&q=leeds')).body.ids)
      .toEqual([...new Set(paged.map((a) => String(a.studentId)))]);
    const exp = (await get(admin, '/api/admin/applications?view=export&q=leeds')).body.items;
    expect(exp).toEqual(paged.map((a) => ({
      studentName: a.studentName, studentEmail: a.studentEmail, studentNationality: a.studentNationality, status: a.status,
      universityName: a.universityName, courseName: a.courseName, intake: a.intake, submittedDate: a.submittedDate,
      updatedDate: a.updatedDate, notes: a.notes,
    })).map((r) => JSON.parse(JSON.stringify(r))));
  });

  it('is still for admins only', async () => {
    expect((await get(counselorA, '/api/admin/applications?page=1')).status).toBe(403);
  });
});

/* ── Subscribers ───────────────────────────────────────────────────────────────────────────────────────────────── */

describe('GET /api/admin/subscribers', () => {
  it('without ?page still answers every subscriber, newest first', async () => {
    const res = await get(admin, '/api/admin/subscribers');
    expect(res.body).toHaveLength(30);
  });

  it.each([{}, { q: 'priya' }, { q: 'leeds' }, { leadStatus: 'new' }, { leadStatus: 'converted' }, { days: '7' }, { days: '30', q: 'visitor' }])(
    'pages match the old in-browser filter: %o', async (filters) => {
      const whole = (await get(admin, '/api/admin/subscribers')).body;
      const expected = oracleSubscribers(whole, filters);
      const { items, total } = await allPages(admin, '/api/admin/subscribers', filters);
      expect(total).toBe(expected.length);
      expect(ids(items)).toEqual(ids(expected));
      const byId = new Map(whole.map((s) => [s._id, s]));
      for (const s of items) expect(s).toEqual(byId.get(s._id));
    });

  it('carries the tiles: total, this week, with a phone, unread since this admin last looked, and counts by status', async () => {
    const whole = (await get(admin, '/api/admin/subscribers')).body;
    const weekStart = new Date(Date.now() - 7 * 86400000);
    const res = await get(admin, `/api/admin/subscribers?page=1&weekStart=${encodeURIComponent(weekStart.toISOString())}`);
    const seenAt = Date.now() - 9 * 86400000;
    expect(res.body.stats).toMatchObject({
      total: 30,
      thisWeek: whole.filter((s) => new Date(s.subscribedAt) >= weekStart).length,
      withPhone: whole.filter((s) => s.phone).length,
    });
    expect(res.body.stats.unread).toBe(whole.filter((s) => new Date(s.subscribedAt).getTime() > seenAt).length);
    const counts = {};
    for (const s of whole) counts[s.leadStatus || 'new'] = (counts[s.leadStatus || 'new'] || 0) + 1;
    expect(res.body.statusCounts).toEqual(counts);
  });

  it('?view=export has every match; the App Team still cannot see subscribers', async () => {
    const exp = (await get(admin, '/api/admin/subscribers?view=export&leadStatus=new')).body.items;
    expect(exp.length).toBe(oracleSubscribers((await get(admin, '/api/admin/subscribers')).body, { leadStatus: 'new' }).length);
    expect((await get(appTeam, '/api/admin/subscribers?page=1')).status).toBe(403);
    expect((await get(admin, '/api/admin/subscribers?days=3')).status).toBe(400);
  });
});

/* ── Meetings ──────────────────────────────────────────────────────────────────────────────────────────────────── */

describe('GET /api/meetings', () => {
  const now = '2026-10-12T12:00';
  const isFuture = (m) => `${m.scheduledDate}T${m.scheduledTime}` > now;

  it('without ?page still answers the whole list, soonest first', async () => {
    const res = await get(admin, '/api/meetings');
    expect(res.body).toHaveLength(24);
  });

  it.each([['upcoming', ''], ['past', ''], ['upcoming', 'asha'], ['past', 'visa']])('pages a tab (%s, search "%s")', async (when, q) => {
    const whole = (await get(admin, '/api/meetings')).body;
    // the page showed upcoming meetings soonest first and past ones latest first
    const at = (m) => new Date(`${m.scheduledDate}T${m.scheduledTime}`).getTime();
    const expected = whole.filter((m) => (when === 'upcoming') === isFuture(m))
      .filter((m) => !q || m.title.toLowerCase().includes(q) || m.participants.some((p) => p.name.toLowerCase().includes(q)))
      .sort((a, b) => (when === 'upcoming' ? at(a) - at(b) : at(b) - at(a)));
    const { items, total, first } = await allPages(admin, '/api/meetings', { when, now, q: q || undefined }, 5);
    expect(total).toBe(expected.length);
    expect(ids(items)).toEqual(ids(expected));
    expect(first.upcoming).toBe(whole.filter(isFuture).length);
    expect(first.past).toBe(whole.length - first.upcoming);
  });

  it('a counselor pages through only their own meetings', async () => {
    const own = (await get(counselorA, '/api/meetings')).body;
    const { items } = await allPages(counselorA, '/api/meetings', {}, 5);
    expect(ids(items)).toEqual(ids(own));
    expect(items.every((m) => m.participants.some((p) => p.userId === counselorA.id))).toBe(true);
  });

  it('refuses a malformed clock', async () => {
    expect((await get(admin, '/api/meetings?page=1&now=tomorrow')).status).toBe(400);
  });
});

afterAll(async () => { await mongoose.connection.db.collection('subscribers').deleteMany({ email: /^paged-sub-/ }); });
