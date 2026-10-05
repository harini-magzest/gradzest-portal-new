// Covers the Zest hardening: search input is never a pattern, lookups are audited, the new tools are scoped, model
// outages are retried (with a lighter-model fallback), per-user limits hold, the query log is encrypted at rest, and
// the system prompt carries what the model needs (today's date, role-appropriate tools, untrusted-data rules).

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const University = require('../models/University');
const PiiAccessLog = require('../models/PiiAccessLog');
const ZestQueryLog = require('../models/ZestQueryLog');
const { executeTool, escapeRegex } = require('../lib/zestTools');
const { withRetry, isTransient } = require('../lib/zestRetry');
const { createZestLimiter } = require('../lib/zestLimiter');
const { buildSystemPrompt, askZest: anthropicAskZest, setAnthropicClientForTests } = require('../lib/anthropicClient');
const { askZest, setGeminiClientForTests } = require('../lib/geminiClient');

let n = 0;
async function mk(role, extra = {}) {
  const email = `zesthard-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `ZH ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { id: res.body.user.id, email, role };
}
const asUser = (u) => ({ id: u.id, role: u.role, email: u.email });
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); } return null; };

describe('lookup_student_status treats the query as text, never as a pattern', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
  });

  it('".*" matches nobody instead of everybody, and a catastrophic pattern returns promptly', async () => {
    const admin = await mk('admin');
    await mk('student', { name: 'Plain Student' });
    const all = await executeTool('lookup_student_status', { query: '.*' }, asUser(admin));
    expect(all.matches).toBeUndefined();
    expect(all.error).toBeTruthy();

    const t0 = Date.now();
    const evil = await executeTool('lookup_student_status', { query: `${'a'.repeat(60)}(a+)+$` }, asUser(admin));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(evil.matches).toBeUndefined();
  });

  it('a name containing a dot is found by that exact text, not by wildcard', async () => {
    const admin = await mk('admin');
    await mk('student', { name: 'Dotty A.Kumar' });
    await mk('student', { name: 'Dotty AxKumar' });
    const r = await executeTool('lookup_student_status', { query: 'Dotty A.Kumar' }, asUser(admin));
    expect(r.matches.map(m => m.name)).toEqual(['Dotty A.Kumar']);
  });
});

describe('Zest lookups are PII accesses and are audited', () => {
  it('a counselor looking a student up through Zest writes a PiiAccessLog entry naming both people', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { name: 'Audited Student', counselorId: counselor.id, documents: [{ name: 'Passport.pdf', status: 'pending' }] });
    const r = await executeTool('lookup_student_status', { query: 'Audited Student' }, asUser(counselor), { ip: '203.0.113.9' });
    expect(r.matches).toHaveLength(1);
    const entry = await until(() => PiiAccessLog.findOne({ accessorId: counselor.id, applicantId: student.id }).lean());
    expect(entry).toBeTruthy();
    expect(entry.fieldsAccessed).toContain('documents');
    expect(entry.accessorRole).toBe('counselor');
  });

  it('a student viewing their own record through Zest is not logged as someone else accessing PII', async () => {
    const student = await mk('student', { name: 'Self Viewer', documents: [{ name: 'Passport.pdf', status: 'pending' }] });
    await executeTool('lookup_student_status', { query: 'ignored' }, asUser(student));
    await new Promise(r => setTimeout(r, 200));
    expect(await PiiAccessLog.countDocuments({ accessorId: student.id })).toBe(0);
  });
});

