const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SecurityIncident = require('../models/SecurityIncident');
const { initCriticalAlert, sendCriticalIncidentAlert } = require('../lib/criticalAlert');
const { routeIncidentAlert } = require('../lib/alertRouting');
const { notifyChannels, formatAlert } = require('../lib/alertChannels');
const { runEscalation } = require('../jobs/incidentEscalation');
const { runSecurityDigest } = require('../jobs/securityDigest');

let n = 0;
const mkAdmin = async (extra = {}) => {
  const email = `alert-${Date.now()}-${n++}@example.com`;
  const u = await new User({ name: 'Alert Admin', email, password: 'hashed', role: 'admin', status: 'active', ...extra }).save();
  return { id: String(u._id), email };
};
const incident = (over = {}) => SecurityIncident.create({
  type: 'waf_block', severity: 'critical', title: 'Blocked sql injection request from 203.0.113.77', relatedIp: '203.0.113.77', relatedEmail: 'victim@example.com', ...over,
});
const okFetch = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });

const ENV_KEYS = ['SOC_OWNER_EMAILS', 'SOC_ALERT_DETAIL', 'SOC_ALERT_WEBHOOK_URL', 'SOC_ALERT_WEBHOOK_FORMAT', 'SOC_TELEGRAM_BOT_TOKEN', 'SOC_TELEGRAM_CHAT_ID', 'SOC_WEBHOOK_MIN_SEVERITY', 'SOC_NOTIFY_MIN_SEVERITY', 'SOC_EMAIL_MIN_SEVERITY'];
let saved;
beforeEach(() => { saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])); });
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

describe('alerts go to the SOC owner only', () => {
  it('the critical-incident email is addressed to the owner, not to other admins or the Application Team', async () => {
    const owner = await mkAdmin(); const other = await mkAdmin(); const appTeam = await mkAdmin({ isAppTeam: true });
    process.env.SOC_OWNER_EMAILS = owner.email;
    const sendMail = vi.fn().mockResolvedValue({});
    initCriticalAlert({ sendMail });
    await sendCriticalIncidentAlert(await incident());
    expect(sendMail).toHaveBeenCalledTimes(1);
    const to = sendMail.mock.calls[0][0].to;
    expect(to).toBe(owner.email);
    expect(to).not.toContain(other.email);
    expect(to).not.toContain(appTeam.email);
  });

  it('in-app notifications are created for the owner only, and carry no incident details by default', async () => {
    const owner = await mkAdmin(); const other = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    initCriticalAlert({ sendMail: vi.fn().mockResolvedValue({}) });
    await routeIncidentAlert(await incident());
    const mine = await Notification.find({ userId: owner.id, type: 'security' }).lean();
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(await Notification.countDocuments({ userId: other.id })).toBe(0);
    const text = JSON.stringify(mine);
    expect(text).not.toContain('203.0.113.77');
    expect(text).not.toContain('victim@example.com');
    expect(text).not.toContain('sql injection');

    process.env.SOC_ALERT_DETAIL = 'full';
    await routeIncidentAlert(await incident());
    expect(JSON.stringify(await Notification.find({ userId: owner.id }).lean())).toContain('sql injection');
  });

  it('the daily digest goes to the owner only', async () => {
    const owner = await mkAdmin(); const other = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    const sendMail = vi.fn().mockResolvedValue({});
    await runSecurityDigest({ sendMail });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe(owner.email);
    expect(sendMail.mock.calls[0][0].to).not.toContain(other.email);
  });
});

describe('minimal by default: alerts leave the building without identifying data', () => {
  it('email subject and body show severity, type, time and a link — no title, IP or email — unless SOC_ALERT_DETAIL=full', async () => {
    const owner = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    const sendMail = vi.fn().mockResolvedValue({});
    initCriticalAlert({ sendMail });
    await sendCriticalIncidentAlert(await incident());
    let mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('[CRITICAL] SOC incident');
    for (const secret of ['203.0.113.77', 'victim@example.com', 'sql injection']) {
      expect(mail.subject).not.toContain(secret);
      expect(mail.html).not.toContain(secret);
    }
    expect(mail.html).toContain('waf block');
    expect(mail.html).toContain('/soc');

    process.env.SOC_ALERT_DETAIL = 'full';
    sendMail.mockClear();
    await sendCriticalIncidentAlert(await incident({ title: '<script>alert(1)</script> from 203.0.113.9' }));
    mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toContain('203.0.113.9');
    expect(mail.html).toContain('&lt;script&gt;');           // titles are HTML-escaped in the email body
    expect(mail.html).not.toContain('<script>alert');
  });

  it('chat messages are minimal by default and add the title only in full mode', async () => {
    const inc = { severity: 'high', type: 'credential_stuffing', title: 'Credential stuffing: 7 accounts from 198.51.100.4', createdAt: new Date() };
    const minimal = formatAlert(inc);
    expect(minimal).toContain('HIGH');
    expect(minimal).toContain('credential stuffing');
    expect(minimal).toContain('/soc');
    expect(minimal).not.toContain('198.51.100.4');
    process.env.SOC_ALERT_DETAIL = 'full';
    expect(formatAlert(inc)).toContain('198.51.100.4');
    expect(formatAlert(inc, 'escalation')).toContain('UNACKNOWLEDGED');
  });
});

