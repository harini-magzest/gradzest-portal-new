// The SOC used to report the virus scanner and email from configuration and hand-typed text: a scanner that was not
// installed read as "real and verified", and email read "on" whenever SMTP_PASS was set. These pin the live checks.
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const EmailLog = require('../models/EmailLog');
const { getServiceHealth, setProbesForTest } = require('../lib/serviceHealth');

const ENV_KEYS = ['SMTP_USER', 'SMTP_PASS'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SMTP_USER = 'mailer@example.test';
  process.env.SMTP_PASS = 'smtp-secret-0123456789';
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setProbesForTest();
});

const up = { clamd: async () => ({ ok: true, detail: 'answered PONG' }), smtp: async () => ({ ok: true, detail: 'connected and signed in' }) };

describe('getServiceHealth', () => {
  it('reports the scanner down when clamd does not answer, with what that means for uploads', async () => {
    setProbesForTest({ ...up, clamd: async () => ({ ok: false, detail: 'ECONNREFUSED' }) });
    const h = await getServiceHealth(app);
    expect(h.scanner.status).toBe('down');
    expect(h.scanner.detail).toContain('ECONNREFUSED');
    expect(h.scanner.detail).toContain('Uploads are refused');
  });

  it('reports email failing when SMTP sign-in fails, and never echoes the password', async () => {
    setProbesForTest({ ...up, smtp: async () => ({ ok: false, detail: '535 Authentication failed' }) });
    const h = await getServiceHealth(app);
    expect(h.email.status).toBe('failing');
    expect(h.email.detail).toContain('535');
    expect(JSON.stringify(h)).not.toContain('smtp-secret-0123456789');
  });

  it('reports email off (not failing) when SMTP is not set up, without probing', async () => {
    delete process.env.SMTP_PASS;
    const smtp = vi.fn();
    setProbesForTest({ ...up, smtp });
    const h = await getServiceHealth(app);
    expect(h.email.status).toBe('off');
    expect(smtp).not.toHaveBeenCalled();
  });

  it('includes the last send result from the email log', async () => {
    setProbesForTest(up);
    const studentId = (await new User({ name: 'S', email: `sh-${Date.now()}@example.com`, password: 'x', role: 'student' }).save())._id;
    await EmailLog.create({ studentId, to: 'a@example.com', subject: 's', status: 'failed', error: 'Missing credentials for "PLAIN"' });
    const h = await getServiceHealth(app);
    expect(h.email.status).toBe('ok');
    expect(h.email.lastStatus).toBe('failed');
    expect(h.email.lastError).toContain('Missing credentials');
  });

  it('caches results for a minute, and refresh re-checks', async () => {
    const clamd = vi.fn(async () => ({ ok: true, detail: 'answered PONG' }));
    setProbesForTest({ ...up, clamd });
    await getServiceHealth(app);
    await getServiceHealth(app);
    expect(clamd).toHaveBeenCalledTimes(1);
    await getServiceHealth(app, { refresh: true });
    expect(clamd).toHaveBeenCalledTimes(2);
  });
});

describe('SOC routes show the live result', () => {
  const login = async (email) => {
    await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'TestPass123!' });
    await User.findOneAndUpdate({ email }, { emailVerified: true, role: 'admin' });
    return (await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' })).body.token;
  };

  it('Needs attention carries the scanner and email status', async () => {
    setProbesForTest({ clamd: async () => ({ ok: false, detail: 'ECONNREFUSED' }), smtp: async () => ({ ok: false, detail: '535' }) });
    const auth = { Authorization: `Bearer ${await login(`sh-att-${Date.now()}@example.com`)}` };
    const res = await request(app).get('/api/soc/attention').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.services.scanner.status).toBe('down');
    expect(res.body.services.email.status).toBe('failing');
  });

  it('alert status no longer says email is on just because SMTP_PASS is set', async () => {
    setProbesForTest({ ...up, smtp: async () => ({ ok: false, detail: '535 Authentication failed' }) });
    const auth = { Authorization: `Bearer ${await login(`sh-al-${Date.now()}@example.com`)}` };
    const res = await request(app).get('/api/soc/alerts/status').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(false);
    expect(res.body.emailHealth.status).toBe('failing');
  });
});
