const http = require('http');
const dns = require('dns');
const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');
const { isPrivateAddress, assertFetchable, fetchPublicImage, guardedLookup } = require('../lib/safeHttp');
const { normalizeHttpUrl } = require('../lib/safeUrl');

describe('isPrivateAddress', () => {
  it('refuses loopback, private, link-local, CGNAT, multicast, reserved and unparseable addresses', () => {
    for (const ip of [
      '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
      '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1',
      '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::1', 'not-an-ip', '', '999.1.1.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertFetchable', () => {
  it('accepts plain public http(s) URLs', () => {
    expect(() => assertFetchable('https://upload.wikimedia.org/logo.png')).not.toThrow();
    expect(() => assertFetchable('http://example.com/a.png')).not.toThrow();
    expect(() => assertFetchable('https://example.com:443/a.png')).not.toThrow();
  });

  it('refuses other schemes, credentials, odd ports, internal names and private IP literals', () => {
    for (const bad of [
      'file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
      'https://user:pass@example.com/x', 'https://example.com:8080/x', 'http://example.com:22/',
      'http://localhost/x', 'http://app.localhost/x', 'http://db.internal/x', 'http://printer.local/x',
      'http://127.0.0.1/x', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data/', 'http://10.1.2.3/x', 'http://192.168.0.1/x',
      'http://2130706433/x', 'http://0x7f.0.0.1/x', 'not a url',
    ]) {
      expect(() => assertFetchable(bad), bad).toThrow();
    }
  });
});

describe('guardedLookup (the check that runs on the address actually connected to)', () => {
  const lookupWith = (answers) => vi.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => cb(null, answers));
  afterEach(() => vi.restoreAllMocks());
  const run = (host = 'cdn.example') => new Promise((resolve) => guardedLookup(host, { all: false }, (err, address) => resolve({ err, address })));

  it('passes a public answer through', async () => {
    lookupWith([{ address: '93.184.216.34', family: 4 }]);
    expect(await run()).toEqual({ err: null, address: '93.184.216.34' });
  });

  it('refuses a name that resolves to a private address, even if only one answer is private', async () => {
    lookupWith([{ address: '127.0.0.1', family: 4 }]);
    expect((await run()).err.code).toBe('ESSRF');
    vi.restoreAllMocks();
    lookupWith([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }]);
    expect((await run()).err.code).toBe('ESSRF');
  });
});

describe('fetchPublicImage', () => {
  let server; let port; let hits;
  beforeAll(async () => {
    server = http.createServer((req, res) => { hits += 1; res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.alloc(400, 1)); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(() => { hits = 0; });

  it('never contacts a loopback or private target, and says why', async () => {
    await expect(fetchPublicImage(`http://127.0.0.1:${port}/logo.png`)).rejects.toMatchObject({ code: 'ESSRF' });
    await expect(fetchPublicImage(`http://localhost:${port}/logo.png`)).rejects.toMatchObject({ code: 'ESSRF' });
    await expect(fetchPublicImage('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ code: 'ESSRF' });
    expect(hits).toBe(0);
  });
});

let n = 0;
async function login(role) {
  const email = `hard-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Hard ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return res.body.token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('GET /api/unilogo/:id does not fetch internal addresses', () => {
  let server; let port; let hits;
  beforeAll(async () => {
    server = http.createServer((req, res) => { hits += 1; res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(Buffer.alloc(400, 1)); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('a university whose logo URL points at a local service gets the placeholder, and the service is never called', async () => {
    hits = 0;
    const id = `ssrf-${Date.now()}`;
    await University.create({ id, name: 'SSRF Uni', country: 'Canada', logo: `http://127.0.0.1:${port}/secret.png` }); // no website: no favicon fallback
    const res = await request(app).get(`/api/unilogo/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/gif/); // the transparent placeholder
    expect(hits).toBe(0);
  });
});

describe('autofill endpoints make outbound requests, so they are admin only', () => {
  it('universities: anonymous 401, student and counselor 403, admin gets past the gate', async () => {
    expect((await request(app).get('/api/universities/autofill?name=Oxford')).status).toBe(401);
    expect((await request(app).get('/api/universities/autofill?name=Oxford').set(auth(await login('student')))).status).toBe(403);
    expect((await request(app).get('/api/universities/autofill?name=Oxford').set(auth(await login('counselor')))).status).toBe(403);
    // an admin with no name is refused by the handler (400), which proves the gate let them through without any outbound call
    expect((await request(app).get('/api/universities/autofill').set(auth(await login('admin')))).status).toBe(400);
  });

  it('countries: the same', async () => {
    expect((await request(app).get('/api/countries/autofill?name=Canada')).status).toBe(401);
    expect((await request(app).get('/api/countries/autofill?name=Canada').set(auth(await login('counselor')))).status).toBe(403);
    expect((await request(app).get('/api/countries/autofill').set(auth(await login('admin')))).status).toBe(400);
  });
});

describe('meeting links are http(s) only', () => {
  it('normalizeHttpUrl', () => {
    expect(normalizeHttpUrl(' https://meet.jit.si/Room ')).toBe('https://meet.jit.si/Room');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x', '//evil.com', 'meet.jit.si/x', 'https://u:p@example.com', '', '   ', null, 42, `https://example.com/${'a'.repeat(600)}`]) {
      expect(normalizeHttpUrl(bad), String(bad).slice(0, 30)).toBeNull();
    }
  });

  it('create and edit refuse a script link, and accept a normal one', async () => {
    const token = await login('counselor');
    const base = { title: 'Call', scheduledDate: '2030-01-01', scheduledTime: '10:00', platform: 'other' };
    // The WAF may stop script-looking payloads (403) before validation runs; either way they must not be accepted
    for (const bad of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>']) {
      const res = await request(app).post('/api/meetings').set(auth(token)).send({ ...base, meetingLink: bad });
      expect([400, 403]).toContain(res.status);
    }
    // Schemes the WAF has no signature for are refused by the route's own validation
    for (const bad of ['ftp://example.com/room', 'mailto:a@b.co', 'tel:+911234567890']) {
      expect((await request(app).post('/api/meetings').set(auth(token)).send({ ...base, meetingLink: bad })).status, bad).toBe(400);
    }
    const ok = await request(app).post('/api/meetings').set(auth(token)).send({ ...base, meetingLink: 'https://zoom.us/j/123' });
    expect(ok.status).toBeLessThan(300);
    expect(ok.body.meetingLink).toBe('https://zoom.us/j/123');

    const bad = await request(app).put(`/api/meetings/${ok.body._id}`).set(auth(token)).send({ meetingLink: 'ftp://example.com/room' });
    expect(bad.status).toBe(400);
    expect([400, 403]).toContain((await request(app).put(`/api/meetings/${ok.body._id}`).set(auth(token)).send({ meetingLink: 'javascript:alert(1)' })).status);
    const good = await request(app).put(`/api/meetings/${ok.body._id}`).set(auth(token)).send({ meetingLink: 'https://teams.microsoft.com/l/meetup-join/x' });
    expect(good.status).toBe(200);
    expect(good.body.meetingLink).toBe('https://teams.microsoft.com/l/meetup-join/x');
    expect((await request(app).put(`/api/meetings/${ok.body._id}`).set(auth(token)).send({ meetingLink: '' })).status).toBe(200); // clearing is allowed
  });
});
