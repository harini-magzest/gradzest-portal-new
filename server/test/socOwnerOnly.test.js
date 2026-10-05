const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { app, io, httpServer } = require('../app');
const User = require('../models/User');
const socRouter = require('../routes/soc');
const { waitUntil } = require('./helpers');

let n = 0;
async function mk(role, extra = {}) {
  const email = `owner-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Own ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('only the SOC owner can use the SOC', () => {
  const saved = process.env.SOC_OWNER_EMAILS;
  afterEach(() => { process.env.SOC_OWNER_EMAILS = saved; });

  it('every route on the SOC router refuses an admin who is not the owner (and the owner, an Application Team member, is judged separately)', async () => {
    const owner = await mk('admin');
    const otherAdmin = await mk('admin');
    const appTeam = await mk('admin', { isAppTeam: true });
    process.env.SOC_OWNER_EMAILS = owner.email;

    // Read the real route table so a route added later without the gate fails this test.
    const routes = socRouter.stack.filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => ({ method: m, path: l.route.path })));
    expect(routes.length).toBeGreaterThan(30); // (guards against an empty enumeration silently passing)

    const failures = [];
    for (const { method, path } of routes) {
      const url = '/api/soc' + path.replace(/:[A-Za-z]+/g, '000000000000000000000000');
      for (const [who, user] of [['other admin', otherAdmin], ['app team', appTeam]]) {
        const res = await request(app)[method](url).set(as(user)).send({});
        if (res.status !== 403) failures.push(`${who}: ${method.toUpperCase()} ${path} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);

    expect((await request(app).get('/api/soc/stats').set(as(owner))).status).toBe(200);
    const denied = await request(app).get('/api/soc/stats').set(as(otherAdmin));
    expect(denied.body.message).toMatch(/not authorised for the soc/i);
  });

  it('an unauthenticated caller and a student/counselor are refused too', async () => {
    const owner = await mk('admin');
    process.env.SOC_OWNER_EMAILS = owner.email;
    const student = await mk('student');
    const counselor = await mk('counselor');
    expect((await request(app).get('/api/soc/stats')).status).toBe(401);
    expect((await request(app).get('/api/soc/stats').set(as(student))).status).toBe(403);
    expect((await request(app).get('/api/soc/incidents').set(as(counselor))).status).toBe(403);
  });
});

describe('the live SOC feed is owner-only too (no side door through the socket)', () => {
  const saved = process.env.SOC_OWNER_EMAILS;
  let port;
  const clients = [];
  beforeAll(async () => {
    await new Promise((resolve) => httpServer.listen(0, resolve));
    port = httpServer.address().port;
  });
  afterAll(async () => {
    process.env.SOC_OWNER_EMAILS = saved;
    clients.forEach((c) => c.disconnect());
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const connect = (u) => new Promise((resolve, reject) => {
    const s = ioClient(`http://localhost:${port}`, { auth: { token: u.token }, transports: ['websocket'], reconnection: false });
    clients.push(s);
    s.on('connect', () => { s.emit('register'); resolve(s); });
    s.on('connect_error', reject);
  });
  const members = async (room) => (await io.in(room).fetchSockets()).map((s) => s.data.userId).sort();
  const listen = (s, ev) => { const got = []; s.on(ev, (p) => got.push(p)); return got; };

  it('only the owner joins admin-room; other full admins keep their own room; Application Team and staff get neither', async () => {
    const owner = await mk('admin');
    const otherAdmin = await mk('admin');
    const appTeam = await mk('admin', { isAppTeam: true });
    const counselor = await mk('counselor');
    process.env.SOC_OWNER_EMAILS = owner.email;

    const [so, sa, st, sc] = await Promise.all([connect(owner), connect(otherAdmin), connect(appTeam), connect(counselor)]);
    await waitUntil(async () => (await members('admin-room')).includes(owner.id) && (await members('full-admin-room')).length >= 2 && (await members('activity-room')).length >= 3);

    expect(await members('admin-room')).toEqual([owner.id]);
    expect(await members('full-admin-room')).toEqual([owner.id, otherAdmin.id].sort());
    expect(await members('activity-room')).toEqual([owner.id, otherAdmin.id, appTeam.id].sort());

    const secOwner = listen(so, 'security_event'); const secOther = listen(sa, 'security_event');
    const secApp = listen(st, 'security_event'); const secStaff = listen(sc, 'security_event');
    const subOther = listen(sa, 'admin:new_subscriber'); const subApp = listen(st, 'admin:new_subscriber');

    io.to('admin-room').emit('security_event', { type: 'login_failure', email: 'victim@example.com' });
    io.to('full-admin-room').emit('admin:new_subscriber', { email: 'lead@example.com' });
    await new Promise((r) => setTimeout(r, 400));

    expect(secOwner).toHaveLength(1);                      // the owner sees the live security event
    expect(secOther).toHaveLength(0);                      // another full admin does not
    expect(secApp).toHaveLength(0);
    expect(secStaff).toHaveLength(0);
    expect(subOther).toHaveLength(1);                      // ...but still gets non-SOC admin alerts
    expect(subApp).toHaveLength(0);
  });

  it('an owner who is removed from SOC_OWNER_EMAILS is dropped from the live feed without reconnecting', async () => {
    const owner = await mk('admin');
    process.env.SOC_OWNER_EMAILS = owner.email;
    const so = await connect(owner);
    await waitUntil(async () => (await members('admin-room')).includes(owner.id));
    const got = listen(so, 'security_event');

    process.env.SOC_OWNER_EMAILS = 'nobody-else@example.com'; // demoted while the tab stays open
    await waitUntil(async () => !(await members('admin-room')).includes(owner.id));

    io.to('admin-room').emit('security_event', { type: 'login_failure', email: 'secret@example.com' });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toHaveLength(0);
  });

  it('real SOC events are delivered to the owner only (a sign-in row and an incident, via the app\'s own emitters)', async () => {
    const owner = await mk('admin');
    const otherAdmin = await mk('admin');
    process.env.SOC_OWNER_EMAILS = owner.email;
    const so = await connect(owner);
    const sa = await connect(otherAdmin);
    await waitUntil(async () => (await members('admin-room')).includes(owner.id) && (await members('full-admin-room')).includes(otherAdmin.id));
    const ownerGot = listen(so, 'ui_activity'); const otherGot = listen(sa, 'ui_activity');

    const target = await mk('counselor'); // signing in writes a sign-in row, announced to admin-room
    await waitUntil(() => ownerGot.some((b) => b.some((r) => r.userId === target.id)));
    await new Promise((r) => setTimeout(r, 300));
    expect(ownerGot.some((b) => b.some((r) => r.userId === target.id))).toBe(true);
    expect(otherGot).toHaveLength(0);
  });
});