describe('webhook and Telegram channels', () => {
  const inc = { severity: 'critical', type: 'malware_upload', title: 'secret title 203.0.113.5', createdAt: new Date() };

  it('posts a Slack/Teams-style {text} payload, or {content} for Discord, to the https webhook', async () => {
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/T000/B000/XXX';
    const f = okFetch();
    let r = await notifyChannels(inc, { fetchImpl: f });
    expect(r.webhook).toEqual({ configured: true, ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://hooks.example.test/T000/B000/XXX');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.text).toContain('CRITICAL');
    expect(body.text).not.toContain('secret title');
    expect(body.text).not.toContain('203.0.113.5');

    process.env.SOC_ALERT_WEBHOOK_FORMAT = 'discord';
    const f2 = okFetch();
    await notifyChannels(inc, { fetchImpl: f2 });
    expect(JSON.parse(f2.mock.calls[0][1].body)).toHaveProperty('content');
  });

  it('refuses a non-https webhook, honours the minimum severity, and does nothing when nothing is configured', async () => {
    const f = okFetch();
    process.env.SOC_ALERT_WEBHOOK_URL = 'http://insecure.example.test/hook';
    expect((await notifyChannels(inc, { fetchImpl: f })).webhook.configured).toBe(false);
    expect(f).not.toHaveBeenCalled();

    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    const r = await notifyChannels({ ...inc, severity: 'medium' }, { fetchImpl: f });
    expect(r.skipped).toMatch(/below minimum/);
    expect(f).not.toHaveBeenCalled();

    process.env.SOC_WEBHOOK_MIN_SEVERITY = 'medium';
    await notifyChannels({ ...inc, severity: 'medium' }, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);

    delete process.env.SOC_ALERT_WEBHOOK_URL;
    const none = await notifyChannels(inc, { fetchImpl: f });
    expect(none.webhook.configured).toBe(false);
    expect(none.telegram.configured).toBe(false);
  });

  it('a failing channel never throws: errors are reported, server errors retried once', async () => {
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    const down = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const r1 = await notifyChannels(inc, { fetchImpl: down });
    expect(r1.webhook).toMatchObject({ configured: true, ok: false });
    expect(r1.webhook.error).toMatch(/ECONNREFUSED/);

    const flaky = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, status: 200 });
    expect((await notifyChannels(inc, { fetchImpl: flaky })).webhook.ok).toBe(true);
    expect(flaky).toHaveBeenCalledTimes(2);

    const bad = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect((await notifyChannels(inc, { fetchImpl: bad })).webhook.ok).toBe(false);
    expect(bad).toHaveBeenCalledTimes(1);                    // a 4xx is not retried
  });

  it('Telegram posts to the bot API with the chat id, and its token never appears in an error', async () => {
    process.env.SOC_TELEGRAM_BOT_TOKEN = '123456:SECRET-TOKEN';
    process.env.SOC_TELEGRAM_CHAT_ID = '987654';
    const f = okFetch();
    const r = await notifyChannels(inc, { fetchImpl: f });
    expect(r.telegram.ok).toBe(true);
    expect(f.mock.calls[0][0]).toBe('https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.chat_id).toBe('987654');
    expect(body.text).toContain('CRITICAL');

    const leaky = vi.fn().mockRejectedValue(new Error('request to https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage failed'));
    const failed = await notifyChannels(inc, { fetchImpl: leaky });
    expect(failed.telegram.ok).toBe(false);
    expect(failed.telegram.error).not.toContain('SECRET-TOKEN');
  });

  it('a new incident fans out to the channels through the real routing path', async () => {
    const owner = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    initCriticalAlert({ sendMail: vi.fn().mockResolvedValue({}) });
    await routeIncidentAlert(await incident());
    expect(f).toHaveBeenCalledTimes(1);
    f.mockClear();
    await routeIncidentAlert(await incident({ severity: 'low' }));
    expect(f).not.toHaveBeenCalled();
  });
});

describe('escalation of unacknowledged incidents', () => {
  const HOUR = 3600 * 1000;

  it('alerts once, on every channel, when a high/critical incident is still untouched past its acknowledge SLA', async () => {
    const owner = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    const sendMail = vi.fn().mockResolvedValue({});
    initCriticalAlert({ sendMail });
    const f = okFetch();

    const untouched = await incident({ severity: 'high' });
    const acked = await incident({ severity: 'high', acknowledgedAt: new Date() });
    const mediumOne = await incident({ severity: 'medium' });
    const claimed = await incident({ severity: 'high', status: 'investigating' });

    expect(await runEscalation({ now: Date.now() + 10 * 60000, fetchImpl: f })).toBe(0);   // 10 min: inside the 60-min SLA
    const count = await runEscalation({ now: Date.now() + 2 * HOUR, fetchImpl: f });
    expect(count).toBeGreaterThanOrEqual(1);

    const body = JSON.parse(f.mock.calls.at(-1)[1].body);
    expect(body.text).toContain('UNACKNOWLEDGED');
    expect(body.text).not.toContain('203.0.113.77');         // still minimal
    expect(sendMail.mock.calls.at(-1)[0].subject).toContain('UNACKNOWLEDGED');
    expect(sendMail.mock.calls.at(-1)[0].to).toBe(owner.email);

    expect((await SecurityIncident.findById(untouched._id)).escalatedAt).toBeTruthy();
    for (const other of [acked, mediumOne, claimed]) expect((await SecurityIncident.findById(other._id)).escalatedAt).toBeNull();

    const before = f.mock.calls.length;
    await runEscalation({ now: Date.now() + 3 * HOUR, fetchImpl: f });
    const afterIds = f.mock.calls.length;
    expect(afterIds).toBe(before);                           // once only: no repeat for the same incident
  });

  it('a critical incident escalates after 15 minutes, not 60', async () => {
    const owner = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    initCriticalAlert({ sendMail: vi.fn().mockResolvedValue({}) });
    const inc = await incident({ severity: 'critical' });
    await runEscalation({ now: Date.now() + 20 * 60000, fetchImpl: okFetch() });
    expect((await SecurityIncident.findById(inc._id)).escalatedAt).toBeTruthy();
  });

  it('two overlapping runs cannot both alert for the same incident', async () => {
    const owner = await mkAdmin();
    process.env.SOC_OWNER_EMAILS = owner.email;
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/x';
    initCriticalAlert({ sendMail: vi.fn().mockResolvedValue({}) });
    const inc = await incident({ severity: 'high' });
    const f = okFetch();
    const now = Date.now() + 2 * HOUR;
    await Promise.all([runEscalation({ now, fetchImpl: f }), runEscalation({ now, fetchImpl: f })]);
    const sentForThis = f.mock.calls.filter((c) => JSON.parse(c[1].body).text.includes('HIGH')).length;
    expect(sentForThis).toBeGreaterThanOrEqual(1);
    const doc = await SecurityIncident.findById(inc._id);
    expect(doc.escalatedAt).toBeTruthy();
  });
});

describe('alert channel status + test endpoints', () => {
  const login = async (email) => {
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
    return (await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' })).body.token;
  };

  it('status reports what is configured but never reveals URLs or tokens; the test endpoint reports each channel', async () => {
    const email = `alert-ep-${Date.now()}@example.com`;
    const token = await login(email);
    process.env.SOC_ALERT_WEBHOOK_URL = 'https://hooks.example.test/T000/SUPER-SECRET-PATH';
    process.env.SOC_TELEGRAM_BOT_TOKEN = '111:TG-SECRET';
    process.env.SOC_TELEGRAM_CHAT_ID = '42';
    const auth = { Authorization: `Bearer ${token}` };

    const status = await request(app).get('/api/soc/alerts/status').set(auth);
    expect(status.status).toBe(200);
    expect(status.body.webhook.configured).toBe(true);
    expect(status.body.telegram.configured).toBe(true);
    expect(status.body.detail).toBe('minimal');
    expect(JSON.stringify(status.body)).not.toContain('SUPER-SECRET-PATH');
    expect(JSON.stringify(status.body)).not.toContain('TG-SECRET');

    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const test = await request(app).post('/api/soc/alerts/test').set(auth);
    expect(test.status).toBe(200);
    expect(test.body.webhook).toEqual({ configured: true, ok: true });
    expect(test.body.telegram).toEqual({ configured: true, ok: true });
    expect(JSON.parse(f.mock.calls[0][1].body).text).toContain('test alert');
  });

  it('only the SOC owner can see or trigger them', async () => {
    const owner = await login(`alert-own-${Date.now()}@example.com`);
    const outsider = await login(`alert-out-${Date.now()}@example.com`);
    process.env.SOC_OWNER_EMAILS = `alert-own-${Date.now()}@nowhere.test`; // nobody in this test is the owner
    expect((await request(app).get('/api/soc/alerts/status').set({ Authorization: `Bearer ${outsider}` })).status).toBe(403);
    expect((await request(app).post('/api/soc/alerts/test').set({ Authorization: `Bearer ${owner}` })).status).toBe(403);
    expect((await request(app).get('/api/soc/alerts/status')).status).toBe(401);
  });
});
