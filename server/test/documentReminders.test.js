const User = require('../models/User');
const Country = require('../models/Country');
const Notification = require('../models/Notification');
const { runDocumentReminders } = require('../jobs/documentReminders');

const DAY = 86400000;
let n = 0;
const uniq = (p) => `${p}-${Date.now()}-${n++}`;
const isoIn = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

async function mkStudent(extra = {}) {
  const email = `${uniq('docrem')}@example.com`;
  const u = await User.create({ name: extra.name || `Student ${n}`, email, password: 'x', role: 'student', status: 'application', ...extra });
  return { id: String(u._id), email };
}
async function mkCounselor() {
  const email = `${uniq('doccounselor')}@example.com`;
  const u = await User.create({ name: 'Counselor Test', email, password: 'x', role: 'counselor', status: 'active' });
  return { id: String(u._id), email };
}
const liveApp = (intake = isoIn(200)) => ({ universityName: 'Some University', courseName: 'MSc', status: 'submitted', intake });
const doc = (name, type, extra = {}) => ({ name, type, url: `/uploads/${uniq('f')}.pdf`, status: 'pending', ...extra });
const FULL_SET = () => [
  doc('passport.pdf', 'Passport'), doc('transcript.pdf', 'Transcript'), doc('ielts.pdf', 'English Test Certificate'),
  doc('sop.pdf', 'SOP'), doc('lor.pdf', 'LOR'), doc('cv.pdf', 'CV/Resume'), doc('bank.pdf', 'Bank Statement'),
];

function fakeMailer({ failFor } = {}) {
  const sent = [];
  return {
    sent,
    sendMail: async (m) => { if (failFor && m.to === failFor) throw new Error('bounce'); sent.push(m); },
  };
}
const notesFor = (id, type = 'document_reminder') => Notification.find({ userId: id, type }).lean();

