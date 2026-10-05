const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const { getToolsForRole, executeTool } = require('../lib/zestTools');

let n = 0;
async function mk(role, extra = {}) {
  const email = `zesttools-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `ZT ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}

describe('which tools each role is offered', () => {
  it('students get only the catalogue search; counselors and admins get every tool', () => {
    expect(getToolsForRole('student').map(t => t.name)).toEqual(['search_universities']);
    const staff = ['list_my_open_tasks', 'list_my_students', 'list_open_lead_alerts', 'lookup_student_status', 'pipeline_summary', 'search_universities'];
    expect(getToolsForRole('counselor').map(t => t.name).sort()).toEqual(staff);
    expect(getToolsForRole('admin').map(t => t.name).sort()).toEqual(staff);
  });
});

describe('lookup_student_status scoping', () => {
  it('a student always gets their own record, ignoring whatever query is passed', async () => {
    const student = await mk('student', { name: 'Self Lookup Student' });
    const result = await executeTool('lookup_student_status', { query: 'someone else entirely' }, { id: student.id, role: 'student' });
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('Self Lookup Student');
  });

  it("a counselor only finds students assigned to them, never another counselor's", async () => {
    const counselorA = await mk('counselor');
    const counselorB = await mk('counselor');
    const myStudent = await mk('student', { name: 'Owned By A', counselorId: counselorA.id });
    await mk('student', { name: 'Owned By B', counselorId: counselorB.id });

    const found = await executeTool('lookup_student_status', { query: 'Owned By A' }, { id: counselorA.id, role: 'counselor' });
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0].name).toBe('Owned By A');

    const notFound = await executeTool('lookup_student_status', { query: 'Owned By B' }, { id: counselorA.id, role: 'counselor' });
    expect(notFound.error).toBeTruthy();
    expect(notFound.matches).toBeUndefined();
    void myStudent;
  });

  it('an admin can find any student', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    await mk('student', { name: 'Admin Findable Student', counselorId: counselor.id });

    const found = await executeTool('lookup_student_status', { query: 'Admin Findable Student' }, { id: admin.id, role: 'admin' });
    expect(found.matches).toHaveLength(1);
  });

  it('returns a plain error object, not a throw, when nothing matches', async () => {
    const admin = await mk('admin');
    const result = await executeTool('lookup_student_status', { query: 'Nobody Matches This XYZ' }, { id: admin.id, role: 'admin' });
    expect(result.error).toBeTruthy();
  });
});

describe('list_my_open_tasks scoping', () => {
  it('only returns the caller\'s own open tasks, not everyone\'s', async () => {
    const counselorA = await mk('counselor');
    const counselorB = await mk('counselor');
    await Task.create({ title: 'A\'s task', assignedTo: counselorA.id, assignedBy: counselorA.id, status: 'pending' });
    await Task.create({ title: 'B\'s task', assignedTo: counselorB.id, assignedBy: counselorB.id, status: 'pending' });
    await Task.create({ title: 'A\'s completed task', assignedTo: counselorA.id, assignedBy: counselorA.id, status: 'completed' });

    const result = await executeTool('list_my_open_tasks', {}, { id: counselorA.id, role: 'counselor' });
    expect(result.tasks.map(t => t.title)).toEqual(['A\'s task']);
  });

  it('is not available to students', async () => {
    const student = await mk('student');
    const result = await executeTool('list_my_open_tasks', {}, { id: student.id, role: 'student' });
    expect(result.error).toBeTruthy();
  });
});

describe('list_open_lead_alerts scoping', () => {
  it("a counselor only sees alerts for their own leads", async () => {
    const counselorA = await mk('counselor');
    const counselorB = await mk('counselor');
    await LeadAlert.create({ userId: counselorA.id, alertType: 'stale', severity: 'warning', detail: 'A\'s alert', counselorId: counselorA.id, flaggedOn: new Date() });
    await LeadAlert.create({ userId: counselorB.id, alertType: 'stale', severity: 'warning', detail: 'B\'s alert', counselorId: counselorB.id, flaggedOn: new Date() });

    const result = await executeTool('list_open_lead_alerts', {}, { id: counselorA.id, role: 'counselor' });
    expect(result.alerts.map(a => a.detail)).toEqual(['A\'s alert']);
  });

  it('an admin sees all open alerts regardless of counselor', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    await LeadAlert.create({ userId: counselor.id, alertType: 'duplicate', severity: 'urgent', detail: 'Visible to admin', counselorId: counselor.id, flaggedOn: new Date() });

    const result = await executeTool('list_open_lead_alerts', {}, { id: admin.id, role: 'admin' });
    expect(result.alerts.some(a => a.detail === 'Visible to admin')).toBe(true);
  });
});

describe('executeTool error handling', () => {
  it('returns an error object for an unknown tool name instead of throwing', async () => {
    const result = await executeTool('delete_everything', {}, { id: 'x', role: 'admin' });
    expect(result.error).toBeTruthy();
  });
});
