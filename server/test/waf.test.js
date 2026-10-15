const request = require('supertest');
const { app } = require('../app');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const { waitUntil } = require('./helpers');

describe('WAF signature filter', () => {
  it('lets a normal login request through untouched', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'whatever' });
    // 400/401 for bad credentials is fine — the point is it's NOT a WAF 403.
    expect(res.status).not.toBe(403);
  });

  it('does not false-positive on legitimate text containing $ amounts or the word "sleep"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'I paid $500 for the course, sleep well tonight' });
    expect(res.status).not.toBe(403);
  });

  it('blocks an XSS payload in the query string', async () => {
    const res = await request(app).get('/api/countries?search=<script>alert(1)</script>');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/blocked/i);
  });

  it('blocks a SQL-injection-shaped payload in the request body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "a@a.com' OR 1=1--", password: 'x' });
    expect(res.status).toBe(403);
  });

  it('blocks a path traversal attempt in the query string', async () => {
    const res = await request(app).get('/api/countries?file=../../etc/passwd');
    expect(res.status).toBe(403);
  });

  it('blocks a command injection attempt', async () => {
    const res = await request(app).get('/api/countries?cmd=test;%20rm%20-rf%20/');
    expect(res.status).toBe(403);
  });

  it('exempts /api/soc routes so analysts can document attack payloads in incident notes', async () => {
    // No auth token — expect a 401 from adminOnly/authMiddleware, never a WAF 403,
    // proving the WAF check itself was skipped for this path.
    const res = await request(app)
      .get('/api/soc/incidents?status=<script>alert(1)</script>');
    expect(res.status).not.toBe(403);
  });

  it('logs a real SecurityEvent and links it to a SecurityIncident on a match', async () => {
    const res = await request(app).get('/api/countries?search=<script>evidence-marker</script>');
    expect(res.status).toBe(403);

    // Detection runs fire-and-forget after the response. Match THIS request's event by its
    // unique marker: the newest waf_block overall may belong to an earlier test in this file,
    // and a fixed sleep can return before this one is written.
    const event = await waitUntil(() => SecurityEvent.find({ type: 'waf_block' }).then(events => events.find(e => /evidence-marker/.test(e.message))));
    expect(event).toBeTruthy();
    expect(event.meta.category).toBe('xss');

    // Earlier tests in this file may have already triggered a waf_block incident
    // from the same test-client IP — the detection rule is deliberately idempotent
    // per IP (see detectIncidents.test.js), so it reuses that open incident rather
    // than creating a duplicate. What matters here is that THIS event is linked to
    // an incident, not whether a brand-new incident document was created.
    // The incident is raised by the detection rule after the event is saved, so it can lag too.
    const incident = await waitUntil(() => SecurityIncident.findOne({ type: 'waf_block', sourceEventIds: event._id }));
    expect(incident).toBeTruthy();
  });
});
