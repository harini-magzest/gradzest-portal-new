const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { buildSystemPrompt } = require('../lib/anthropicClient');
const { waitUntil } = require('./helpers');

let n = 0;
const phone = () => `97${String(Date.now() + n++).slice(-8)}`;
const send = (body) => request(app).post('/api/zest/public/lead').send(body);

describe('Zest chat "Talk to a counselor" lead', () => {
  let admin;
  beforeAll(async () => {
    admin = await User.create({ role: 'admin', name: 'Lead Admin', email: `zl-admin-${Date.now()}@example.com` });
  });

  it('saves a visitor once as a zest_chat lead and alerts admins urgently', async () => {
    const email = `zl-${Date.now()}@example.com`;
    const res = await send({ firstName: 'Arjun', lastName: 'Rao', phone: phone(), email, preferredCountries: ['Canada'], wantsHuman: true, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/counselor will contact you/);

    const s = await User.findOne({ email }).lean();
    expect(s).toMatchObject({ role: 'student', name: 'Arjun Rao', firstName: 'Arjun', lastName: 'Rao', source: 'zest_chat', leadStage: 'new_enquiry' });
    expect(s.preferredCountries).toEqual(['Canada']);
    expect(s.callbackRequestedAt).toBeTruthy();
    expect(s.password).toBeUndefined();

    const alert = await waitUntil(() => Notification.findOne({ userId: admin._id, title: /callback requested: Arjun Rao/ }).lean());
    expect(alert).toMatchObject({ type: 'lead', priority: 'urgent' });
    expect(alert.message).toMatch(/Zest chat/);
  });

  it('never saves the same person twice (same email or same mobile), and replies the same way', async () => {
    const mobile = phone();
    const email = `zl-dupe-${Date.now()}@example.com`;
    const first = await send({ firstName: 'Diya', phone: mobile, email });
    const byEmail = await send({ firstName: 'Diya', phone: phone(), email: email.toUpperCase() });
    const byPhone = await send({ firstName: 'Diya', phone: `+91 ${mobile.slice(0, 5)}-${mobile.slice(5)}` });
    expect(byEmail.body).toEqual(first.body);
    expect(byPhone.body).toEqual(first.body);
    expect(await User.countDocuments({ firstName: 'Diya', source: 'zest_chat' })).toBe(1);
  });

  it('a repeat visitor who wants a person still reaches someone, without a second record', async () => {
    const mobile = phone();
    await send({ firstName: 'Kabir', phone: mobile });
    const before = await Notification.countDocuments({ title: /Callback request: Kabir/ });
    await send({ firstName: 'Kabir', phone: mobile, wantsHuman: true });
    await waitUntil(async () => (await Notification.countDocuments({ title: /Callback request: Kabir/ })) > before);
    expect(await User.countDocuments({ firstName: 'Kabir' })).toBe(1);
    expect((await User.findOne({ firstName: 'Kabir' }).lean()).callbackRequestedAt).toBeTruthy();
  });

  it('validates the details and drops bots', async () => {
    expect((await send({ phone: phone() })).status).toBe(400);
    expect((await send({ firstName: 'NoPhone' })).status).toBe(400);
    expect((await send({ firstName: 'Bad', phone: phone(), email: 'nope' })).status).toBe(400);
    expect((await send({ firstName: 'ZestBot', phone: phone(), website: 'http://spam' })).status).toBe(201);
    expect(await User.countDocuments({ firstName: 'ZestBot' })).toBe(0);
  });

  it('never attaches a lead to a staff account', async () => {
    await send({ firstName: 'Imposter', phone: phone(), email: admin.email, wantsHuman: true });
    expect((await User.findById(admin._id).lean()).role).toBe('admin');
    expect(await User.countDocuments({ firstName: 'Imposter' })).toBe(0);
  });

  it('tells Zest to point visitors at the button and not to collect details in chat', () => {
    const prompt = buildSystemPrompt('guest');
    expect(prompt).toMatch(/Talk to a counselor/);
    expect(prompt).toMatch(/NOT saved/);
    expect(buildSystemPrompt('student')).not.toMatch(/Talk to a counselor" button/);
  });
});
