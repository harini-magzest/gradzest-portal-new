const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { computeSlots } = require('../lib/meetingSlots');
const { buildIcs, googleCalendarUrl } = require('../lib/ics');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The next Monday at least 3 days away, so "today" and the Sunday rule never interfere.
function nextMonday() {
  const d = new Date(Date.now() + 3 * 86400000);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return ymd(d);
}

describe('computeSlots', () => {
  const noon = new Date('2026-10-05T12:00:00'); // a Monday

  it('offers hourly slots between opening and closing', () => {
    const r = computeSlots('2026-10-06', [], noon);
    expect(r.open).toBe(true);
    expect(r.slots[0]).toEqual({ time: '09:00', available: true });
    expect(r.slots.at(-1)).toEqual({ time: '17:00', available: true });
    expect(r.slots).toHaveLength(9);
  });

  it('blocks slots that overlap an existing meeting, including long ones', () => {
    const r = computeSlots('2026-10-06', [{ scheduledTime: '10:30', duration: 90 }], noon);
    const free = Object.fromEntries(r.slots.map((s) => [s.time, s.available]));
    expect(free).toMatchObject({ '09:00': true, '10:00': false, '11:00': false, '12:00': true, '13:00': true });
  });

  it('blocks times that have already passed today', () => {
    const r = computeSlots('2026-10-05', [], noon);
    const free = Object.fromEntries(r.slots.map((s) => [s.time, s.available]));
    expect(free).toMatchObject({ '09:00': false, '12:00': false, '13:00': true });
  });

  it('is closed on Sundays, in the past, too far ahead, and for bad dates', () => {
    expect(computeSlots('2026-10-11', [], noon)).toMatchObject({ open: false, reason: 'sunday' });
    expect(computeSlots('2026-10-04', [], noon)).toMatchObject({ open: false, reason: 'past' });
    expect(computeSlots('2027-03-01', [], noon)).toMatchObject({ open: false, reason: 'too_far' });
    expect(computeSlots('tomorrow', [], noon)).toMatchObject({ open: false, reason: 'invalid_date' });
  });
});

describe('ics', () => {
  const meeting = { _id: 'abc123', title: 'Call, with; Asha', scheduledDate: '2026-10-06', scheduledTime: '10:00', duration: 45, meetingLink: 'https://meet.jit.si/x', notes: 'Bring passport\nand IELTS', status: 'scheduled' };

  it('writes a valid event in UTC, converting from India time', () => {
    const ics = buildIcs([meeting], new Date('2026-10-01T00:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:abc123@gradzest');
    expect(ics).toContain('DTSTART:20261006T043000Z'); // 10:00 IST
    expect(ics).toContain('DTEND:20261006T051500Z'); // 45 minutes later
    expect(ics).toContain('SUMMARY:Call\\, with\\; Asha');
    expect(ics).toContain('DESCRIPTION:Bring passport\\nand IELTS\\nJoin: https://meet.jit.si/x');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('cannot be made to inject extra properties through the title', () => {
    const ics = buildIcs([{ ...meeting, title: 'Hi\r\nATTENDEE:mailto:evil@example.com' }]);
    expect(ics).not.toMatch(/^ATTENDEE:/m);
  });

  it('folds long lines at 75 octets', () => {
    const ics = buildIcs([{ ...meeting, notes: 'x'.repeat(300) }]);
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it('skips a meeting with an unreadable date, and builds a Google Calendar link', () => {
    expect(buildIcs([{ ...meeting, scheduledDate: 'nope' }])).not.toContain('BEGIN:VEVENT');
    expect(googleCalendarUrl(meeting)).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Call/);
    expect(googleCalendarUrl(meeting)).toContain('dates=20261006T043000Z%2F20261006T051500Z');
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `sched-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `S ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('booking a call', () => {
  it('shows a student their counselor free slots and lets them book one, once', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { counselorId: counselor.id });
    const date = nextMonday();

    let res = await request(app).get(`/api/meetings/availability?date=${date}`).set(as(student));
    expect(res.status).toBe(200);
    expect(res.body.slots.find((s) => s.time === '10:00').available).toBe(true);

    res = await request(app).post('/api/meetings/book').set(as(student)).send({ date, time: '10:00', notes: 'Visa questions' });
    expect(res.status).toBe(201);
    expect(res.body.participants.map((p) => p.role).sort()).toEqual(['counselor', 'student']);
    expect(res.body.meetingLink).toMatch(/^https:\/\/meet\.jit\.si\//);

    res = await request(app).get(`/api/meetings/availability?date=${date}`).set(as(student));
    expect(res.body.slots.find((s) => s.time === '10:00').available).toBe(false);

    res = await request(app).post('/api/meetings/book').set(as(student)).send({ date, time: '10:00' });
    expect(res.status).toBe(409);
  });

  it('refuses a student with no counselor, and anyone but a student', async () => {
    const orphan = await mk('student', { counselorId: null }); // registration auto-assigns one, so clear it
    const counselor = await mk('counselor');
    expect((await request(app).post('/api/meetings/book').set(as(orphan)).send({ date: nextMonday(), time: '10:00' })).status).toBe(400);
    expect((await request(app).post('/api/meetings/book').set(as(counselor)).send({ date: nextMonday(), time: '10:00' })).status).toBe(403);
  });

  it('does not reveal what a counselor is busy with, and rejects a time that is not a free slot', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { counselorId: counselor.id });
    const res = await request(app).post('/api/meetings/book').set(as(student)).send({ date: nextMonday(), time: '10:17' });
    expect(res.status).toBe(409);
    const avail = await request(app).get(`/api/meetings/availability?date=${nextMonday()}`).set(as(student));
    expect(JSON.stringify(avail.body)).not.toMatch(/title|participants|Call with/);
  });
});

describe('calendar export', () => {
  it('gives a participant an .ics for their meeting and keeps others out', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { counselorId: counselor.id });
    const outsider = await mk('student');
    const date = nextMonday();
    const booked = await request(app).post('/api/meetings/book').set(as(student)).send({ date, time: '11:00' });

    const ok = await request(app).get(`/api/meetings/${booked.body._id}/ics`).set(as(student));
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/text\/calendar/);
    expect(ok.text).toContain('SUMMARY:Call with');
    expect((await request(app).get(`/api/meetings/${booked.body._id}/ics`).set(as(outsider))).status).toBe(403);
    expect((await request(app).get('/api/meetings/not-an-id/ics').set(as(student))).status).toBe(404);

    const all = await request(app).get('/api/meetings/ics').set(as(student));
    expect(all.status).toBe(200);
    expect(all.text).toContain(`${booked.body._id}@gradzest`);
    const other = await request(app).get('/api/meetings/ics').set(as(outsider));
    expect(other.text).not.toContain(`${booked.body._id}@gradzest`);
  });
});
