const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const { createRoom } = require('./helpers');

let n = 0;
async function login(role, name = `Call ${role}`) {
  const email = `callsum-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: String(res.body.user.id), name };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// A finished in-app call between a counselor and a student, as the call-log route stores it
async function makeCall(counselor, student, at = new Date()) {
  const { messages } = await createRoom({
    participants: [counselor.id, student.id], participantNames: [counselor.name, student.name],
    messages: [{ senderId: counselor.id, senderName: counselor.name, type: 'call', callStatus: 'answered', callDuration: 95, timestamp: at }],
  });
  return String(messages[0]._id);
}

describe('call summaries', () => {
  it('a counselor on the call can write and edit its summary, and it shows in call history', async () => {
    const counselor = await login('counselor', 'Dr. Asha');
    const student = await login('student', 'Ravi');
    const callId = await makeCall(counselor, student);

    const first = await request(app).put(`/api/chat/calls/${callId}/summary`).set(auth(counselor.token))
      .send({ summary: 'Discussed UK shortlist; sending SOP draft Friday' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ callId, summary: 'Discussed UK shortlist; sending SOP draft Friday', summaryBy: 'Dr. Asha' });

    await request(app).put(`/api/chat/calls/${callId}/summary`).set(auth(counselor.token)).send({ summary: 'Edited summary' });

    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const hist = await request(app).get(`/api/chat/calls/history?days=7&since=${encodeURIComponent(midnight.toISOString())}`)
      .set(auth(counselor.token));
    expect(hist.status).toBe(200);
    const call = hist.body.calls.find(c => c.id === callId);
    expect(call).toMatchObject({ summary: 'Edited summary', summaryBy: 'Dr. Asha', calleeName: 'Ravi' });
  });

  it("'since' limits history to calls from that point on", async () => {
    const counselor = await login('counselor');
    const student = await login('student');
    const today = await makeCall(counselor, student);
    const yesterday = await makeCall(counselor, student, new Date(Date.now() - 2 * 86400000));
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const { body } = await request(app).get(`/api/chat/calls/history?days=7&since=${encodeURIComponent(midnight.toISOString())}`)
      .set(auth(counselor.token));
    const ids = body.calls.map(c => c.id);
    expect(ids).toContain(today);
    expect(ids).not.toContain(yesterday);
  });

  it('students, staff who were not on the call, and empty summaries are rejected', async () => {
    const counselor = await login('counselor');
    const other = await login('counselor');
    const student = await login('student');
    const callId = await makeCall(counselor, student);
    const put = (who, body) => request(app).put(`/api/chat/calls/${callId}/summary`).set(auth(who.token)).send(body);
    expect((await put(student, { summary: 'hi' })).status).toBe(403);
    expect((await put(other, { summary: 'hi' })).status).toBe(404);
    expect((await put(counselor, { summary: '   ' })).status).toBe(400);
  });
});

describe('counselor performance', () => {
  it("a counselor sees their own calls today, with summaries and a summary count; admins see the same", async () => {
    const counselor = await login('counselor', 'Dr. Meena');
    const student = await login('student', 'Arjun');
    const admin = await login('admin');
    const written = await makeCall(counselor, student);
    await makeCall(counselor, student); // answered, no summary yet
    await request(app).put(`/api/chat/calls/${written}/summary`).set(auth(counselor.token)).send({ summary: 'Shortlisted 3 courses' });

    const mine = await request(app).get('/api/counselors/me/performance?days=1').set(auth(counselor.token));
    expect(mine.status).toBe(200);
    expect(mine.body.calls).toMatchObject({ total: 2, answered: 2, summarised: 1 });
    const entry = mine.body.timeline.find(t => t.call?.id === written);
    expect(entry.call).toMatchObject({ summary: 'Shortlisted 3 courses', summaryBy: 'Dr. Meena', callerId: counselor.id, calleeName: 'Arjun' });

    const viaAdmin = await request(app).get(`/api/admin/counselors/${counselor.id}/performance?days=1`).set(auth(admin.token));
    expect(viaAdmin.status).toBe(200);
    expect(viaAdmin.body.calls.summarised).toBe(1);
  });

  it('only counselors can load their own performance', async () => {
    const student = await login('student');
    expect((await request(app).get('/api/counselors/me/performance').set(auth(student.token))).status).toBe(403);
  });
});