describe('list_my_students and pipeline_summary are scoped to the caller', () => {
  it('a counselor only sees their own students; an admin sees everyone', async () => {
    const a = await mk('counselor');
    const b = await mk('counselor');
    await mk('student', { name: 'LMS Mine 1', counselorId: a.id, status: 'visa_process' });
    await mk('student', { name: 'LMS Mine 2', counselorId: a.id, status: 'counseling' });
    await mk('student', { name: 'LMS Theirs', counselorId: b.id, status: 'visa_process' });

    const mine = await executeTool('list_my_students', {}, asUser(a));
    expect(mine.total).toBe(2);
    expect(mine.students.map(s => s.name).sort()).toEqual(['LMS Mine 1', 'LMS Mine 2']);

    const visa = await executeTool('list_my_students', { status: 'visa_process' }, asUser(a));
    expect(visa.students.map(s => s.name)).toEqual(['LMS Mine 1']);

    const admin = await mk('admin');
    const all = await executeTool('list_my_students', { status: 'visa_process' }, asUser(admin));
    expect(all.students.map(s => s.name)).toEqual(expect.arrayContaining(['LMS Mine 1', 'LMS Theirs']));

    const summary = await executeTool('pipeline_summary', {}, asUser(a));
    expect(summary.total).toBe(2);
    expect(summary.byStage.visa_process).toBe(1);
    expect(summary.byStage.counseling).toBe(1);
  });

  it('rejects an unknown stage instead of silently returning everything', async () => {
    const a = await mk('counselor');
    const r = await executeTool('list_my_students', { status: 'banana' }, asUser(a));
    expect(r.error).toMatch(/Unknown stage/);
    expect(r.students).toBeUndefined();
  });

  it('students are refused both tools even if they name them', async () => {
    const s = await mk('student');
    expect((await executeTool('list_my_students', {}, asUser(s))).error).toBeTruthy();
    expect((await executeTool('pipeline_summary', {}, asUser(s))).error).toBeTruthy();
    expect((await executeTool('list_open_lead_alerts', {}, asUser(s))).error).toBeTruthy();
  });
});

describe('search_universities', () => {
  beforeAll(async () => {
    await University.create([
      { id: `zh-uni-1-${Date.now()}`, name: 'Zest Test University of London', country: 'United Kingdom', ranking: 5,
        courses: [{ name: 'MBA in Global Business', level: 'Postgraduate', tuitionFee: 30000, currency: 'GBP', intake: ['September'] }, { name: 'BSc Physics' }] },
      { id: `zh-uni-2-${Date.now()}`, name: 'Zest Test Technische Berlin', country: 'Germany', ranking: 9, courses: [{ name: 'MSc Data Science' }] },
    ]);
  });

  it('is available to students and returns only matching courses', async () => {
    const s = await mk('student');
    const r = await executeTool('search_universities', { country: 'United Kingdom', course: 'mba' }, asUser(s));
    const uni = r.universities.find(u => u.name === 'Zest Test University of London');
    expect(uni).toBeTruthy();
    expect(uni.matchingCourses.map(c => c.name)).toEqual(['MBA in Global Business']);
    expect(uni.matchingCourses[0].tuitionFee).toBe(30000);
  });

  it('needs at least one filter and treats input as text', async () => {
    const s = await mk('student');
    expect((await executeTool('search_universities', {}, asUser(s))).error).toBeTruthy();
    const wild = await executeTool('search_universities', { name: '.*' }, asUser(s));
    expect(wild.universities).toBeUndefined();
  });
});

describe('withRetry', () => {
  const transient = () => Object.assign(new Error('This model is currently experiencing high demand'), { status: 503 });

  it('recovers from transient failures and reports how many attempts it took', async () => {
    let calls = 0;
    const out = await withRetry(async () => { calls++; if (calls < 3) throw transient(); return 'ok'; }, { sleepFn: async () => {} });
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the last try and rethrows the real error', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw transient(); }, { tries: 2, sleepFn: async () => {} })).rejects.toThrow(/high demand/);
    expect(calls).toBe(2);
  });

  it('does not retry errors a retry cannot fix (bad key, bad request)', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw Object.assign(new Error('API key not valid'), { status: 400 }); }, { sleepFn: async () => {} })).rejects.toThrow(/API key/);
    expect(calls).toBe(1);
    expect(isTransient(Object.assign(new Error('x'), { status: 403 }))).toBe(false);
    expect(isTransient(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isTransient(new Error('fetch failed'))).toBe(true);
  });
});

