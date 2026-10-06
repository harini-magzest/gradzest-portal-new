const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Task = require('../models/Task');
const StaffActivity = require('../models/StaffActivity');
const { validateBulk, MAX_IDS } = require('../lib/bulkActions');

const STAGES = { interested: 'Interested', counselling: 'Counselling' };
const oid = (n) => n.toString(16).padStart(24, '0');

describe('validateBulk', () => {
  const staff = { role: 'counselor' };
  it('accepts well-formed requests and normalises the value', () => {
    expect(validateBulk({ ids: [oid(1), oid(1), oid(2)], action: 'set_stage', value: 'interested' }, staff, STAGES)).toEqual({ ids: [oid(1), oid(2)], action: 'set_stage', value: 'interested' });
    expect(validateBulk({ ids: [oid(1)], action: 'add_tag', value: '  hot  ' }, staff, STAGES).value).toBe('hot');
    expect(validateBulk({ ids: [oid(1)], action: 'create_task', value: { title: ' Call ', dueDate: '2026-10-10', priority: 'urgent' } }, staff, STAGES).value)
      .toEqual({ title: 'Call', dueDate: '2026-10-10', priority: 'medium' }); // unknown priority falls back
  });
  it('rejects bad input before anything is touched', () => {
    const bad = (body, user = staff) => validateBulk(body, user, STAGES).error;
    expect(bad({ ids: [oid(1)], action: 'delete_all' })).toMatch(/action must be/);
    expect(bad({ ids: [], action: 'add_tag', value: 'x' })).toMatch(/at least one/);
    expect(bad({ ids: ['nope'], action: 'add_tag', value: 'x' })).toMatch(/not valid/);
    expect(bad({ ids: Array.from({ length: MAX_IDS + 1 }, (_, i) => oid(i + 1)), action: 'add_tag', value: 'x' })).toMatch(/up to 100/);
    expect(bad({ ids: [oid(1)], action: 'set_stage', value: 'made_up' })).toMatch(/Invalid lead stage/);
    expect(bad({ ids: [oid(1)], action: 'add_tag', value: '   ' })).toMatch(/empty/);
    expect(bad({ ids: [oid(1)], action: 'create_task', value: { title: '' } })).toMatch(/title/);
    expect(bad({ ids: [oid(1)], action: 'create_task', value: { title: 'x', dueDate: 'tomorrow' } })).toMatch(/YYYY-MM-DD/);
  });
  it('keeps reassign for admins', () => {
    expect(validateBulk({ ids: [oid(1)], action: 'reassign', value: oid(9) }, staff, STAGES)).toMatchObject({ status: 403 });
    expect(validateBulk({ ids: [oid(1)], action: 'reassign', value: '' }, { role: 'admin' }, STAGES)).toEqual({ ids: [oid(1)], action: 'reassign', value: null });
  });
});

let n = 0;
async function mk(role, extra = {}) {
  const email = `bulk-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `B ${role} ${n}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id };
}
const as = (u) => ({ Authorization: `Bearer ${u.token}` });
const bulk = (u, body) => request(app).post('/api/students/bulk').set(as(u)).send(body);

describe('POST /api/students/bulk', () => {
  it('moves many students to a stage, skipping ones already there, and records it', async () => {
    const counselor = await mk('counselor');
    const a = await mk('student', { counselorId: counselor.id, leadStage: 'new_enquiry' });
    const b = await mk('student', { counselorId: counselor.id, leadStage: 'new_enquiry' });
    const c = await mk('student', { counselorId: counselor.id, leadStage: 'interested' });
    const res = await bulk(counselor, { ids: [a.id, b.id, c.id], action: 'set_stage', value: 'interested' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ requested: 3, updated: 2, unchanged: 1, skipped: [] });
    expect((await User.findById(a.id)).leadStage).toBe('interested');
    expect(await StaffActivity.countDocuments({ title: 'Lead Stage updated (bulk)', studentId: a.id })).toBe(1);
  });

  it('tags students without duplicating a tag they already have', async () => {
    const admin = await mk('admin');
    const a = await mk('student', { tags: ['Priority'] });
    const b = await mk('student');
    const res = await bulk(admin, { ids: [a.id, b.id], action: 'add_tag', value: 'priority' });
    expect(res.body).toMatchObject({ updated: 1, unchanged: 1 });
    expect((await User.findById(b.id)).tags).toEqual(['priority']);
  });

  it('creates one follow-up task per student for the person acting', async () => {
    const counselor = await mk('counselor');
    const a = await mk('student', { counselorId: counselor.id });
    const b = await mk('student', { counselorId: counselor.id });
    const res = await bulk(counselor, { ids: [a.id, b.id], action: 'create_task', value: { title: 'Chase documents', dueDate: '2030-01-01', priority: 'high' } });
    expect(res.body.updated).toBe(2);
    const tasks = await Task.find({ studentId: { $in: [a.id, b.id] } }).lean();
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => String(t.assignedTo) === counselor.id && t.priority === 'high' && t.title === 'Chase documents')).toBe(true);
  });

  it('reports a missing student and one the caller may not change, without stopping the rest', async () => {
    const counselor = await mk('counselor');
    const mine = await mk('student', { counselorId: counselor.id });
    const ghost = oid(123456);
    const res = await bulk(counselor, { ids: [mine.id, ghost], action: 'add_tag', value: 'x' });
    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toEqual([{ id: ghost, name: '', reason: 'not_found' }]);
  });

  it('lets only an admin reassign, moving the student between counselors', async () => {
    const admin = await mk('admin');
    const from = await mk('counselor');
    const to = await mk('counselor');
    const s = await mk('student', { counselorId: from.id });
    await User.findByIdAndUpdate(from.id, { $addToSet: { assignedStudents: s.id } });

    expect((await bulk(from, { ids: [s.id], action: 'reassign', value: to.id })).status).toBe(403);
    const res = await bulk(admin, { ids: [s.id], action: 'reassign', value: to.id });
    expect(res.body.updated).toBe(1);
    expect(String((await User.findById(s.id)).counselorId)).toBe(to.id);
    expect((await User.findById(from.id)).assignedStudents).not.toContain(s.id);
    expect((await User.findById(to.id)).assignedStudents).toContain(s.id);

    const un = await bulk(admin, { ids: [s.id], action: 'reassign', value: '' });
    expect(un.body.updated).toBe(1);
    expect((await User.findById(s.id)).counselorId).toBeFalsy();
    expect((await bulk(admin, { ids: [s.id], action: 'reassign', value: oid(777) })).status).toBe(400); // no such counselor
  });

  it('is for staff only and validates the request', async () => {
    const student = await mk('student');
    const counselor = await mk('counselor');
    expect((await bulk(student, { ids: [student.id], action: 'add_tag', value: 'x' })).status).toBe(403);
    expect((await bulk(counselor, { ids: [], action: 'add_tag', value: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/students/bulk').send({})).status).toBe(401);
  });
});
