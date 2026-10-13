const request = require('supertest');
const { app } = require('../app');
const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const { createRoom } = require('./helpers');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const ZestQueryLog = require('../models/ZestQueryLog');
const Meeting = require('../models/Meeting');
const { getToolsForRole, executeTool, statusFor } = require('../lib/zestTools');

let n = 0;
async function mk(role, extra = {}) {
  const email = `zesttools-${role}-${Date.now()}-${n++}@example.com`;
  await request(app).post('/api/auth/register').send({ name: `ZT ${role}`, email, password: 'TestPass123!' });
  await User.findOneAndUpdate({ email }, { emailVerified: true, role, ...extra });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
  return { token: res.body.token, id: res.body.user.id, email };
}

describe('which tools each role is offered', () => {
  it('students get the catalogue and their own progress; counselors the staff tools; admins also the Zest-management ones', () => {
    expect(getToolsForRole('student').map(t => t.name).sort()).toEqual(['my_status', 'my_upcoming', 'search_universities']);
    const staff = ['draft_followup_message', 'get_chat_for_reply', 'list_my_open_tasks', 'list_my_students', 'list_open_lead_alerts', 'lookup_student_status', 'pipeline_summary', 'search_universities'];
    expect(getToolsForRole('counselor').map(t => t.name).sort()).toEqual([...staff, 'my_day_brief'].sort());
    expect(getToolsForRole('admin').map(t => t.name).sort()).toEqual([...staff, 'conversion_report', 'get_zest_insights', 'list_knowledge_documents'].sort());
  });

  it('keeps each role-specific tool away from the other roles', () => {
    const names = (role) => getToolsForRole(role).map(t => t.name);
    for (const studentOnly of ['my_status', 'my_upcoming']) {
      expect(names('counselor')).not.toContain(studentOnly);
      expect(names('admin')).not.toContain(studentOnly);
    }
    expect(names('admin')).not.toContain('my_day_brief'); // built from the caller's own students
    expect(names('student')).not.toContain('my_day_brief');
    expect(names('counselor')).not.toContain('conversion_report');
    expect(names('student')).not.toContain('conversion_report');
  });

  it('no tool offered to a student can name another person', () => {
    for (const t of getToolsForRole('student')) {
      expect(Object.keys(t.input_schema.properties || {})).not.toContain('student');
      expect(Object.keys(t.input_schema.properties || {})).not.toContain('query');
    }
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

describe('list_open_lead_alerts names the lead', () => {
  it('shows the lead to a counselor, and the lead plus their counselor to an admin', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor', { name: 'Alert Counselor' });
    const lead = await mk('student', { name: 'Alert Lead Person', counselorId: counselor.id });
    await LeadAlert.create({ userId: lead.id, alertType: 'stale', severity: 'warning', detail: 'No movement in 9 days', counselorId: counselor.id, flaggedOn: new Date() });

    const asCounselor = await executeTool('list_open_lead_alerts', {}, { id: counselor.id, role: 'counselor' });
    expect(asCounselor.alerts[0].lead).toBe('Alert Lead Person');
    expect(asCounselor.alerts[0]).not.toHaveProperty('counselor');

    const asAdmin = await executeTool('list_open_lead_alerts', {}, { id: admin.id, role: 'admin' });
    const mine = asAdmin.alerts.find(a => a.detail === 'No movement in 9 days');
    expect(mine).toMatchObject({ lead: 'Alert Lead Person', counselor: 'Alert Counselor' });
    expect(asAdmin.total).toBeGreaterThanOrEqual(1);
  });
});

describe('my_status', () => {
  it("returns the student's own record and counselor, whatever input is passed", async () => {
    const counselor = await mk('counselor', { name: 'Status Counselor' });
    const student = await mk('student', { name: 'Status Student', counselorId: counselor.id });
    const other = await mk('student', { name: 'Someone Else Entirely' });

    const result = await executeTool('my_status', { query: 'Someone Else Entirely', student: other.id }, { id: student.id, role: 'student' });
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('Status Student');
    expect(result.counselor).toBe('Status Counselor');
    expect(JSON.stringify(result)).not.toContain('Someone Else Entirely');
    expect(Array.isArray(result.documentChecklist)).toBe(true);
  });

  it('is for students only', async () => {
    const counselor = await mk('counselor');
    expect((await executeTool('my_status', {}, { id: counselor.id, role: 'counselor' })).error).toBeTruthy();
  });

  it("includes the same next step the student's dashboard shows, and where to do it", async () => {
    const student = await mk('student');
    const result = await executeTool('my_status', {}, { id: student.id, role: 'student' });
    expect(result.nextStep.title).toEqual(expect.any(String));
    expect(result.nextStep.title.length).toBeGreaterThan(0);
    expect(result.nextStep.detail).toEqual(expect.any(String));
    expect(result.nextStep.where).toMatch(/^\/student\//);
  });
});

describe('my_upcoming', () => {
  const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const meeting = (title, scheduledDate, participants, extra = {}) => Meeting.create({
    title, scheduledDate, scheduledTime: '10:00', participants, ...extra,
  });
  const intakeInDays = (days) => {
    const d = new Date(Date.now() + days * 86400000);
    return `${d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
  };

  it("lists the student's own scheduled meetings soonest first, with who they are with, and nobody else's", async () => {
    const student = await mk('student');
    const other = await mk('student');
    const counselor = await mk('counselor', { name: 'Meeting Counselor' });
    const people = (id) => [{ userId: id, name: 'S', role: 'student' }, { userId: counselor.id, name: 'Meeting Counselor', role: 'counselor' }];
    await meeting('Later call', isoDate(5), people(student.id));
    await meeting('Sooner call', isoDate(2), people(student.id));
    await meeting('Not mine', isoDate(1), people(other.id));

    const result = await executeTool('my_upcoming', {}, { id: student.id, role: 'student' });
    expect(result.meetings.map(m => m.title)).toEqual(['Sooner call', 'Later call']);
    expect(result.meetings[0]).toMatchObject({ date: isoDate(2), time: '10:00', with: ['Meeting Counselor'] });
    expect(JSON.stringify(result)).not.toContain('Not mine');
  });

  it('leaves out cancelled and completed meetings and ones that already happened', async () => {
    const student = await mk('student');
    const mine = [{ userId: student.id, name: 'S', role: 'student' }];
    await meeting('Cancelled one', isoDate(3), mine, { status: 'cancelled' });
    await meeting('Completed one', isoDate(3), mine, { status: 'completed' });
    await meeting('Yesterday call', isoDate(-1), mine);
    await meeting('Tomorrow call', isoDate(1), mine);

    const result = await executeTool('my_upcoming', {}, { id: student.id, role: 'student' });
    expect(result.meetings.map(m => m.title)).toEqual(['Tomorrow call']);
  });

  it('lists the intakes of open applications soonest first, skipping rejected, enrolled and past ones', async () => {
    const student = await mk('student', {
      applications: [
        { universityName: 'Far Uni', courseName: 'MSc Far', status: 'submitted', intake: intakeInDays(200) },
        { universityName: 'Near Uni', courseName: 'MSc Near', status: 'under_review', intake: intakeInDays(45) },
        { universityName: 'Rejected Uni', courseName: 'MSc No', status: 'rejected', intake: intakeInDays(30) },
        { universityName: 'Past Uni', courseName: 'MSc Past', status: 'submitted', intake: 'January 2020' },
      ],
    });

    const result = await executeTool('my_upcoming', {}, { id: student.id, role: 'student' });
    expect(result.intakes.map(i => i.university)).toEqual(['Near Uni', 'Far Uni']);
    expect(result.intakes[0].daysAway).toBeGreaterThanOrEqual(0);
    expect(result.intakes[0]).toMatchObject({ course: 'MSc Near', status: 'under_review' });
  });

  it('says nothing is coming up with empty lists, and is for students only', async () => {
    const student = await mk('student');
    expect(await executeTool('my_upcoming', {}, { id: student.id, role: 'student' })).toMatchObject({ meetings: [], intakes: [] });
    const counselor = await mk('counselor');
    expect((await executeTool('my_upcoming', {}, { id: counselor.id, role: 'counselor' })).error).toBeTruthy();
  });
});

describe('my_day_brief', () => {
  const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayUTC = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n) => new Date(Date.now() - n * 86400000);
  const said = (who, content) => ({ senderRole: who, senderName: who, content });

  it('gathers the counselor\'s own day: meetings, waiting chats, tasks, stalled leads, stuck applications', async () => {
    const counselor = await mk('counselor');
    const other = await mk('counselor');
    const quiet = await mk('student', { name: 'Brief Quiet Lead', counselorId: counselor.id, status: 'active', leadStageChangedAt: daysAgo(20) });
    await mk('student', { name: 'Brief Stuck Applicant', counselorId: counselor.id, status: 'application', applications: [
      { universityName: 'Stuck Uni', courseName: 'MSc', status: 'under_review', statusChangedAt: daysAgo(30) },
    ] });
    const chatty = await mk('student', { name: 'Brief Chatty', counselorId: counselor.id });

    await Meeting.create({ title: 'Evening call', scheduledDate: todayIST(), scheduledTime: '23:59', participants: [
      { userId: counselor.id, name: 'C', role: 'counselor' }, { userId: quiet.id, name: 'Brief Quiet Lead', role: 'student' },
    ] });
    await Meeting.create({ title: 'Already happened', scheduledDate: todayIST(), scheduledTime: '00:00', participants: [{ userId: counselor.id, name: 'C', role: 'counselor' }] });
    await createRoom({ participants: [counselor.id, chatty.id], participantNames: ['C', 'Brief Chatty'], type: 'student-counselor', messages: [said('student', 'Any news on my visa?')] });
    await Task.create({ title: 'Due today task', assignedTo: counselor.id, assignedBy: counselor.id, status: 'pending', dueDate: todayUTC() });
    await Task.create({ title: 'Overdue task', assignedTo: counselor.id, assignedBy: counselor.id, status: 'pending', dueDate: '2020-01-01' });
    await Task.create({ title: "Someone else's overdue task", assignedTo: other.id, assignedBy: other.id, status: 'pending', dueDate: '2020-01-01' });

    const brief = await executeTool('my_day_brief', {}, { id: counselor.id, role: 'counselor' });
    expect(brief.error).toBeUndefined();
    expect(brief.meetingsToday.map(m => m.title)).toEqual(['Evening call']);
    expect(brief.meetingsToday[0].with).toEqual(['Brief Quiet Lead']);
    expect(brief.chatsWaitingForReply).toMatchObject({ total: 1, chats: [{ student: 'Brief Chatty', lastMessage: 'Any news on my visa?' }] });
    expect(brief.tasksDueToday.tasks.map(t => t.title)).toEqual(['Due today task']);
    expect(brief.overdueTasks.tasks.map(t => t.title)).toEqual(['Overdue task']);
    expect(brief.leadsWithNoMovement.leads.map(l => l.name)).toContain('Brief Quiet Lead');
    expect(brief.leadsWithNoMovement.afterDays).toEqual(expect.any(Number));
    expect(brief.stuckApplications.applications).toEqual([expect.objectContaining({ student: 'Brief Stuck Applicant', university: 'Stuck Uni', status: 'under_review' })]);
    expect(JSON.stringify(brief)).not.toContain("Someone else's");
  });

  it('is an honest empty day for a counselor with nothing going on', async () => {
    const counselor = await mk('counselor');
    const brief = await executeTool('my_day_brief', {}, { id: counselor.id, role: 'counselor' });
    expect(brief.meetingsToday).toEqual([]);
    for (const key of ['chatsWaitingForReply', 'tasksDueToday', 'overdueTasks', 'leadsWithNoMovement', 'stuckApplications']) expect(brief[key].total).toBe(0);
  });

  it('shows only a few of each kind but reports the real total', async () => {
    const counselor = await mk('counselor');
    for (let i = 0; i < 7; i++) await Task.create({ title: `Overdue ${i}`, assignedTo: counselor.id, assignedBy: counselor.id, status: 'pending', dueDate: '2020-01-01' });
    const brief = await executeTool('my_day_brief', {}, { id: counselor.id, role: 'counselor' });
    expect(brief.overdueTasks.total).toBe(7);
    expect(brief.overdueTasks.tasks).toHaveLength(5);
  });

  it('is for counselors only', async () => {
    const admin = await mk('admin');
    const student = await mk('student');
    expect((await executeTool('my_day_brief', {}, { id: admin.id, role: 'admin' })).error).toBeTruthy();
    expect((await executeTool('my_day_brief', {}, { id: student.id, role: 'student' })).error).toBeTruthy();
  });
});

describe('conversion_report', () => {
  it('counts leads, applications, offers and enrolments per counselor, with rates', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor', { name: 'Conv Counselor' });
    await mk('student', { counselorId: counselor.id, applications: [{ universityName: 'U', courseName: 'C', status: 'offer_received' }] });
    await mk('student', { counselorId: counselor.id, applications: [{ universityName: 'U', courseName: 'C', status: 'draft' }] }); // a draft is not "applied"
    await mk('student', { counselorId: counselor.id });

    const report = await executeTool('conversion_report', {}, { id: admin.id, role: 'admin' });
    expect(report.groupBy).toBe('counselor');
    expect(report.rows.find(r => r.group === 'Conv Counselor')).toMatchObject({ leads: 3, applied: 1, offers: 1, enrolled: 0, leadToApplied: 33.3, appliedToOffer: 100 });
    expect(report.totals.leads).toBeGreaterThanOrEqual(3);
  });

  it('groups by country or source, and warns that a student can count under several countries', async () => {
    const admin = await mk('admin');
    await mk('student', { preferredCountries: ['Zzland', 'Yyland'], source: 'self_signup' });
    const byCountry = await executeTool('conversion_report', { groupBy: 'country' }, { id: admin.id, role: 'admin' });
    expect(byCountry.groupBy).toBe('country');
    expect(byCountry.rows.map(r => r.group)).toEqual(expect.arrayContaining(['Zzland', 'Yyland']));
    expect(byCountry.note).toMatch(/several countries/);
    const bySource = await executeTool('conversion_report', { groupBy: 'source' }, { id: admin.id, role: 'admin' });
    expect(bySource.rows.map(r => r.group)).toContain('Self sign-up');
    expect(bySource.note).toBeUndefined();
  });

  it('limits to leads created in a date range, and refuses a badly written date', async () => {
    const admin = await mk('admin');
    await mk('student');
    const future = await executeTool('conversion_report', { from: '2999-01-01' }, { id: admin.id, role: 'admin' });
    expect(future.rows).toEqual([]);
    expect(future.totals.leads).toBe(0);
    const past = await executeTool('conversion_report', { to: '2000-01-01' }, { id: admin.id, role: 'admin' });
    expect(past.totals.leads).toBe(0);
    expect((await executeTool('conversion_report', { from: 'last month' }, { id: admin.id, role: 'admin' })).error).toMatch(/YYYY-MM-DD/);
    expect((await executeTool('conversion_report', { to: '31/01/2026' }, { id: admin.id, role: 'admin' })).error).toMatch(/YYYY-MM-DD/);
  });

  it('treats an unknown grouping as the default, and is admin only', async () => {
    const admin = await mk('admin');
    const counselor = await mk('counselor');
    const student = await mk('student');
    expect((await executeTool('conversion_report', { groupBy: 'password' }, { id: admin.id, role: 'admin' })).groupBy).toBe('counselor');
    expect((await executeTool('conversion_report', {}, { id: counselor.id, role: 'counselor' })).error).toBeTruthy();
    expect((await executeTool('conversion_report', {}, { id: student.id, role: 'student' })).error).toBeTruthy();
  });
});

describe('what Zest is used for, and how often the AI was down', () => {
  it('get_zest_insights lists the most used lookups and counts the times the AI was unavailable', async () => {
    const admin = await mk('admin');
    const asker = await mk('student');
    const tool = `zz_tool_${Date.now()}`;
    // A big count so it is clearly among the most used, whatever other tests have already logged.
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'q1', answer: 'a', toolsUsed: Array(40).fill(tool) });
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'q2', answer: 'a', toolsUsed: [tool], degraded: true });

    const result = await executeTool('get_zest_insights', {}, { id: admin.id, role: 'admin' });
    expect(result.mostUsedLookups.find(t => t.tool === tool)).toEqual({ tool, count: 41 });
    expect(result.timesTheAIWasUnavailable).toBeGreaterThanOrEqual(1);
  });

  it('list_knowledge_documents says how often each document was shown as a source', async () => {
    const admin = await mk('admin');
    const asker = await mk('student');
    const used = await KnowledgeDocument.create({ title: `Used doc zz${Date.now()}`, originalFilename: 'a.pdf', storagePath: '/uploads/a.pdf', uploadedBy: admin.id, mimeType: 'application/pdf', fileSize: 1, status: 'ready', chunkCount: 1 });
    const idle = await KnowledgeDocument.create({ title: `Idle doc zz${Date.now()}`, originalFilename: 'b.pdf', storagePath: '/uploads/b.pdf', uploadedBy: admin.id, mimeType: 'application/pdf', fileSize: 1, status: 'ready', chunkCount: 1 });
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'about the used doc', answer: 'a', sourceDocIds: [used._id] });
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question: 'again about it', answer: 'a', sourceDocIds: [used._id] });

    const result = await executeTool('list_knowledge_documents', {}, { id: admin.id, role: 'admin' });
    expect(result.documents.find(d => d.title === used.title).usedAsSourceInLast90Days).toBe(2);
    expect(result.documents.find(d => d.title === idle.title).usedAsSourceInLast90Days).toBe(0);
  });
});

describe('statusFor', () => {
  it('has a plain-words label for every tool Zest can run, and a safe default', () => {
    const names = new Set(['my_status', 'my_upcoming', 'my_day_brief', 'conversion_report', ...['student', 'counselor', 'admin'].flatMap(r => getToolsForRole(r).map(t => t.name))]);
    for (const name of names) {
      expect(statusFor(name)).toMatch(/…$/);
      expect(statusFor(name)).not.toBe(statusFor('no_such_tool'));
    }
    expect(statusFor('no_such_tool')).toBe('Looking that up…');
  });
});

describe('draft_followup_message', () => {
  const lead = (counselor, name, extra = {}) => mk('student', {
    name, counselorId: counselor.id, leadStage: 'counselling', preferredCountries: ['UK'], phone: '9876543210', ...extra,
  });

  it('gives a counselor the facts and a starting template for their own student, without contact details', async () => {
    const counselor = await mk('counselor', { name: 'Ravi Counselor' });
    const student = await lead(counselor, 'Quiet Asha Followup');
    const result = await executeTool('draft_followup_message', { student: 'Quiet Asha Followup' }, { id: counselor.id, role: 'counselor', name: 'Ravi Counselor' });

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ student: 'Quiet Asha Followup', channel: 'email' });
    expect(result.facts.firstName).toBe('Quiet');
    expect(result.startingPoint.subject).toContain('Quiet');
    expect(result.startingPoint.body).toContain('Ravi Counselor');
    expect(result.instructions).toMatch(/ONLY these facts/);
    // The model needs the facts, never how to reach the student.
    expect(JSON.stringify(result)).not.toContain(student.email);
    expect(JSON.stringify(result)).not.toContain('9876543210');
  });

  it('writes WhatsApp drafts with no subject, and treats an unknown channel as email', async () => {
    const counselor = await mk('counselor');
    await lead(counselor, 'Whatsapp Wanda Followup');
    const wa = await executeTool('draft_followup_message', { student: 'Whatsapp Wanda Followup', channel: 'whatsapp' }, { id: counselor.id, role: 'counselor' });
    expect(wa.channel).toBe('whatsapp');
    expect(wa.startingPoint.subject).toBe('');
    const odd = await executeTool('draft_followup_message', { student: 'Whatsapp Wanda Followup', channel: 'carrier-pigeon' }, { id: counselor.id, role: 'counselor' });
    expect(odd.channel).toBe('email');
  });

  it("will not reach another counselor's student, but an admin can", async () => {
    const owner = await mk('counselor');
    const stranger = await mk('counselor');
    const admin = await mk('admin');
    await lead(owner, 'Guarded Gita Followup');

    const denied = await executeTool('draft_followup_message', { student: 'Guarded Gita Followup' }, { id: stranger.id, role: 'counselor' });
    expect(denied.error).toBeTruthy();
    expect(denied.facts).toBeUndefined();
    expect((await executeTool('draft_followup_message', { student: 'Guarded Gita Followup' }, { id: admin.id, role: 'admin' })).facts).toBeTruthy();
  });

  it('asks which student when several match, and refuses students and empty input', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    await lead(counselor, 'Twin Followup One');
    await lead(counselor, 'Twin Followup Two');

    const many = await executeTool('draft_followup_message', { student: 'Twin Followup' }, { id: counselor.id, role: 'counselor' });
    expect(many.error).toMatch(/More than one/);
    expect(many.matches.sort()).toEqual(['Twin Followup One', 'Twin Followup Two']);
    expect((await executeTool('draft_followup_message', { student: 'Twin Followup One' }, { id: student.id, role: 'student' })).error).toBeTruthy();
    expect((await executeTool('draft_followup_message', {}, { id: counselor.id, role: 'counselor' })).error).toBeTruthy();
  });
});

describe('get_chat_for_reply', () => {
  const room = (counselor, student, messages) => createRoom({
    participants: [counselor.id, student.id], participantNames: ['Counselor', 'Student'], type: 'student-counselor', messages,
  });
  const said = (who, content) => ({ senderRole: who, senderName: who, content });

  it('returns the recent chat with a named student when they wrote last, with the drafting instructions', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { name: 'Chatty Chandra Reply', counselorId: counselor.id });
    await room(counselor, student, [said('counselor', 'Welcome!'), said('student', 'When is the IELTS deadline?')]);

    const result = await executeTool('get_chat_for_reply', { student: 'Chatty Chandra Reply' }, { id: counselor.id, role: 'counselor' });
    expect(result).toMatchObject({ student: 'Chatty Chandra Reply', needsReply: true });
    expect(result.transcript).toContain('Student (student): When is the IELTS deadline?');
    expect(result.instructions).toMatch(/Do not invent facts/);
  });

  it('says there is nothing to answer when the counselor spoke last', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student', { name: 'Answered Amit Reply', counselorId: counselor.id });
    await room(counselor, student, [said('student', 'hello?'), said('counselor', 'Hi!')]);

    const result = await executeTool('get_chat_for_reply', { student: 'Answered Amit Reply' }, { id: counselor.id, role: 'counselor' });
    expect(result.needsReply).toBe(false);
    expect(result.instructions).toBeUndefined();
  });

  it('lists only the chats where a student is still waiting, when no name is given', async () => {
    const counselor = await mk('counselor');
    const waiting = await mk('student', { name: 'Waiting Wanda List', counselorId: counselor.id });
    const answered = await mk('student', { name: 'Answered Arun List', counselorId: counselor.id });
    await createRoom({ participants: [counselor.id, waiting.id], participantNames: ['Counselor', 'Waiting Wanda List'], type: 'student-counselor', messages: [said('student', 'Any update on my visa?')] });
    await createRoom({ participants: [counselor.id, answered.id], participantNames: ['Counselor', 'Answered Arun List'], type: 'student-counselor', messages: [said('student', 'hi'), said('counselor', 'hello')] });

    const result = await executeTool('get_chat_for_reply', {}, { id: counselor.id, role: 'counselor' });
    expect(result.waitingForReply).toEqual([{ student: 'Waiting Wanda List', lastMessage: 'Any update on my visa?' }]);
    expect(result.total).toBe(1);
  });

  it('never exposes a chat the caller is not part of, and is not for students', async () => {
    const owner = await mk('counselor');
    const stranger = await mk('counselor');
    const student = await mk('student', { name: 'Private Priya Reply', counselorId: owner.id });
    await room(owner, student, [said('student', 'a private question')]);

    const asStranger = await executeTool('get_chat_for_reply', { student: 'Private Priya Reply' }, { id: stranger.id, role: 'counselor' });
    expect(asStranger.error).toBeTruthy();
    expect(JSON.stringify(asStranger)).not.toContain('a private question');
    expect(JSON.stringify(await executeTool('get_chat_for_reply', {}, { id: stranger.id, role: 'counselor' }))).not.toContain('a private question');
    expect((await executeTool('get_chat_for_reply', {}, { id: student.id, role: 'student' })).error).toBeTruthy();
  });
});

describe('Zest-management tools are admin only', () => {
  it('get_zest_insights reports ratings and the questions Zest had nothing to answer from', async () => {
    const admin = await mk('admin');
    const asker = await mk('student');
    const question = `What is the zzinsight${Date.now()} policy?`;
    await ZestQueryLog.create({ userId: asker.id, userRole: 'student', question, answer: 'I am not sure.', feedback: { rating: 'down', comment: 'vague', at: new Date() } });

    const result = await executeTool('get_zest_insights', { days: 7 }, { id: admin.id, role: 'admin' });
    expect(result.days).toBe(7);
    expect(result.notHelpful).toBeGreaterThanOrEqual(1);
    expect(result.unansweredQuestions.some(u => u.question === question)).toBe(true);
    expect(result.recentUnhelpfulAnswers.some(d => d.question === question && d.comment === 'vague')).toBe(true);
  });

  it('list_knowledge_documents shows titles and processing status', async () => {
    const admin = await mk('admin');
    const title = `Visa guide zzkb${Date.now()}`;
    await KnowledgeDocument.create({ title, originalFilename: 'v.pdf', storagePath: '/uploads/v.pdf', uploadedBy: admin.id, mimeType: 'application/pdf', fileSize: 10, status: 'failed', error: 'No extractable text', chunkCount: 0 });

    const result = await executeTool('list_knowledge_documents', {}, { id: admin.id, role: 'admin' });
    expect(result.documents.find(d => d.title === title)).toMatchObject({ status: 'failed', problem: 'No extractable text' });
  });

  it('refuses counselors and students even if they name the tool', async () => {
    const counselor = await mk('counselor');
    const student = await mk('student');
    for (const user of [{ id: counselor.id, role: 'counselor' }, { id: student.id, role: 'student' }]) {
      expect((await executeTool('get_zest_insights', {}, user)).error).toBeTruthy();
      expect((await executeTool('list_knowledge_documents', {}, user)).error).toBeTruthy();
    }
  });
});

describe('executeTool error handling', () => {
  it('returns an error object for an unknown tool name instead of throwing', async () => {
    const result = await executeTool('delete_everything', {}, { id: 'x', role: 'admin' });
    expect(result.error).toBeTruthy();
  });
});
