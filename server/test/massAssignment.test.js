const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Meeting = require('../models/Meeting');

let n = 0;
async function login(role) {
  const email = `mass-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'Mass Test', email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('mass assignment', () => {
  it('a student cannot inject staff-controlled fields when applying', async () => {
    const { token, id } = await login('student');
    const res = await request(app).post('/api/applications').set(auth(token)).send({
      universityName: 'Test Uni', courseName: 'CS', intake: 'Fall 2027',
      offerLetterUrl: 'https://evil.example/fake-offer.pdf', offerType: 'unconditional', rejectedFrom: 'x',
      comments: [{ author: 'Admin', authorRole: 'admin', text: 'Approved by admin' }],
      notes: 'staff only', status: 'enrolled', studentId: 'someone-else',
    });
    expect(res.status).toBe(200);
    expect(res.body.universityName).toBe('Test Uni');
    expect(res.body.intake).toBe('Fall 2027');
    expect(res.body.offerLetterUrl).toBeUndefined();
    expect(res.body.offerType).toBeUndefined();
    expect(res.body.notes).toBeUndefined();
    expect(res.body.comments).toHaveLength(0);
    expect(res.body.status).toBe('submitted');
    expect(String(res.body.studentId)).toBe(String(id));
  });

  it('a meeting creator cannot rewrite ownership or internal fields via PUT, but can edit normal ones', async () => {
    const { token, id } = await login('counselor');
    const created = await request(app).post('/api/meetings').set(auth(token)).send({
      title: 'Original', scheduledDate: '2030-01-01', scheduledTime: '10:00', platform: 'other',
    });
    expect(created.status).toBeLessThan(300);
    const meetingId = created.body._id;

    const res = await request(app).put(`/api/meetings/${meetingId}`).set(auth(token)).send({
      title: 'Renamed', createdBy: 'attacker', createdByName: 'Attacker', remindersSent: ['24h', '1h'],
    });
    expect(res.status).toBe(200);
    const stored = await Meeting.findById(meetingId).lean();
    expect(stored.title).toBe('Renamed');
    expect(stored.createdBy).toBe(String(id));
    expect(stored.createdByName).not.toBe('Attacker');
    expect(stored.remindersSent).toEqual([]);
  });
});
