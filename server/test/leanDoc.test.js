// lib/leanDoc.js must give exactly the JSON that a hydrated document's toJSON() gives. This builds hundreds of randomly
// shaped student records straight from the schema (fields missing, nested objects empty or partial, arrays absent,
// encrypted values, secrets present; see helpers/randomStudents.js) and compares the two for every one of them. If the
// User model changes in a way the fast path does not follow, this is what fails.
const User = require('../models/User');
const { toClientJson } = require('../lib/leanDoc');
const { fieldsPresentOn } = require('../lib/logPiiAccess');
const { randomStudents, plain, firstDifference } = require('./helpers/randomStudents');

// LEANDOC_SEED / LEANDOC_COUNT let a developer run a bigger or different sweep; CI uses the defaults.
const COUNT = Number(process.env.LEANDOC_COUNT) || 400;
const SEED = Number(process.env.LEANDOC_SEED) || 20261014;
const tag = `leandoc-${Date.now()}`;
let ids = [];

beforeAll(async () => {
  const docs = randomStudents({ count: COUNT, seed: SEED, tag });
  await User.collection.insertMany(docs);
  ids = docs.map((d) => d._id);
});

const readBoth = async (select) => {
  const hydrated = await User.find({ _id: { $in: ids } }).select(select);
  const lean = await User.find({ _id: { $in: ids } }).select(select).lean();
  return { hydrated, byId: new Map(lean.map((d) => [String(d._id), d])) };
};

describe('toClientJson matches the hydrated toJSON()', () => {
  it(`for ${COUNT} randomly shaped student records, selected the way the list routes select them`, async () => {
    const { hydrated, byId } = await readBoth('-password');
    expect(hydrated).toHaveLength(COUNT);
    const problems = [];
    for (const doc of hydrated) {
      const fast = toClientJson(byId.get(String(doc._id)), User, { exclude: ['password'] });
      const diff = firstDifference(plain(doc.toJSON()), plain(fast));
      if (diff) problems.push(`${doc.email}: ${diff}`);
      if (problems.length >= 5) break;
    }
    expect(problems).toEqual([]);
  });

  it('shows the PII audit the same fields as a hydrated document does', async () => {
    const { hydrated, byId } = await readBoth('-password');
    const problems = [];
    for (const doc of hydrated) {
      const fast = toClientJson(byId.get(String(doc._id)), User, { exclude: ['password'] });
      const a = fieldsPresentOn(doc).sort().join(',');
      const b = fieldsPresentOn(fast, Object.keys(User.schema.nested)).sort().join(',');
      if (a !== b) problems.push(`${doc.email}: hydrated=[${a}] lean=[${b}]`);
      if (problems.length >= 5) break;
    }
    expect(problems).toEqual([]);
  });

  it('never carries a secret, even when the stored record has one', async () => {
    const lean = await User.find({ _id: { $in: ids } }).select('-password').lean();
    for (const d of lean) {
      const out = plain(toClientJson(d, User, { exclude: ['password'] }));
      for (const k of ['password', 'sessions', 'emailVerifyToken', 'emailVerifyExpires', 'resetPasswordToken', 'resetPasswordExpires', 'loginAttempts', 'counselorNotes']) {
        expect(out[k], k).toBeUndefined();
      }
      if (out.twoFactor) expect(Object.keys(out.twoFactor)).toEqual(['enabled']);
    }
  });

  it('matches for a narrowed ?fields= selection too', async () => {
    const fields = ['name', 'email', 'status', 'applications', 'onboarding', 'twoFactor'];
    const { hydrated, byId } = await readBoth(fields.join(' '));
    const problems = [];
    for (const doc of hydrated) {
      const fast = toClientJson(byId.get(String(doc._id)), User, { only: fields });
      const diff = firstDifference(plain(doc.toJSON()), plain(fast));
      if (diff) problems.push(`${doc.email}: ${diff}`);
      if (problems.length >= 5) break;
    }
    expect(problems).toEqual([]);
  });
});
