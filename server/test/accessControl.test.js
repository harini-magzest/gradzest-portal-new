const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const Role = require('../models/Role');
const ChatRoom = require('../models/ChatRoom');
const ActivityLog = require('../models/ActivityLog');
const { logActivity, initActivityLogger } = require('../middleware/logActivity');

let n = 0;
async function mk(role, extra = {}) {
  const email = `ac-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `AC ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });

describe('self-service profile edits cannot change privileges', () => {
  it('a student can edit profile fields but not role, assignment, lead stage, verification or staff data', async () => {
    const counselor = await mk('counselor');
    const other = await mk('counselor');
    const s = await mk('student', { counselorId: counselor.id });

    const res = await request(app).put('/api/students/me').set(as(s)).send({
      name: 'Renamed Student', phone: '+91 99999 00000',
      role: 'admin', isAppTeam: true, counselorId: other.id, status: 'enrolled', leadStage: 'enrolment', source: 'admin_created',
      emailVerified: false, lockedUntil: null, loginAttempts: 0, active: true, tags: ['vip'], summary: 'hacked',
      resetPasswordToken: 'x', hierarchyRole: new mongoose.Types.ObjectId(), assignedStudents: ['a'],
      documents: [{ name: 'forged.pdf', status: 'verified' }],
      counselorNotes: [{ author: 'Counselor', text: 'forged note' }],
      applications: [{ universityName: 'Forged', status: 'accepted', offerLetterUrl: 'https://evil.example/offer.pdf' }],
    });
    expect(res.status).toBe(200);

    const after = await User.findById(s.id).lean();
    expect(after.name).toBe('Renamed Student');
    expect(after.phone).toBe('+91 99999 00000');
    expect(after.role).toBe('student');
    expect(after.isAppTeam).toBeFalsy();
    expect(String(after.counselorId)).toBe(counselor.id);
    expect(after.status).not.toBe('enrolled');
    expect(after.leadStage).toBeFalsy();
    expect(after.tags || []).toHaveLength(0);
    expect(after.summary).toBeFalsy();
    expect(after.resetPasswordToken).toBeFalsy();
    expect(after.hierarchyRole).toBeFalsy();
    expect(after.documents || []).toHaveLength(0);
    expect(after.counselorNotes || []).toHaveLength(0);
    expect(after.applications || []).toHaveLength(0);
  });

  it('a counselor can edit their bio but cannot grant themselves a profile, a bigger team, students or flags', async () => {
    const c = await mk('counselor');
    const victim = await mk('student');
    const roleId = new mongoose.Types.ObjectId();
    const res = await request(app).put('/api/counselors/me').set(as(c)).send({
      bio: 'Updated bio', phone: '+91 88888 00000',
      profileId: new mongoose.Types.ObjectId(), hierarchyRole: roleId, assignedStudents: [victim.id],
      isAppTeam: true, active: false, role: 'admin', smartfloAgent: { agentId: 'x' }, lockedUntil: null,
    });
    expect(res.status).toBe(200);
    const after = await User.findById(c.id).lean();
    expect(after.bio).toBe('Updated bio');
    expect(after.phone).toBe('+91 88888 00000');
    expect(after.role).toBe('counselor');
    expect(after.profileId).toBeFalsy();
    expect(after.hierarchyRole).toBeFalsy();
    expect(after.assignedStudents || []).toHaveLength(0);
    expect(after.isAppTeam).toBeFalsy();
    expect(after.active).not.toBe(false);
  });
});

