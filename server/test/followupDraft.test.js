const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { setAnthropicClientForTests } = require('../lib/anthropicClient');
const { gatherFacts, templateDraft, buildPrompt, parseDraft } = require('../lib/followupDraft');

const now = new Date('2026-10-05T00:00:00Z').getTime();
const student = {
  name: 'Asha Kumar', leadStage: 'counselling', leadStageChangedAt: new Date('2026-09-20T00:00:00Z'), preferredCountries: ['UK', 'Canada'],
  applications: [{ universityName: 'Test University', courseName: 'MSc Data', status: 'under_review' }, { universityName: 'Old Uni', status: 'rejected' }],
};
const checklist = { items: [{ label: 'Passport', status: 'verified' }, { label: 'Statement of purpose', status: 'missing' }, { label: 'Proof of funds', status: 'requested' }, { label: 'CV', status: 'missing' }, { label: 'LOR', status: 'missing' }] };

describe('gatherFacts', () => {
  it('collects what the draft may mention, and nothing else', () => {
    const f = gatherFacts(student, checklist, now);
    expect(f).toMatchObject({ firstName: 'Asha', stageLabel: 'Counselling', daysIdle: 15, countries: ['UK', 'Canada'] });
    expect(f.applications).toEqual([{ university: 'Test University', course: 'MSc Data', status: 'Under Review' }]); // the rejected one is left out
    expect(f.missingDocuments).toEqual(['Statement of purpose', 'Proof of funds', 'CV']); // capped at three, verified ones skipped
    expect(JSON.stringify(f)).not.toMatch(/@|phone|passport number/i);
  });
  it('copes with a bare record', () => {
    expect(gatherFacts({ name: '' }, null, now)).toMatchObject({ firstName: 'there', stage: 'new_enquiry', applications: [], missingDocuments: [] });
  });
});

describe('templateDraft', () => {
  const f = gatherFacts(student, checklist, now);
  it('writes an email with a subject, the real next step and a signature', () => {
    const d = templateDraft(f, 'email', 'Ravi');
    expect(d.subject).toContain('Asha');
    expect(d.body).toContain('Hi Asha');
    expect(d.body).toContain('Test University (MSc Data) is under review');
    expect(d.body).toContain('Statement of purpose, Proof of funds and CV');
    expect(d.body).toContain('Ravi');
  });
  it('writes a short WhatsApp message with no subject', () => {
    const d = templateDraft(f, 'whatsapp', 'Ravi');
    expect(d.subject).toBe('');
    expect(d.body.length).toBeLessThan(500);
    expect(d.body).not.toContain('\n');
  });
  it('falls back to a general check-in with no applications or documents outstanding', () => {
    const d = templateDraft(gatherFacts({ name: 'Sam' }, { items: [] }, now), 'email');
    expect(d.body).toContain('anything holding you back');
  });
});

describe('buildPrompt and parseDraft', () => {
  const f = gatherFacts(student, checklist, now);
  it('hands the model the facts and the rules', () => {
    const p = buildPrompt(f, 'email', 'Ravi');
    expect(p).toContain('Counselling, unchanged for 15 days');
    expect(p).toContain('Test University (MSc Data), Under Review');
    expect(p).toContain('Do not invent deadlines');
    expect(p).toContain('Subject:');
  });
  it('splits an email reply into subject and body, and keeps WhatsApp whole', () => {
    expect(parseDraft('Subject: Checking in\n\nHi Asha,\nHello.', 'email')).toEqual({ subject: 'Checking in', body: 'Hi Asha,\nHello.' });
    expect(parseDraft('No subject line here', 'email')).toEqual({ subject: '', body: 'No subject line here' });
    expect(parseDraft('Hi Asha!', 'whatsapp')).toEqual({ subject: '', body: 'Hi Asha!' });
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `fd-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `FD ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('POST /api/zest/followup-draft', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    setAnthropicClientForTests(null);
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  const owned = async () => {
    const counselor = await mk('counselor');
    const lead = await mk('student', { counselorId: counselor.id, leadStage: 'counselling', preferredCountries: ['UK'], phone: '9876543210' });
    return { counselor, lead };
  };

  it('uses the template when Zest is not configured', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const { counselor, lead } = await owned();
    const res = await request(app).post('/api/zest/followup-draft').set(as(counselor)).send({ studentId: lead.id, channel: 'email' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'template', channel: 'email', email: lead.email, phone: '9876543210' });
    expect(res.body.subject).toBeTruthy();
    expect(res.body.body).toContain('FD student'.split(' ')[0]);
  });

  it('asks the model with the facts, and returns its wording', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked';
    const calls = [];
    setAnthropicClientForTests({ messages: { create: async (params) => { calls.push(params); return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Subject: A quick hello\n\nHi FD, just checking in.' }] }; } } });
    const { counselor, lead } = await owned();
    const res = await request(app).post('/api/zest/followup-draft').set(as(counselor)).send({ studentId: lead.id });
    expect(res.body).toMatchObject({ source: 'ai', subject: 'A quick hello', body: 'Hi FD, just checking in.' });
    const sent = JSON.stringify(calls[0].messages);
    expect(sent).toContain('Counselling');
    expect(sent).not.toContain(lead.email); // contact details are never sent to the model
    expect(sent).not.toContain('9876543210');
  });

  it('falls back to the template if the model fails or answers with nothing', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked';
    const { counselor, lead } = await owned();
    setAnthropicClientForTests({ messages: { create: async () => { throw new Error('overloaded'); } } });
    expect((await request(app).post('/api/zest/followup-draft').set(as(counselor)).send({ studentId: lead.id })).body.source).toBe('template');
    setAnthropicClientForTests({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '   ' }] }) } });
    expect((await request(app).post('/api/zest/followup-draft').set(as(counselor)).send({ studentId: lead.id })).body.source).toBe('template');
  });

  it('follows the platform access rules (staff only, student must be viewable) and validates input', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const { lead } = await owned();
    const other = await mk('counselor');
    expect((await request(app).post('/api/zest/followup-draft').set(as(lead)).send({ studentId: lead.id })).status).toBe(403);
    expect((await request(app).post('/api/zest/followup-draft').set(as(other)).send({ studentId: 'nope' })).status).toBe(400);
    const admin = await mk('admin');
    expect((await request(app).post('/api/zest/followup-draft').set(as(admin)).send({ studentId: lead.id, channel: 'whatsapp' })).body.channel).toBe('whatsapp');
  });
});
