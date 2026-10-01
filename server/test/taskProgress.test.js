const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');

let n = 0;
async function login(role) {
  const email = `taskprog-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `Task ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('task progress', () => {
  it('records each status change with who made it and an optional note', async () => {
    const admin = await login('admin');
    const counselor = await login('counselor');
    const created = await request(app).post('/api/tasks').set(auth(admin.token))
      .send({ title: 'Follow up with lead', assignedTo: counselor.id });
    expect(created.status).toBe(201);
    const id = created.body._id;

    const started = await request(app).put(`/api/tasks/${id}`).set(auth(counselor.token))
      .send({ status: 'in_progress', note: 'Called him, sending brochure' });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');
    expect(started.body.history).toHaveLength(1);
    expect(started.body.history[0]).toMatchObject({
      from: 'pending', to: 'in_progress', note: 'Called him, sending brochure', by: 'Task counselor', byRole: 'counselor',
    });

    const held = await request(app).put(`/api/tasks/${id}`).set(auth(counselor.token)).send({ status: 'on_hold' });
    expect(held.body.history).toHaveLength(2);
    expect(held.body.history[1]).toMatchObject({ from: 'in_progress', to: 'on_hold', note: '' });

    // Re-sending the current status is not a change
    const same = await request(app).put(`/api/tasks/${id}`).set(auth(counselor.token)).send({ status: 'on_hold' });
    expect(same.body.history).toHaveLength(2);
  });

  it('rejects unknown statuses and people outside the task', async () => {
    const admin = await login('admin');
    const counselor = await login('counselor');
    const outsider = await login('counselor');
    const { body } = await request(app).post('/api/tasks').set(auth(admin.token))
      .send({ title: 'Check docs', assignedTo: counselor.id });
    expect((await request(app).put(`/api/tasks/${body._id}`).set(auth(counselor.token)).send({ status: 'done-ish' })).status).toBe(400);
    expect((await request(app).put(`/api/tasks/${body._id}`).set(auth(outsider.token)).send({ status: 'completed' })).status).toBe(403);
  });
});