describe('applications', () => {
  async function studentWithApp() {
    const s = await mk('student');
    const created = await request(app).post('/api/applications').set(as(s)).send({ universityName: 'Uni', courseName: 'CS', passportNumber: 'P1234567' });
    expect(created.status).toBe(200);
    return { s, appId: created.body._id || created.body.id };
  }

  it('only the owner, an admin, or a counselor who can see that student may comment; others get 404 and no data', async () => {
    const { s, appId } = await studentWithApp();
    const stranger = await mk('student');
    const admin = await mk('admin');
    const post = (u) => request(app).post(`/api/applications/${appId}/comments`).set(as(u)).send({ text: 'hello' });

    const denied = await post(stranger);
    expect(denied.status).toBe(404);
    expect(JSON.stringify(denied.body)).not.toContain('P1234567'); // the other student's passport number must not leak

    expect((await post(s)).status).toBe(200);
    expect((await post(admin)).status).toBe(200);

    // A counselor restricted by the role hierarchy cannot reach a student outside their team.
    const topRole = await Role.create({ name: `lonely-${Date.now()}` });
    const restricted = await mk('counselor', { hierarchyRole: topRole._id });
    expect((await post(restricted)).status).toBe(404);

    // The stranger's attempt wrote nothing.
    const stored = await User.findById(s.id).lean();
    expect(stored.applications[0].comments.map((c) => c.text)).toEqual(['hello', 'hello']);
  });

  it('eligibility checks on a student the counselor cannot see are refused; bad ids get a 400, not a hang', async () => {
    const target = await mk('student');
    const topRole = await Role.create({ name: `lonely2-${Date.now()}` });
    const restricted = await mk('counselor', { hierarchyRole: topRole._id });
    const body = { universityId: 'u1', courseId: 'c1' };
    expect((await request(app).post('/api/applications/check-eligibility').set(as(restricted)).send({ ...body, studentId: target.id })).status).toBe(403);
    expect((await request(app).post('/api/applications/check-eligibility-bulk').set(as(restricted)).send({ universityId: 'u1', studentId: target.id })).status).toBe(403);
    expect((await request(app).post('/api/applications/check-eligibility').set(as(restricted)).send({ ...body, studentId: 'not-an-id' })).status).toBe(400);
  });
});

describe('activity feed is scoped to what each person may see', () => {
  it('students see only their own events, a counselor only their students\', admins everything', async () => {
    const counselor = await mk('counselor');
    const restricted = await mk('counselor', { hierarchyRole: (await Role.create({ name: `lonely3-${Date.now()}` }))._id });
    const a = await mk('student', { counselorId: counselor.id });
    const b = await mk('student');
    const admin = await mk('admin');
    // Registration auto-assigns students to counselors round-robin, so pin the assignments this test depends on.
    await User.updateOne({ _id: restricted.id }, { assignedStudents: [] });
    await User.updateOne({ _id: a.id }, { counselorId: counselor.id });
    await User.updateOne({ _id: b.id }, { counselorId: String(new mongoose.Types.ObjectId()) });
    const tag = `T${Date.now()}`;
    await ActivityLog.create({ studentId: a.id, studentName: 'A', type: 'payment', action: `${tag}-A`, detail: 'A paid' });
    await ActivityLog.create({ studentId: b.id, studentName: 'B', type: 'payment', action: `${tag}-B`, detail: 'B paid' });

    const actions = async (u) => (await request(app).get('/api/activity?limit=200').set(as(u))).body.events.map((e) => e.action).filter((x) => x.startsWith(tag)).sort();
    expect(await actions(a)).toEqual([`${tag}-A`]);
    expect(await actions(b)).toEqual([`${tag}-B`]);
    expect(await actions(counselor)).toEqual([`${tag}-A`]);
    expect(await actions(restricted)).toEqual([]);
    expect(await actions(admin)).toEqual([`${tag}-A`, `${tag}-B`]);

    // the per-type totals are scoped too
    const counts = (await request(app).get('/api/activity').set(as(b))).body.counts;
    expect(counts.payment).toBeGreaterThanOrEqual(1);
    const adminCounts = (await request(app).get('/api/activity').set(as(admin))).body.counts;
    expect(adminCounts.payment).toBeGreaterThan(counts.payment);
  });

  it('live activity is delivered to targeted rooms, never broadcast to every socket', async () => {
    const sent = [];
    const chain = (rooms) => ({ to: (r) => chain([...rooms, r]), emit: (ev, payload) => sent.push({ rooms, ev, payload }) });
    const io = { to: (r) => chain([r]), emit: vi.fn() };
    initActivityLogger(io);
    const studentId = new mongoose.Types.ObjectId();
    const counsellorId = new mongoose.Types.ObjectId();
    await logActivity('document', 'uploaded passport', 'detail', studentId, { studentName: 'Targeted', counsellorId });

    expect(io.emit).not.toHaveBeenCalled(); // no global broadcast
    expect(sent).toHaveLength(1);
    expect(sent[0].ev).toBe('new_activity');
    expect(sent[0].rooms.sort()).toEqual(['activity-room', `user:${counsellorId}`, `user:${studentId}`].sort());
    initActivityLogger(null);
  });
});

