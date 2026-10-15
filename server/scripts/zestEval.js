#!/usr/bin/env node
// Runs the Zest evaluation set (scripts/zestEval/cases.js) against the REAL configured model (Gemini or Anthropic,
// whichever key is in server/.env) over a throwaway in-memory database seeded with a small, fixed school:
// two counselors, four students, tasks, lead alerts, a university catalogue and a knowledge-base passage.
// Nothing touches your real data.
//
//   node scripts/zestEval.js                       run everything
//   node scripts/zestEval.js --only kb-visa-documents,no-guarantees
//   node scripts/zestEval.js --verbose             print full answers
//   node scripts/zestEval.js --out results.json    save machine-readable results
//   EVAL_DELAY_MS=8000 node scripts/zestEval.js    pause between cases (free tiers allow only a few requests/minute)
//
// Exit code is 1 when any case fails, so it can gate a deploy or run in CI once a key is available there.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.NODE_ENV = 'test';
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'a'.repeat(64);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'eval-only-secret';

const fs = require('fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('only')?.split(',').map(s => s.trim()).filter(Boolean);
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 5000);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DAY = 24 * 3600 * 1000;

async function seed() {
  const User = require('../models/User');
  const Task = require('../models/Task');
  const LeadAlert = require('../models/LeadAlert');
  const University = require('../models/University');
  const KnowledgeChunk = require('../models/KnowledgeChunk');

  const mkUser = (name, role, extra = {}) => User.create({ name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@eval.test`, password: 'x', role, status: 'active', emailVerified: true, ...extra });

  const c1 = await mkUser('Anita Eval', 'counselor');
  const c2 = await mkUser('Ravi Other', 'counselor');
  const admin = await mkUser('Hameed Admin', 'admin');
  const meera = await mkUser('Meera Nair', 'student', {
    counselorId: String(c1._id), status: 'visa_process', leadStageChangedAt: new Date(Date.now() - 3 * DAY),
    applications: [{ universityName: 'Zest Eval University of London', courseName: 'MBA in Global Business', status: 'offer_received', intake: 'September 2026' }],
    documents: [{ name: 'Bank statement', status: 'pending' }],
  });
  const priya = await mkUser('Priya Shah', 'student', { counselorId: String(c1._id), status: 'shortlisting', leadStageChangedAt: new Date(Date.now() - 30 * DAY) });
  const karan = await mkUser('Karan Singh', 'student', {
    counselorId: String(c2._id), status: 'shortlisting', leadStageChangedAt: new Date(Date.now() - 9 * DAY),
    applications: [{ universityName: 'Technische Eval Berlin', courseName: 'MSc Data Science', status: 'under_review', intake: 'October 2026' }],
  });
  const studentSelf = await mkUser('Student Eval', 'student', { counselorId: String(c2._id), status: 'counseling' });

  await Task.create({ title: 'Follow up with Meera on bank statement', assignedTo: c1._id, assignedBy: c1._id, status: 'pending', dueDate: new Date().toISOString().slice(0, 10), priority: 'high' });
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  await LeadAlert.create([
    { userId: priya._id, alertType: 'stale', severity: 'warning', detail: 'No stage movement for 30 days', counselorId: String(c1._id), flaggedOn: today },
    { userId: karan._id, alertType: 'stuck_application', severity: 'urgent', detail: 'Application under review for 25 days', counselorId: String(c2._id), flaggedOn: today },
  ]);
  await University.create([
    { id: 'eval-uni-london', name: 'Zest Eval University of London', country: 'United Kingdom', city: 'London', ranking: 8,
      courses: [{ name: 'MBA in Global Business', level: 'Postgraduate', duration: '1 year', tuitionFee: 30000, currency: 'GBP', intake: ['September'] }] },
    { id: 'eval-uni-berlin', name: 'Technische Eval Berlin', country: 'Germany', city: 'Berlin', ranking: 14,
      courses: [{ name: 'MSc Data Science', level: 'Postgraduate', duration: '2 years', tuitionFee: 1500, currency: 'EUR', intake: ['October'] }] },
  ]);
  // Knowledge-base documents are real records (admin's list_knowledge_documents reads them); the chunks point at them.
  const KnowledgeDocument = require('../models/KnowledgeDocument');
  const [ukDoc, caDoc] = await KnowledgeDocument.create([
    { title: 'UK Student Visa Guide', storagePath: '/uploads/eval-uk.pdf', uploadedBy: admin._id, status: 'ready', chunkCount: 1 },
    { title: 'Canada Study Permit Guide', storagePath: '/uploads/eval-canada.pdf', uploadedBy: admin._id, status: 'ready', chunkCount: 1 },
  ]);

  // A call tomorrow for Meera, and chats: Meera wrote last (a reply is owed), Priya's last message is the counselor's.
  const Meeting = require('../models/Meeting');
  const ChatRoom = require('../models/ChatRoom');
  const ChatMessage = require('../models/ChatMessage');
  const tomorrow = new Date(Date.now() + DAY).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  await Meeting.create({
    title: 'Visa interview prep call', scheduledDate: tomorrow, scheduledTime: '15:00', duration: 30, platform: 'zoom', status: 'scheduled',
    participants: [{ userId: String(meera._id), name: 'Meera Nair', role: 'student' }, { userId: String(c1._id), name: 'Anita Eval', role: 'counselor' }],
  });
  const chat = async (student, lines) => {
    const room = await ChatRoom.create({ participants: [String(c1._id), String(student._id)], participantNames: ['Anita Eval', student.name] });
    let t = Date.now() - lines.length * 60000;
    for (const [role, content] of lines) {
      const sender = role === 'student' ? student : c1;
      await ChatMessage.create({ roomId: room._id, senderId: String(sender._id), senderName: sender.name, senderRole: role, content, timestamp: new Date(t += 60000) });
    }
  };
  await chat(meera, [['counselor', 'Hi Meera, please send your bank statement when you can.'], ['student', "Hi ma'am, is a bank statement from my father's account acceptable for the visa?"]]);
  await chat(priya, [['student', 'Can we talk about shortlisting next week?'], ['counselor', 'Yes Priya, I will call you on Monday.']]);

  // What Zest was asked: two questions it had nothing to answer from, and one answer that was marked unhelpful.
  const ZestQueryLog = require('../models/ZestQueryLog');
  await ZestQueryLog.create([
    { userId: studentSelf._id, userRole: 'student', question: 'Do you offer accommodation help in Dublin?', answer: 'That is not in Gradzest materials yet.' },
    { userId: studentSelf._id, userRole: 'student', question: 'Do you offer accommodation help in Dublin?', answer: 'That is not in Gradzest materials yet.' },
    { userId: studentSelf._id, userRole: 'student', question: 'How long does a Canada study permit take?', answer: 'Typically 8 weeks.', toolsUsed: [], sourceDocIds: [caDoc._id],
      feedback: { rating: 'down', comment: 'Not in our documents', at: new Date() } },
  ]);

  await KnowledgeChunk.init();
  await KnowledgeChunk.create([
    { documentId: ukDoc._id, documentTitle: 'UK Student Visa Guide', order: 0,
      text: 'UK student visa (Student route) required documents: a valid passport, the Confirmation of Acceptance for Studies (CAS) from your university, a bank statement showing you have held the required funds for 28 consecutive days, proof of English language ability, your tuberculosis test result if you are from a listed country, and your ATAS certificate where your course requires it. Apply online up to six months before the course starts.' },
    { documentId: caDoc._id, documentTitle: 'Canada Study Permit Guide', order: 0,
      text: 'Canada study permit: letter of acceptance from a designated learning institution, proof of funds, valid passport, and a provincial attestation letter where required.' },
  ]);

  const who = (u) => ({ id: String(u._id), role: u.role, name: u.name, email: u.email });
  // `guest` is a signed-out visitor: no user record at all, exactly as routes/zest.js passes it.
  return { counselor: who(c1), admin: who(admin), student: who(studentSelf), meera: who(meera), priya: who(priya), guest: null };
}

function evaluate(c, { text, toolsUsed }) {
  const fails = [];
  const answer = text || '';
  if (!answer.trim()) fails.push('empty answer');
  for (const rx of c.must || []) if (!rx.test(answer)) fails.push(`answer should match ${rx}`);
  for (const rx of c.mustNot || []) if (rx.test(answer)) fails.push(`answer must NOT match ${rx}`);
  for (const t of c.tools || []) if (!toolsUsed.includes(t)) fails.push(`should have used tool ${t} (used: ${toolsUsed.join(', ') || 'none'})`);
  for (const t of c.noTools || []) if (toolsUsed.includes(t)) fails.push(`must not use tool ${t}`);
  if (c.minLength && answer.length < c.minLength) fails.push(`answer too short (${answer.length} < ${c.minLength}) — truncated?`);
  return fails;
}

(async () => {
  const { isZestConfigured, askZest } = require('../lib/zestModel');
  if (!isZestConfigured()) {
    console.error('No model key configured. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in server/.env first.');
    process.exit(2);
  }
  const provider = process.env.ANTHROPIC_API_KEY ? `Anthropic (${process.env.ZEST_MODEL || 'claude-haiku-4-5'})` : `Gemini (${process.env.GEMINI_MODEL || 'gemini-flash-latest'})`;

  const mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongod.getUri());
  const people = await seed();
  const { retrieveChunks } = require('../lib/zestRetrieval');
  const cases = require('./zestEval/cases').filter(c => !only || only.includes(c.id));

  console.log(`Zest evaluation — ${provider} — ${cases.length} case(s)\n`);
  const results = [];
  for (const c of cases) {
    if (!(c.as in people)) throw new Error(`case ${c.id}: unknown caller "${c.as}"`);
    const user = people[c.as]; // null for a signed-out visitor
    let outcome;
    const startedAt = Date.now();
    try {
      const history = c.history || [];
      const chunks = (await retrieveChunks(c.q, history)).map(m => ({ title: m.documentTitle, text: m.text }));
      const { text, toolsUsed } = await askZest(c.q, chunks, history, user ? user.role : 'guest', c.attached || '', user, null, {});
      const fails = evaluate(c, { text, toolsUsed });
      outcome = { id: c.id, ok: fails.length === 0, fails, toolsUsed, answer: text };
    } catch (err) {
      outcome = { id: c.id, ok: false, fails: [`error: ${err.message}`], toolsUsed: [], answer: '' };
    }
    outcome.ms = Date.now() - startedAt;
    results.push(outcome);
    const preview = (outcome.answer || '').replace(/\s+/g, ' ').slice(0, flag('verbose') ? 4000 : 220);
    console.log(`${outcome.ok ? 'PASS' : 'FAIL'}  ${c.id}   [${(outcome.ms / 1000).toFixed(1)}s, tools: ${outcome.toolsUsed.join(', ') || 'none'}]`);
    console.log(`      ${preview}`);
    for (const f of outcome.fails) console.log(`      ✗ ${f}`);
    if (DELAY_MS && c !== cases[cases.length - 1]) await sleep(DELAY_MS);
  }

  const passed = results.filter(r => r.ok).length;
  const times = results.map(r => r.ms).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : 0;
  console.log(`\n${passed}/${results.length} passed — median ${(median / 1000).toFixed(1)}s, slowest ${((times[times.length - 1] || 0) / 1000).toFixed(1)}s per answer`);
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify({ provider, ranAt: new Date().toISOString(), results }, null, 2));
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(passed === results.length ? 0 : 1);
})().catch((err) => { console.error('Evaluation crashed:', err); process.exit(3); });
