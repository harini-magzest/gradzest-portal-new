const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const { runEventReminderCheck } = require('../jobs/eventReminders');

let n = 0;
async function mk(role, extra = {}) {
  const email = `evt-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `E ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
const create = (staff, over = {}) => request(app).post('/api/events').set(as(staff)).send({ title: 'Study in the UK', startsAt: inDays(3), link: 'https://zoom.us/j/1', ...over });

describe('managing events', () => {
  it('lets staff create, edit and delete their own events; students cannot', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    expect((await create(student)).status).toBe(403);

    const made = await create(counselor, { description: 'Q&A', capacity: 50, durationMin: 90 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ title: 'Study in the UK', capacity: 50, durationMin: 90, canManage: true, registeredCount: 0, spotsLeft: 50 });

    const edited = await request(app).put(`/api/events/${made.body.id}`).set(as(counselor)).send({ title: 'Study in the UK 2026' });
    expect(edited.body.title).toBe('Study in the UK 2026');

    const other = await mk('counselor');
    expect((await request(app).put(`/api/events/${made.body.id}`).set(as(other)).send({ title: 'x' })).status).toBe(403);
    expect((await request(app).delete(`/api/events/${made.body.id}`).set(as(other))).status).toBe(403);
    const admin = await mk('admin');
    expect((await request(app).delete(`/api/events/${made.body.id}`).set(as(admin))).status).toBe(200);
  });

  it('validates what it is given', async () => {
    const admin = await mk('admin');
    for (const bad of [{ title: '' }, { startsAt: 'soon' }, { durationMin: 2 }, { capacity: -1 }, { capacity: 1.5 }, { link: 'ftp://example.com/x' }]) {
      const res = await create(admin, bad);
      expect(res.status).toBe(400);
    }
    expect((await request(app).put('/api/events/not-an-id').set(as(admin)).send({})).status).toBe(404);
  });
});

describe('registering', () => {
  it('registers a student once, shows them the join link, and lets them cancel', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    const other = await mk('student');
    const { body: ev } = await create(admin);

    let list = await request(app).get('/api/events').set(as(student));
    expect(list.body.find((e) => e.id === ev.id)).toMatchObject({ registered: false, link: '' }); // link hidden until registered

    const reg = await request(app).post(`/api/events/${ev.id}/register`).set(as(student));
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ registered: true, registeredCount: 1, link: 'https://zoom.us/j/1' });
    expect((await request(app).post(`/api/events/${ev.id}/register`).set(as(student))).status).toBe(200); // idempotent
    expect((await Event.findById(ev.id)).registrations).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: student.id, type: 'event' })).toBe(1);

    list = await request(app).get('/api/events').set(as(other));
    expect(list.body.find((e) => e.id === ev.id)).toMatchObject({ registered: false, registeredCount: 1, link: '' });
    expect(JSON.stringify(list.body)).not.toContain(student.email); // other people's details never leak

    const gone = await request(app).delete(`/api/events/${ev.id}/register`).set(as(student));
    expect(gone.body).toMatchObject({ registered: false, registeredCount: 0 });
  });

  it('never lets more people in than the capacity, even all at once', async () => {
    const admin = await mk('admin');
    const { body: ev } = await create(admin, { capacity: 2 });
    const students = await Promise.all([mk('student'), mk('student'), mk('student'), mk('student')]);
    const results = await Promise.all(students.map((s) => request(app).post(`/api/events/${ev.id}/register`).set(as(s))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(results.find((r) => r.status === 409).body.message).toMatch(/full/i);
    expect((await Event.findById(ev.id)).registrations).toHaveLength(2);
  });

  it('refuses cancelled and already-started events, and non-students', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    const { body: cancelled } = await create(admin);
    await request(app).put(`/api/events/${cancelled.id}`).set(as(admin)).send({ status: 'cancelled' });
    expect((await request(app).post(`/api/events/${cancelled.id}/register`).set(as(student))).body.message).toMatch(/cancelled/i);

    const { body: past } = await create(admin);
    await Event.updateOne({ _id: past.id }, { startsAt: new Date(Date.now() - 3600000) });
    expect((await request(app).post(`/api/events/${past.id}/register`).set(as(student))).body.message).toMatch(/already started/i);

    const { body: open } = await create(admin);
    expect((await request(app).post(`/api/events/${open.id}/register`).set(as(admin))).status).toBe(403);
  });

  it('hides cancelled events from students, and tells registrants when one is cancelled', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    const { body: ev } = await create(admin);
    await request(app).post(`/api/events/${ev.id}/register`).set(as(student));
    await request(app).put(`/api/events/${ev.id}`).set(as(admin)).send({ status: 'cancelled' });
    expect((await request(app).get('/api/events').set(as(student))).body.some((e) => e.id === ev.id)).toBe(false);
    expect((await request(app).get('/api/events').set(as(admin))).body.some((e) => e.id === ev.id)).toBe(true);
    expect(await Notification.countDocuments({ userId: student.id, title: /was cancelled/ })).toBe(1);
  });
});