describe('chat rooms are private to their participants', () => {
  it('non-members cannot read, post to, relabel, mark-read or fetch a room by guessing participants', async () => {
    const student = await mk('student');
    const counselor = await mk('counselor');
    const intruder = await mk('student');

    const created = await request(app).post('/api/chat/rooms').set(as(student)).send({ participantIds: [student.id, counselor.id], participantNames: ['S', 'C'] });
    expect(created.status).toBe(200);
    const roomId = created.body.id || created.body._id;
    expect((await request(app).post(`/api/chat/rooms/${roomId}/messages`).set(as(student)).send({ content: 'private text', senderName: 'S' })).status).toBeLessThan(300);

    // members work
    expect((await request(app).get(`/api/chat/rooms/${roomId}`).set(as(counselor))).status).toBe(200);

    // an outsider is treated as if the room does not exist
    const read = await request(app).get(`/api/chat/rooms/${roomId}`).set(as(intruder));
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('private text');
    expect((await request(app).post(`/api/chat/rooms/${roomId}/messages`).set(as(intruder)).send({ content: 'pwned', senderName: 'Your Counselor' })).status).toBe(404);
    expect((await request(app).patch(`/api/chat/rooms/${roomId}`).set(as(intruder)).send({ type: 'group' })).status).toBe(404);
    expect((await request(app).post(`/api/chat/rooms/${roomId}/meetings`).set(as(intruder)).send({ senderName: 'x', meetingDate: '2030-01-01', meetingTime: '10:00' })).status).toBe(404);
    expect((await request(app).post(`/api/chat/rooms/${roomId}/files`).set(as(intruder))).status).toBe(404);

    // marking read from outside changes nothing
    await request(app).put(`/api/chat/rooms/${roomId}/read`).set(as(intruder));
    const room = await ChatRoom.findById(roomId).lean();
    expect(room.messages.map((m) => m.content)).toEqual(['private text']);
    expect(room.messages[0].read).toBe(false);
    expect(room.type).not.toBe('group');

    // asking for someone else's conversation by naming its participants is refused
    const spy = await request(app).post('/api/chat/rooms').set(as(intruder)).send({ participantIds: [student.id, counselor.id] });
    expect(spy.status).toBe(400);
    expect(JSON.stringify(spy.body)).not.toContain('private text');
    const spyCall = await request(app).post('/api/chat/rooms/call-log').set(as(intruder)).send({ participantIds: [student.id, counselor.id], callStatus: 'missed' });
    expect(spyCall.status).toBe(400);
  });

  it('a malformed room id and malformed participant lists are a clean 400', async () => {
    const u = await mk('student');
    // Malformed ids are refused by request validation (middleware/validate.js) before any lookup
    expect((await request(app).get('/api/chat/rooms/not-an-id').set(as(u))).status).toBe(400);
    expect((await request(app).post('/api/chat/rooms').set(as(u)).send({ participantIds: [u.id] })).status).toBe(400);
    expect((await request(app).post('/api/chat/rooms').set(as(u)).send({})).status).toBe(400);
  });
});

describe('student list respects the role hierarchy; the SOC excludes the Application Team', () => {
  it('a role-restricted counselor does not receive students outside their team', async () => {
    const outsider = await mk('student');
    const restricted = await mk('counselor', { hierarchyRole: (await Role.create({ name: `lonely4-${Date.now()}` }))._id });
    const res = await request(app).get('/api/students').set(as(restricted));
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id || s._id)).not.toContain(outsider.id);
  });

  it('Application Team accounts (role admin + isAppTeam) are refused by the SOC; full admins are not', async () => {
    const appTeam = await mk('admin', { isAppTeam: true });
    const admin = await mk('admin');
    expect((await request(app).get('/api/soc/stats').set(as(appTeam))).status).toBe(403);
    expect((await request(app).get('/api/soc/uploads').set(as(appTeam))).status).toBe(403);
    expect((await request(app).get('/api/soc/stats').set(as(admin))).status).toBe(200);
  });
});
