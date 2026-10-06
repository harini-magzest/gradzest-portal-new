const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const { toWhatsAppNumber, sendWhatsApp } = require('../lib/whatsapp');
const { wantsEmail, wantsWhatsApp, sendExtraChannels } = require('../lib/notificationChannels');
const { runDeadlineCheck } = require('../jobs/deadlineReminders');
const { runMeetingReminderCheck } = require('../jobs/meetingReminders');

describe('toWhatsAppNumber', () => {
  it('normalises the formats people actually type', () => {
    expect(toWhatsAppNumber('+91 98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('09876543210')).toBe('919876543210');
    expect(toWhatsAppNumber('9876543210')).toBe('919876543210');
    expect(toWhatsAppNumber('0091 9876543210')).toBe('919876543210');
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
  });
  it('rejects empty and implausible numbers', () => {
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('abc')).toBeNull();
    expect(toWhatsAppNumber('+12')).toBeNull();
  });
});

describe('sendWhatsApp', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  const ok = () => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; } }; };

  it('does nothing when it is not configured', async () => {
    const f = ok();
    expect(await sendWhatsApp('9876543210', 'hi', f.fetch)).toEqual({ sent: false, reason: 'not_configured' });
    expect(f.calls).toHaveLength(0);
  });

  it('sends plain text without a template', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    const f = ok();
    expect(await sendWhatsApp('9876543210', 'Intake in 7 days', f.fetch)).toEqual({ sent: true });
    expect(f.calls[0].url).toBe('https://graph.facebook.com/v19.0/123/messages');
    expect(f.calls[0].init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(f.calls[0].init.body)).toMatchObject({ to: '919876543210', type: 'text', text: { body: 'Intake in 7 days' } });
  });

  it('sends through the approved template, flattening newlines into the one variable', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_TEMPLATE_NAME = 'gradzest_reminder';
    const f = ok();
    await sendWhatsApp('9876543210', 'Line one\n\nLine two', f.fetch);
    const body = JSON.parse(f.calls[0].init.body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('gradzest_reminder');
    expect(body.template.components[0].parameters[0].text).toBe('Line one Line two');
  });

  it('reports a failed or unreachable API instead of throwing', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    expect(await sendWhatsApp('9876543210', 'x', async () => ({ ok: false, status: 401 }))).toEqual({ sent: false, reason: 'http_401' });
    expect(await sendWhatsApp('9876543210', 'x', async () => { throw new Error('down'); })).toEqual({ sent: false, reason: 'network' });
    expect(await sendWhatsApp('nope', 'x', async () => ({ ok: true }))).toEqual({ sent: false, reason: 'bad_number' });
  });
});

describe('channel preferences', () => {
  it('defaults to email on and WhatsApp off', () => {
    expect(wantsEmail({})).toBe(true);
    expect(wantsEmail({ notificationPrefs: { email: false } })).toBe(false);
    expect(wantsWhatsApp({ phone: '1' })).toBe(false);
    expect(wantsWhatsApp({ phone: '1', notificationPrefs: { whatsapp: true } })).toBe(true);
    expect(wantsWhatsApp({ notificationPrefs: { whatsapp: true } })).toBe(false); // no phone number
  });

  it('only messages WhatsApp for people who opted in, and never throws', async () => {
    const env = { ...process.env };
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    const sent = [];
    const send = async (phone, text) => { sent.push([phone, text]); return { sent: true }; };
    expect(await sendExtraChannels({ phone: '1' }, 'hi', send)).toEqual({ whatsapp: false });
    expect(await sendExtraChannels({ phone: '9876543210', notificationPrefs: { whatsapp: true } }, 'hi', send)).toEqual({ whatsapp: true });
    expect(sent).toEqual([['9876543210', 'hi']]);
    expect(await sendExtraChannels({ phone: '1', notificationPrefs: { whatsapp: true } }, 'hi', async () => { throw new Error('x'); })).toEqual({ whatsapp: false });
    process.env = env;
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `notif-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `N ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('notification preferences endpoints', () => {
  it('reads and updates the signed-in user own preferences', async () => {
    const u = await mk('student', { phone: '9876543210' });
    let res = await request(app).get('/api/notifications/preferences').set(as(u));
    expect(res.body).toMatchObject({ email: true, whatsapp: false, hasPhone: true });

    res = await request(app).put('/api/notifications/preferences').set(as(u)).send({ email: false, whatsapp: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: false, whatsapp: true });
    expect((await User.findById(u.id).lean()).notificationPrefs).toMatchObject({ email: false, whatsapp: true });
  });

  it('warns when WhatsApp is switched on with no phone number, and rejects bad input', async () => {
    const u = await mk('student', { phone: '' });
    const res = await request(app).put('/api/notifications/preferences').set(as(u)).send({ whatsapp: true });
    expect(res.body.warning).toMatch(/phone number/i);
    expect((await request(app).put('/api/notifications/preferences').set(as(u)).send({ email: 'yes' })).status).toBe(400);
    expect((await request(app).put('/api/notifications/preferences').set(as(u)).send({})).status).toBe(400);
    expect((await request(app).get('/api/notifications/preferences')).status).toBe(401);
  });
});

describe('reminder jobs respect the preferences', () => {
  const mailer = () => { const sent = []; return { sent, sendMail: async (m) => { sent.push(m.to); } }; };

  it('skips the deadline email for someone who turned email off, but still notifies in-app', async () => {
    const intake = new Date(Date.now() + 7 * 86400000);
    const intakeStr = `${intake.getFullYear()}-${String(intake.getMonth() + 1).padStart(2, '0')}-${String(intake.getDate()).padStart(2, '0')}`;
    const app1 = { universityName: 'U', courseName: 'C', status: 'submitted', intake: intakeStr };
    const on = await mk('student', { applications: [app1] });
    const off = await mk('student', { applications: [app1], notificationPrefs: { email: false } });

    const m = mailer();
    await runDeadlineCheck(null, null, m);
    expect(m.sent).toContain(on.email);
    expect(m.sent).not.toContain(off.email);
    expect(await Notification.countDocuments({ userId: off.id, type: 'deadline' })).toBe(1);
  });

  it('skips the meeting email for someone who turned email off', async () => {
    const soon = new Date(Date.now() + 30 * 60000);
    const pad = (x) => String(x).padStart(2, '0');
    const date = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
    const time = `${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
    const on = await mk('student');
    const off = await mk('student', { notificationPrefs: { email: false } });
    await Meeting.create({
      title: 'Prefs meeting', scheduledDate: date, scheduledTime: time, status: 'scheduled',
      participants: [{ userId: on.id, name: 'On', role: 'student' }, { userId: off.id, name: 'Off', role: 'student' }],
    });

    const m = mailer();
    await runMeetingReminderCheck(null, null, m);
    expect(m.sent).toContain(on.email);
    expect(m.sent).not.toContain(off.email);
  });
});
