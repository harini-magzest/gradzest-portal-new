const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { encrypt } = require('../lib/fieldCrypto');

let n = 0;
async function makeStudent(overrides = {}) {
  const email = `pii-${Date.now()}-${n++}@example.com`;
  const student = await User.create({
    name: 'Encryption Test Student', email, role: 'student', password: 'hashed-placeholder',
    dateOfBirth: '1999-05-17',
    passport: { number: 'P1234567', issueDate: '2020-01-01', expiryDate: '2030-01-01', issuingCountry: 'India' },
    address: { street: '221B Baker Street', city: 'London', state: '', country: 'UK', postalCode: 'NW1 6XE' },
    phone: '9876543210',
    ...overrides,
  });
  return student;
}

describe('User PII is encrypted at rest', () => {
  it('stores dateOfBirth, passport.* and address.* as ciphertext in MongoDB, but the app sees plaintext', async () => {
    const student = await makeStudent();
    expect(student.dateOfBirth).toBe('1999-05-17'); // post-save restores plaintext for the caller
    expect(student.passport.number).toBe('P1234567');
    expect(student.address.street).toBe('221B Baker Street');

    const raw = await User.collection.findOne({ _id: student._id });
    expect(raw.dateOfBirth).toMatch(/^enc:v1:/);
    expect(raw.passport.number).toMatch(/^enc:v1:/);
    expect(raw.passport.issueDate).toMatch(/^enc:v1:/);
    expect(raw.address.street).toMatch(/^enc:v1:/);
    expect(raw.address.city).toMatch(/^enc:v1:/);
    const dump = JSON.stringify(raw);
    expect(dump).not.toContain('1999-05-17');
    expect(dump).not.toContain('P1234567');
    expect(dump).not.toContain('Baker Street');

    const hydrated = await User.findById(student._id);
    expect(hydrated.dateOfBirth).toBe('1999-05-17');
    expect(hydrated.passport.number).toBe('P1234567');
    expect(hydrated.address.city).toBe('London');
    const lean = await User.findById(student._id).lean();
    expect(lean.passport.expiryDate).toBe('2030-01-01');
    expect(lean.address.postalCode).toBe('NW1 6XE');
  });

  it('exact-match queries on an encrypted path still work (the setter casts the filter value too)', async () => {
    const student = await makeStudent({ dateOfBirth: '1988-03-03' });
    const found = await User.findOne({ _id: student._id, dateOfBirth: '1988-03-03' }).lean();
    expect(found).toBeTruthy();
  });

  it('an aggregation $match needs the value pre-encrypted, same caveat as every other encrypted model', async () => {
    const student = await makeStudent({ dateOfBirth: '1977-07-07' });
    const rows = await User.aggregate([{ $match: { _id: student._id, dateOfBirth: encrypt('1977-07-07') } }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateOfBirth).toBe('1977-07-07'); // the aggregate post-hook still decrypts the output
  });

  it('leaves phone and altPhone as plaintext — encrypting them would break regex-based duplicate/search features', async () => {
    const student = await makeStudent({ phone: '9123456789', altPhone: '9123456780' });
    const raw = await User.collection.findOne({ _id: student._id });
    expect(raw.phone).toBe('9123456789');
    expect(raw.altPhone).toBe('9123456780');
  });

  it('the format-insensitive duplicate-phone regex (students.js findByPhone) still matches real rows', async () => {
    await makeStudent({ phone: '+91 98765-43210' });
    // Mirrors findByPhone()'s own pattern-building exactly: last 10 digits, formatting-agnostic.
    const digits = '9876543210';
    const pattern = new RegExp(`${digits.split('').join('\\D*')}\\D*$`);
    const match = await User.findOne({ role: 'student', phone: pattern }).select('name').lean();
    expect(match).toBeTruthy();
  });

  it('a normal register/login round trip still works with the plugin installed', async () => {
    const email = `pii-login-${Date.now()}@example.com`;
    const reg = await request(app).post('/api/auth/register').send({ name: 'Login Check', email, password: 'TestPass123!' });
    expect(reg.status).toBe(201);
    await User.findOneAndUpdate({ email }, { emailVerified: true });
    const login = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
  });
});