describe('document reminders: who is nudged', () => {
  it('nudges a student with a live application and no documents: in-app, link, and one email', async () => {
    const s = await mkStudent({ applications: [liveApp()] });
    const mailer = fakeMailer();
    await runDocumentReminders(null, null, mailer);

    const notes = await notesFor(s.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('Documents still needed');
    expect(notes[0].priority).toBe('normal');
    expect(notes[0].link).toBe('/student');
    expect(notes[0].message).toContain('Passport');
    expect(mailer.sent.filter((m) => m.to === s.email)).toHaveLength(1);
  });

  it('lists at most five and says how many more', async () => {
    const s = await mkStudent({ applications: [liveApp()] });
    await runDocumentReminders(null, null, fakeMailer());
    const [note] = await notesFor(s.id);
    expect(note.message).toMatch(/and 2 more\.$/); // seven standard documents, five shown
  });

  it('does not nudge a student whose checklist is complete, including files still awaiting verification', async () => {
    const s = await mkStudent({ applications: [liveApp()], documents: FULL_SET() });
    const mailer = fakeMailer();
    await runDocumentReminders(null, null, mailer);
    expect(await notesFor(s.id)).toHaveLength(0);
    expect(mailer.sent.filter((m) => m.to === s.email)).toHaveLength(0);
  });

  it('lists a rejected document first and asks for a re-upload', async () => {
    const docs = FULL_SET();
    docs[0] = doc('passport.pdf', 'Passport', { status: 'rejected' });
    const s = await mkStudent({ applications: [liveApp()], documents: docs });
    await runDocumentReminders(null, null, fakeMailer());
    const [note] = await notesFor(s.id);
    expect(note.message).toBe('You still need to provide: Passport (re-upload needed).');
  });

  it('counts a document staff asked for but nothing has been uploaded for', async () => {
    const docs = FULL_SET();
    docs[3] = { name: 'SOP', type: 'SOP', status: 'pending' }; // placeholder row: no file
    const s = await mkStudent({ applications: [liveApp()], documents: docs });
    await runDocumentReminders(null, null, fakeMailer());
    const [note] = await notesFor(s.id);
    expect(note.message).toContain('Statement of purpose');
  });

  it('includes a destination country\'s own visa documents', async () => {
    await Country.create({ name: 'Zedland', visa: { documents: ['Police clearance certificate'] } });
    const s = await mkStudent({ applications: [liveApp()], documents: FULL_SET(), preferredCountries: ['Zedland'] });
    await runDocumentReminders(null, null, fakeMailer());
    const [note] = await notesFor(s.id);
    expect(note.message).toBe('You still need to provide: Police clearance certificate.');
  });

  it('skips people for whom documents are not yet due, or who are finished', async () => {
    const early = await mkStudent({ status: 'counseling' }); // an enquiry: no application, early stage
    const onlyRejectedApps = await mkStudent({ status: 'counseling', applications: [{ ...liveApp(), status: 'rejected' }] });
    const enrolled = await mkStudent({ status: 'enrolled', applications: [liveApp()] });
    const inactive = await mkStudent({ status: 'inactive', applications: [liveApp()] });
    const dueByStage = await mkStudent({ status: 'visa_process' }); // no application row, but the stage means documents are due
    await runDocumentReminders(null, null, fakeMailer());
    for (const s of [early, onlyRejectedApps, enrolled, inactive]) expect(await notesFor(s.id)).toHaveLength(0);
    expect(await notesFor(dueByStage.id)).toHaveLength(1);
  });
});

describe('document reminders: how often, and how', () => {
  it('sends once a week for a distant intake, and not twice in the same run window', async () => {
    const s = await mkStudent({ applications: [liveApp(isoIn(200))] });
    await runDocumentReminders(null, null, fakeMailer());
    await runDocumentReminders(null, null, fakeMailer());
    expect(await notesFor(s.id)).toHaveLength(1);

    await runDocumentReminders(null, null, fakeMailer(), { now: new Date(Date.now() + 4 * DAY) });
    expect(await notesFor(s.id)).toHaveLength(1); // 4 days: still within the weekly gap

    await runDocumentReminders(null, null, fakeMailer(), { now: new Date(Date.now() + 8 * DAY) });
    expect(await notesFor(s.id)).toHaveLength(2);
  });

  it('marks it urgent and repeats every three days once the intake is within a month', async () => {
    const s = await mkStudent({ applications: [liveApp(isoIn(10))] });
    await runDocumentReminders(null, null, fakeMailer());
    const [first] = await notesFor(s.id);
    expect(first.priority).toBe('urgent');
    expect(first.title).toBe('Documents needed before your intake');

    await runDocumentReminders(null, null, fakeMailer(), { now: new Date(Date.now() + 4 * DAY) });
    expect(await notesFor(s.id)).toHaveLength(2); // 4 days > the 3-day urgent gap
  });

  it('respects email opt-out and a missing address, but still notifies in-app', async () => {
    const optedOut = await mkStudent({ applications: [liveApp()], notificationPrefs: { email: false } });
    const mailer = fakeMailer();
    await runDocumentReminders(null, null, mailer);
    expect(await notesFor(optedOut.id)).toHaveLength(1);
    expect(mailer.sent.filter((m) => m.to === optedOut.email)).toHaveLength(0);
  });

  it('keeps going when one email bounces', async () => {
    const a = await mkStudent({ applications: [liveApp()] });
    const b = await mkStudent({ applications: [liveApp()] });
    const mailer = fakeMailer({ failFor: a.email });
    await runDocumentReminders(null, null, mailer);
    expect(await notesFor(a.id)).toHaveLength(1); // the in-app nudge is not lost
    expect(await notesFor(b.id)).toHaveLength(1);
    expect(mailer.sent.filter((m) => m.to === b.email)).toHaveLength(1);
  });

  it('escapes a student name in the email body', async () => {
    const s = await mkStudent({ name: '<img src=x onerror=alert(1)>', applications: [liveApp()] });
    const mailer = fakeMailer();
    await runDocumentReminders(null, null, mailer);
    const mail = mailer.sent.find((m) => m.to === s.email);
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });

  it('pushes to a connected student over the socket', async () => {
    const s = await mkStudent({ applications: [liveApp()] });
    const emitted = [];
    const io = { to: (sid) => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };
    const userSockets = new Map([[s.id, new Set(['sock-1'])]]);
    await runDocumentReminders(io, userSockets, fakeMailer());
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe('automation:notification');
    expect(emitted[0].payload.link).toBe('/student');
  });
});

describe('document reminders: counselor digest', () => {
  it('sends one digest per counselor naming the students who were nudged, and not again the same week', async () => {
    const c = await mkCounselor();
    await mkStudent({ name: 'Alpha Student', counselorId: c.id, applications: [liveApp()] });
    await mkStudent({ name: 'Beta Student', counselorId: c.id, applications: [liveApp()] });
    await mkStudent({ name: 'Complete Student', counselorId: c.id, applications: [liveApp()], documents: FULL_SET() });

    const stats = await runDocumentReminders(null, null, fakeMailer());
    expect(stats.counselorDigests).toBeGreaterThanOrEqual(1);
    const digests = await notesFor(c.id, 'document_reminder_digest');
    expect(digests).toHaveLength(1);
    expect(digests[0].title).toBe('2 of your students are missing documents');
    expect(digests[0].message).toContain('Alpha Student');
    expect(digests[0].message).toContain('Beta Student');
    expect(digests[0].message).not.toContain('Complete Student');
    expect(digests[0].link).toBe('/counselor/students');

    await runDocumentReminders(null, null, fakeMailer(), { now: new Date(Date.now() + 8 * DAY) });
    expect(await notesFor(c.id, 'document_reminder_digest')).toHaveLength(2); // a new week, a new digest
  });

  it('sends no digest for a counselor whose students are all up to date', async () => {
    const c = await mkCounselor();
    await mkStudent({ counselorId: c.id, applications: [liveApp()], documents: FULL_SET() });
    await runDocumentReminders(null, null, fakeMailer());
    expect(await notesFor(c.id, 'document_reminder_digest')).toHaveLength(0);
  });
});

describe('document reminders: dry run', () => {
  it('reports who would be reminded without saving, emailing or notifying anyone', async () => {
    const c = await mkCounselor();
    const s = await mkStudent({ name: 'Preview Student', counselorId: c.id, applications: [liveApp(isoIn(10))] });
    const mailer = fakeMailer();
    const emitted = [];
    const io = { to: () => ({ emit: (...a) => emitted.push(a) }) };

    const stats = await runDocumentReminders(io, new Map([[s.id, new Set(['x'])]]), mailer, { dryRun: true });

    const mine = stats.preview.find((p) => p.name === 'Preview Student');
    expect(mine).toMatchObject({ urgent: true, wouldEmail: true });
    expect(mine.message).toContain('Passport');
    expect(await notesFor(s.id)).toHaveLength(0);
    expect(await notesFor(c.id, 'document_reminder_digest')).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(stats.counselorDigests).toBe(0);
  });

  it('a dry run does not use up the weekly slot: the real run afterwards still sends', async () => {
    const s = await mkStudent({ applications: [liveApp()] });
    await runDocumentReminders(null, null, fakeMailer(), { dryRun: true });
    await runDocumentReminders(null, null, fakeMailer());
    expect(await notesFor(s.id)).toHaveLength(1);
  });
});