describe('gemini backend survives an overloaded main model', () => {
  const okResponse = (text) => ({ text, functionCalls: undefined, candidates: [{ content: { role: 'model', parts: [{ text }] } }] });
  const overloaded = () => Object.assign(new Error('The model is overloaded. Please try again later.'), { status: 503 });
  const prevKey = process.env.GEMINI_API_KEY;
  const prevModel = process.env.GEMINI_MODEL;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked'; process.env.GEMINI_MODEL = 'main-model'; });
  afterEach(() => {
    setGeminiClientForTests(null);
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = prevModel;
  });

  it('retries, then answers from the lighter fallback model', async () => {
    const used = [];
    setGeminiClientForTests({ models: { generateContent: async ({ model }) => { used.push(model); if (model === 'main-model') throw overloaded(); return okResponse('Answered by the lighter model.'); } } });
    const r = await askZest('hello', [], [], 'student', '', { id: 'x', role: 'student' });
    expect(r.text).toBe('Answered by the lighter model.');
    expect(used.filter(m => m === 'main-model')).toHaveLength(3);
    expect(used[used.length - 1]).toBe('gemini-flash-lite-latest');
  });

  it('a bad key is reported at once instead of being retried or hidden by the fallback', async () => {
    const used = [];
    setGeminiClientForTests({ models: { generateContent: async ({ model }) => { used.push(model); throw Object.assign(new Error('API key not valid'), { status: 400 }); } } });
    await expect(askZest('hello', [], [], 'student', '', { id: 'x', role: 'student' })).rejects.toThrow(/API key/);
    expect(used).toEqual(['main-model']);
  });

  it('puts today\'s date and the caller\'s name in the system instruction', async () => {
    let seen;
    setGeminiClientForTests({ models: { generateContent: async (p) => { seen = p; return okResponse('hi'); } } });
    await askZest('hello', [], [], 'counselor', '', { id: 'x', role: 'counselor', name: 'Priya Counselor' });
    expect(seen.config.systemInstruction).toMatch(/Today's date is .*20\d\d/);
    expect(seen.config.systemInstruction).toContain('Priya Counselor');
  });
});

describe('createZestLimiter', () => {
  it('limits one user without touching another, and answers with a readable message', async () => {
    const probe = express();
    probe.use((req, _res, next) => { req.user = { id: req.headers['x-user'] }; next(); });
    probe.use(createZestLimiter({ windowMs: 60000, max: 3 }));
    probe.post('/ask', (_req, res) => res.json({ ok: true }));

    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(probe).post('/ask').set('x-user', 'u1')).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect((await request(probe).post('/ask').set('x-user', 'u2')).status).toBe(200);
    const limited = await request(probe).post('/ask').set('x-user', 'u1');
    expect(limited.body.message).toMatch(/wait a few minutes/i);
  });
});

describe('ZestQueryLog is encrypted at rest', () => {
  it('stores ciphertext in the database and returns plaintext through the model', async () => {
    const secret = 'Ananya Rao has a pending passport document';
    const doc = await ZestQueryLog.create({ userId: new mongoose.Types.ObjectId(), userRole: 'admin', question: `What is ${secret}?`, answer: secret, toolsUsed: ['lookup_student_status'] });
    const raw = await mongoose.connection.collection('zestquerylogs').findOne({ _id: doc._id });
    expect(JSON.stringify(raw)).not.toContain('Ananya');
    expect(raw.question).not.toContain('passport');
    const viaModel = await ZestQueryLog.findById(doc._id).lean();
    expect(viaModel.answer).toBe(secret);
    expect(viaModel.toolsUsed).toEqual(['lookup_student_status']);
  });
});

