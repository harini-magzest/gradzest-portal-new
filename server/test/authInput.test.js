const request = require('supertest');
const { app } = require('../app');

// A JSON object, number, boolean or array where a string is expected used to reach email.toLowerCase() or bcrypt and surface
// as a 500 "Server error". It is a bad request, and should say so.
const NOT_STRINGS = [
  ['an operator object', { $ne: null }],
  ['a number', 12345],
  ['a boolean', true],
  ['an array', ['someone@example.com']],
];

describe('auth routes answer 400, not 500, when a field is not a string', () => {
  it.each(NOT_STRINGS)('login: email is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/login').send({ email: value, password: 'whatever-it-is' });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('login: password is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/login').send({ email: 'someone@example.com', password: value });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('sign-up: email is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test Person', email: value, password: 'TestPass123!' });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('sign-up: password is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test Person', email: 'newperson@example.com', password: value });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('sign-up: name is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/register').send({ name: value, email: 'newperson2@example.com', password: 'TestPass123!' });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('forgot-password: email is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: value });
    expect(res.status).toBe(400);
  });

  it.each(NOT_STRINGS)('resend-verification: email is %s', async (_label, value) => {
    const res = await request(app).post('/api/auth/resend-verification').send({ email: value });
    expect(res.status).toBe(400);
  });

  it('still treats a well-formed login for an unknown account as 401 (the check only rejects wrong types)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody-here@example.com', password: 'WrongPass123!' });
    expect(res.status).toBe(401);
  });

  it('still rejects an empty email or password with 400', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: '', password: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: '' })).status).toBe(400);
  });
});
