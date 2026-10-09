const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const LeadForm = require('../models/LeadForm');

let n = 0;
async function mk(role, extra = {}) {
  const email = `forms-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `F ${role} Person`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const phone = () => `98${String(Date.now() + n++).slice(-8)}`;

describe('Settings → Forms', () => {
  let admin;
  beforeAll(async () => { admin = await mk('admin'); });

  it('only the Admin Team can manage forms', async () => {
    const counselor = await mk('counselor');
    const appTeam = await mk('admin', { isAppTeam: true });
    expect((await request(app).get('/api/forms').set(as(counselor))).status).toBe(403);
    expect((await request(app).get('/api/forms').set(as(appTeam))).status).toBe(403);
    expect((await request(app).post('/api/forms').set(as(counselor)).send({ title: 'X' })).status).toBe(403);
    expect((await request(app).get('/api/forms')).status).toBe(401);
  });

  it('creates a form with a unique link and only known fields', async () => {
    const a = await request(app).post('/api/forms').set(as(admin))
      .send({ title: 'UK Feb Intake!', fields: ['message', 'email', 'password', 'role'], campaign: 'oct_fair' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ title: 'UK Feb Intake!', slug: 'uk-feb-intake', active: true, submissions: 0, campaign: 'oct_fair' });
    expect(a.body.fields).toEqual(['email', 'message']);

    const b = await request(app).post('/api/forms').set(as(admin)).send({ title: 'UK Feb Intake' });
    expect(b.body.slug).toBe('uk-feb-intake-2');
    expect((await request(app).post('/api/forms').set(as(admin)).send({ title: '  ' })).status).toBe(400);
  });

  it('edits, switches off and deletes a form; the slug never changes', async () => {
    const { body: f } = await request(app).post('/api/forms').set(as(admin)).send({ title: 'Edit Me' });
    const up = await request(app).put(`/api/forms/${f.id}`).set(as(admin)).send({ title: 'Edited', slug: 'hijack', active: false });
    expect(up.body).toMatchObject({ title: 'Edited', slug: f.slug, active: false });
    expect((await request(app).get(`/api/forms/public/${f.slug}`)).status).toBe(410);
    expect((await request(app).delete(`/api/forms/${f.id}`).set(as(admin))).status).toBe(200);
    expect((await request(app).get(`/api/forms/public/${f.slug}`)).status).toBe(404);
    expect((await request(app).put('/api/forms/not-an-id').set(as(admin)).send({ title: 'x' })).status).toBe(404);
  });
});

describe('public form page', () => {
  let form;
  beforeAll(async () => {
    form = await LeadForm.create({
      title: 'Canada Fair', slug: `canada-fair-${Date.now()}`, campaign: 'fair_2026',
      fields: ['email', 'preferredCountries', 'preferredIntake', 'preferredCourseLevel', 'message'],
      thankYouMessage: 'Thanks, we will call you!',
    });
  });
  const submit = (body) => request(app).post(`/api/forms/public/${form.slug}/submit`).send(body);

  it('shows only what the visitor needs', async () => {
    const res = await request(app).get(`/api/forms/public/${form.slug.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['fields', 'intro', 'title']);
  });

  it('turns a submission into a web_form student lead with campaign tracking', async () => {
    const email = `visitor-${Date.now()}@example.com`;
    const res = await submit({
      firstName: 'Meera', lastName: 'Shah', phone: phone(), email, preferredCountries: ['Canada', 'UK'], preferredIntake: 'Sep 2027',
      preferredCourseLevel: 'Masters', message: 'MBA please', utm_source: 'instagram', utm_medium: 'story',
      qualification: 'not asked on this form', role: 'admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Thanks, we will call you!');

    const s = await User.findOne({ email }).lean();
    expect(s).toMatchObject({
      // a counselor exists (made above), so the round-robin assigns one and the lead moves to 'contacted'
      role: 'student', name: 'Meera Shah', firstName: 'Meera', lastName: 'Shah', source: 'web_form', leadStatus: 'contacted', leadStage: 'new_enquiry',
      preferredIntake: 'Sep 2027', preferredCourseLevel: 'Masters', preferenceNote: 'MBA please',
      leadForm: 'Canada Fair', utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'fair_2026',
    });
    expect(s.preferredCountries).toEqual(['Canada', 'UK']);
    expect(s.counselorId).toBeTruthy();
    expect(s.qualification).toBeUndefined();
    expect(s.password).toBeUndefined();
    expect((await LeadForm.findById(form._id)).submissions).toBeGreaterThanOrEqual(1);
  });

  it('a utm_campaign on the link wins over the form default', async () => {
    const email = `utm-${Date.now()}@example.com`;
    await submit({ firstName: 'Link', lastName: 'Visitor', phone: phone(), email, utm_campaign: 'google_ads' });
    expect((await User.findOne({ email }).lean()).utmCampaign).toBe('google_ads');
  });

  it('validates name, mobile and email', async () => {
    expect((await submit({ phone: phone() })).status).toBe(400);
    expect((await submit({ firstName: 'NoPhone' })).status).toBe(400);
    expect((await submit({ firstName: 'Bad', phone: phone(), email: 'nope' })).status).toBe(400);
  });

  it('does not duplicate someone already on file, and answers the same way', async () => {
    const mobile = phone();
    const first = await submit({ firstName: 'Twice', phone: mobile });
    const again = await submit({ firstName: 'Twice', phone: `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}` });
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
    expect(await User.countDocuments({ name: 'Twice', source: 'web_form' })).toBe(1);
  });

  it('never attaches a lead to a staff account', async () => {
    const staff = await mk('counselor');
    const res = await submit({ firstName: 'Imposter', phone: phone(), email: staff.email });
    expect(res.status).toBe(201);
    expect((await User.findOne({ email: staff.email }).lean()).role).toBe('counselor');
    expect(await User.countDocuments({ name: 'Imposter' })).toBe(0);
  });

  it('silently drops bot submissions that fill the hidden field', async () => {
    const res = await submit({ firstName: 'Spam', lastName: 'Bot', phone: phone(), website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ name: 'Spam Bot' })).toBe(0);
  });

  it('refuses submissions to a closed form', async () => {
    const closed = await LeadForm.create({ title: 'Old', slug: `old-${Date.now()}`, active: false });
    const res = await request(app).post(`/api/forms/public/${closed.slug}/submit`).send({ firstName: 'Late', phone: phone() });
    expect(res.status).toBe(410);
  });
});
