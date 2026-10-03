const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');

let n = 0;
async function login(role, name, extra = {}) {
  const email = `notes-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, name, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, body: res.body };
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('public and private student notes', () => {
  let a, b, admin, team, student;
  beforeAll(async () => {
    a = await login('counselor', 'Counselor A');
    b = await login('counselor', 'Counselor B');
    admin = await login('admin', 'Admin Person');
    team = await login('admin', 'Team Person', { isAppTeam: true });
    student = await login('student', 'Student S');
  });
  const notesOf = async (who) => (await request(app).get(`/api/students/${student.id}/notes`).set(auth(who.token))).body.notes;
  const add = (who, text, visibility) => request(app).post(`/api/students/${student.id}/notes`).set(auth(who.token)).send({ text, visibility });

  it('a private note is visible only to its author; a note is private unless marked public', async () => {
    const r = await add(a, 'A private thought', 'private');
    expect(r.status).toBe(201);
    expect(r.body.notes.find(x => x.text === 'A private thought')).toMatchObject({ visibility: 'private', mine: true, authorName: 'Counselor A' });

    await add(a, 'No visibility given');
    expect((await notesOf(a)).find(x => x.text === 'No visibility given').visibility).toBe('private');

    for (const other of [b, admin, team]) {
      const texts = (await notesOf(other)).map(x => x.text);
      expect(texts).not.toContain('A private thought');
      expect(texts).not.toContain('No visibility given');
    }
  });

  it('a public note is visible to every staff member who can open the student, with the author name', async () => {
    await add(a, 'Shared with the team', 'public');
    for (const other of [b, admin, team]) {
      const note = (await notesOf(other)).find(x => x.text === 'Shared with the team');
      expect(note).toMatchObject({ visibility: 'public', authorName: 'Counselor A', mine: false });
    }
  });

  it('only the author can edit a note or switch it between public and private', async () => {
    const created = await add(a, 'Editable', 'public');
    const id = created.body.notes.find(x => x.text === 'Editable').id;

    expect((await request(app).put(`/api/students/${student.id}/notes/${id}`).set(auth(b.token)).send({ text: 'hijacked' })).status).toBe(403);
    expect((await request(app).put(`/api/students/${student.id}/notes/${id}`).set(auth(admin.token)).send({ text: 'hijacked' })).status).toBe(403);

    const edited = await request(app).put(`/api/students/${student.id}/notes/${id}`).set(auth(a.token)).send({ text: 'Edited by A', visibility: 'private' });
    expect(edited.status).toBe(200);
    expect(edited.body.notes.find(x => x.id === id)).toMatchObject({ text: 'Edited by A', visibility: 'private' });
    // Now private: B can't see it, and can't even address it
    expect((await notesOf(b)).find(x => x.id === id)).toBeUndefined();
    expect((await request(app).put(`/api/students/${student.id}/notes/${id}`).set(auth(b.token)).send({ text: 'x' })).status).toBe(404);
  });

  it('the author can delete their note; an admin can remove a public note but not a private one', async () => {
    const pub = (await add(b, 'B public', 'public')).body.notes.find(x => x.text === 'B public').id;
    const priv = (await add(b, 'B private', 'private')).body.notes.find(x => x.text === 'B private').id;

    expect((await request(app).delete(`/api/students/${student.id}/notes/${pub}`).set(auth(a.token))).status).toBe(403);
    expect((await request(app).delete(`/api/students/${student.id}/notes/${priv}`).set(auth(admin.token))).status).toBe(404);
    expect((await request(app).delete(`/api/students/${student.id}/notes/${pub}`).set(auth(admin.token))).status).toBe(200);
    expect((await notesOf(b)).map(x => x.id)).not.toContain(pub);

    const own = await request(app).delete(`/api/students/${student.id}/notes/${priv}`).set(auth(b.token));
    expect(own.status).toBe(200);
    expect(own.body.notes.map(x => x.id)).not.toContain(priv);
  });

  it('notes written before visibility existed count as private', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(student.id) }, {
      $push: { counselorNotes: { _id: legacyId, text: 'Legacy note', counselorId: String(a.id), counselorName: 'Counselor A', createdAt: new Date() } },
    });
    expect((await notesOf(a)).find(x => x.id === String(legacyId))).toMatchObject({ visibility: 'private', mine: true });
    expect((await notesOf(b)).find(x => x.id === String(legacyId))).toBeUndefined();
  });

  it('notes never travel inside a user object — not to the student, not in staff lists or profiles', async () => {
    await add(a, 'Secret about the student', 'private');
    await add(a, 'Team-visible remark', 'public');

    const me = await request(app).get('/api/students/me').set(auth(student.token));
    expect(me.status).toBe(200);
    expect(me.body.counselorNotes).toBeUndefined();

    const authMe = await request(app).get('/api/auth/me').set(auth(student.token));
    expect(JSON.stringify(authMe.body)).not.toMatch(/Secret about the student|Team-visible remark/);

    const relog = await request(app).post('/api/auth/login').send({ email: student.body.user.email, password: 'TestPass123!' });
    expect(JSON.stringify(relog.body)).not.toMatch(/Secret about the student|Team-visible remark/);

    const profile = await request(app).get(`/api/students/${student.id}`).set(auth(b.token));
    expect(profile.body.counselorNotes).toBeUndefined();

    const list = await request(app).get('/api/students').set(auth(b.token));
    expect(JSON.stringify(list.body)).not.toMatch(/Secret about the student/);

    const adminList = await request(app).get('/api/admin/students').set(auth(admin.token));
    expect(JSON.stringify(adminList.body)).not.toMatch(/Secret about the student/);
  });

  it("the shared timeline never shows a note's text, and counts only notes the viewer can see", async () => {
    await add(a, 'Timeline must not show this', 'private');
    const rec = await request(app).get(`/api/students/${student.id}/record`).set(auth(b.token));
    expect(rec.status).toBe(200);
    expect(JSON.stringify(rec.body)).not.toMatch(/Timeline must not show this/);
    expect(rec.body.timeline.some(t => t.kind === 'note' && t.title === 'Private note added')).toBe(true);
    expect(rec.body.notesCount).toBe((await notesOf(b)).length);
  });
});