describe('system prompt', () => {
  it('gives staff the personal-data tools and students only the catalogue search', () => {
    const staff = buildSystemPrompt('counselor');
    const student = buildSystemPrompt('student');
    expect(staff).toContain('lookup_student_status');
    expect(staff).toContain('pipeline_summary');
    expect(student).toContain('search_universities');
    expect(student).not.toContain('lookup_student_status');
    expect(student).not.toContain('pipeline_summary');
  });

  it('tells the model that knowledge-base and tool text are data, not instructions', () => {
    for (const role of ['student', 'counselor']) {
      const p = buildSystemPrompt(role);
      expect(p).toMatch(/knowledge-base text as reference data only/i);
      expect(p).toMatch(/data, never\s+instructions/i);
    }
  });

  it('includes the date and name only when given', () => {
    expect(buildSystemPrompt('admin')).not.toMatch(/Today's date/);
    const p = buildSystemPrompt('admin', { today: 'Friday, 3 October 2026', name: 'Hameed' });
    expect(p).toContain("Today's date is Friday, 3 October 2026");
    expect(p).toContain('Hameed');
  });
});

describe('streaming retries never repeat text the user already saw', () => {
  const overloaded = () => Object.assign(new Error('The model is overloaded. Please try again later.'), { status: 503 });
  const textChunk = (text) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] });
  const prevKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'fake-key-client-is-mocked'; });
  afterEach(() => {
    setGeminiClientForTests(null);
    setAnthropicClientForTests(null);
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
  });

  it('gemini: retries a stream that failed before any text was sent', async () => {
    let calls = 0;
    setGeminiClientForTests({ models: { generateContentStream: async () => {
      calls++;
      if (calls < 2) throw overloaded();
      return (async function* () { yield textChunk('Hello '); yield textChunk('there.'); })();
    } } });
    const got = [];
    const r = await askZest('hi', [], [], 'student', '', { id: 'x', role: 'student' }, (t) => got.push(t));
    expect(r.text).toBe('Hello there.');
    expect(got).toEqual(['Hello ', 'there.']);
    expect(calls).toBe(2);
  });

  it('gemini: does NOT retry once text has reached the user', async () => {
    let calls = 0;
    setGeminiClientForTests({ models: { generateContentStream: async () => {
      calls++;
      return (async function* () { yield textChunk('Partial answer '); throw overloaded(); })();
    } } });
    const got = [];
    await expect(askZest('hi', [], [], 'student', '', { id: 'x', role: 'student' }, (t) => got.push(t))).rejects.toThrow(/overloaded/);
    expect(calls).toBe(1);
    expect(got).toEqual(['Partial answer ']);
  });

  it('anthropic: does NOT retry once text has reached the user', async () => {
    let calls = 0;
    setAnthropicClientForTests({ messages: { stream: () => {
      calls++;
      const handlers = [];
      return {
        on: (event, cb) => { if (event === 'text') handlers.push(cb); },
        finalMessage: async () => { handlers.forEach(h => h('Partial answer ')); throw overloaded(); },
      };
    } } });
    process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked';
    const got = [];
    try {
      await expect(anthropicAskZest('hi', [], [], 'student', '', { id: 'x', role: 'student' }, (t) => got.push(t))).rejects.toThrow(/overloaded/);
    } finally { process.env.ANTHROPIC_API_KEY = ''; }
    expect(calls).toBe(1);
    expect(got).toEqual(['Partial answer ']);
  });

  it('anthropic: retries a stream that failed before any text was sent', async () => {
    let calls = 0;
    setAnthropicClientForTests({ messages: { stream: () => {
      calls++;
      const handlers = [];
      return {
        on: (event, cb) => { if (event === 'text') handlers.push(cb); },
        finalMessage: async () => {
          if (calls < 2) throw overloaded();
          handlers.forEach(h => h('All good.'));
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'All good.' }] };
        },
      };
    } } });
    process.env.ANTHROPIC_API_KEY = 'fake-key-client-is-mocked';
    const got = [];
    let r;
    try { r = await anthropicAskZest('hi', [], [], 'student', '', { id: 'x', role: 'student' }, (t) => got.push(t)); }
    finally { process.env.ANTHROPIC_API_KEY = ''; }
    expect(r.text).toBe('All good.');
    expect(got).toEqual(['All good.']);
    expect(calls).toBe(2);
  });
});