describe('registrations list and calendar file', () => {
  it('gives the organiser the list and a CSV, and keeps students out', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    const { body: ev } = await create(counselor);
    await request(app).post(`/api/events/${ev.id}/register`).set(as(student));

    const list = await request(app).get(`/api/events/${ev.id}/registrations`).set(as(counselor));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].email).toBe(student.email);
    const csv = await request(app).get(`/api/events/${ev.id}/registrations?format=csv`).set(as(counselor));
    expect(csv.text.split('\r\n')[0]).toBe('Name,Email,Registered at');
    expect((await request(app).get(`/api/events/${ev.id}/registrations`).set(as(student))).status).toBe(403);
    expect((await request(app).get(`/api/events/${ev.id}/registrations`).set(as(await mk('counselor')))).status).toBe(403);
  });

  it('serves an .ics with the absolute start time', async () => {
    const admin = await mk('admin');
    const { body: ev } = await create(admin, { startsAt: '2030-01-15T10:00:00Z', durationMin: 30 });
    const res = await request(app).get(`/api/events/${ev.id}/ics`).set(as(admin));
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.text).toContain('DTSTART:20300115T100000Z');
    expect(res.text).toContain('DTEND:20300115T103000Z');
  });
});

describe('event reminders', () => {
  it('reminds registrants once per window, honouring the email preference', async () => {
    const admin = await mk('admin');
    const on = await mk('student');
    const off = await mk('student', { notificationPrefs: { email: false } });
    const { body: ev } = await create(admin, { startsAt: new Date(Date.now() + 20 * 3600000).toISOString() }); // inside the 24h window
    for (const s of [on, off]) await request(app).post(`/api/events/${ev.id}/register`).set(as(s));

    const sent = [];
    const mailer = { sendMail: async (m) => { sent.push(m.to); } };
    await runEventReminderCheck(null, null, mailer);
    await runEventReminderCheck(null, null, mailer); // a second run must not repeat it
    expect(sent.filter((t) => t === on.email)).toHaveLength(1);
    expect(sent).not.toContain(off.email);
    expect(await Notification.countDocuments({ userId: off.id, title: /Event tomorrow/ })).toBe(1);
    expect((await Event.findById(ev.id)).remindersSent).toEqual(['24h']);
  });

  it('sends the reminders again if the start time is moved', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    const { body: ev } = await create(admin, { startsAt: new Date(Date.now() + 20 * 3600000).toISOString() });
    await request(app).post(`/api/events/${ev.id}/register`).set(as(student));
    await runEventReminderCheck(null, null, null);
    expect((await Event.findById(ev.id)).remindersSent).toEqual(['24h']);
    await request(app).put(`/api/events/${ev.id}`).set(as(admin)).send({ startsAt: new Date(Date.now() + 10 * 3600000).toISOString() });
    expect((await Event.findById(ev.id)).remindersSent).toEqual([]);
  });
});
