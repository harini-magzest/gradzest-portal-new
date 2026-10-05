// Nudges students about documents they still owe, and gives each counselor one digest of which of their students
// are behind. The checklist itself (what counts as required, what counts as uploaded) is lib/documentChecklist.js,
// the same code the student's dashboard and the staff view use, so a reminder never disagrees with the screen.
//
// Who is nudged: students with a live application, or in a stage where documents are due (application, tests, visa,
// loan) — not every lead who has simply enquired. What is nudged: documents that are missing, requested by staff
// with nothing uploaded yet, or rejected and needing a new file. Files already uploaded and waiting for staff to
// verify are not the student's job and are not listed.
//
// How often: at most once a week per student, every three days once an intake is within a month (and marked urgent).
// In-app always; email unless the student turned it off; WhatsApp only if they opted in (lib/notificationChannels).

const cron = require('node-cron');
const User = require('../models/User');
const University = require('../models/University');
const Country = require('../models/Country');
const Notification = require('../models/Notification');
const { buildChecklist, destinationNames } = require('../lib/documentChecklist');
const { wantsEmail, sendExtraChannels } = require('../lib/notificationChannels');
const { parseIntakeDate } = require('./deadlineReminders');

const DAY = 86400000;
const NORMAL_GAP_DAYS = 7;
const URGENT_GAP_DAYS = 3;
const URGENT_WITHIN_DAYS = 30;
const MAX_LISTED = 5;

const DOCS_DUE_STAGES = ['application', 'test_preparation', 'visa_process', 'loan_process'];
const NOT_LIVE_STATUSES = ['rejected', 'enrolled', 'accepted'];
const DONE_STAGES = ['enrolled', 'inactive'];

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const liveApps = (s) => (s.applications || []).filter((a) => !NOT_LIVE_STATUSES.includes(a.status));
const needsDocuments = (s) => !DONE_STAGES.includes(s.status) && (liveApps(s).length > 0 || DOCS_DUE_STAGES.includes(s.status));

// Rejected first (the student must act again), then ones staff asked for, then plain missing.
const ORDER = { rejected: 0, requested: 1, missing: 2 };
const owed = (checklist) => checklist.items
  .filter((i) => i.status in ORDER)
  .sort((a, b) => ORDER[a.status] - ORDER[b.status]);

function daysToNextIntake(student, now) {
  let best = null;
  for (const a of liveApps(student)) {
    const d = parseIntakeDate(a.intake);
    if (!d) continue;
    const days = Math.ceil((d - now) / DAY);
    if (days >= 0 && (best === null || days < best)) best = days;
  }
  return best;
}

function describe(items) {
  const shown = items.slice(0, MAX_LISTED).map((i) => (i.status === 'rejected' ? `${i.label} (re-upload needed)` : i.label));
  const more = items.length - shown.length;
  return { shown, text: shown.join(', ') + (more > 0 ? ` and ${more} more` : '') };
}

// One query each for the countries and the universities, instead of two per student.
async function loadReferenceData(students) {
  const ids = new Set();
  const names = new Set();
  for (const s of students) for (const a of s.applications || []) {
    if (a.universityId) ids.add(String(a.universityId));
    if (a.universityName) names.add(a.universityName);
  }
  const validIds = [...ids].filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
  const [unis, countries] = await Promise.all([
    ids.size || names.size
      ? University.find({ $or: [{ _id: { $in: validIds } }, { name: { $in: [...names] } }] }).select('name country').lean()
      : [],
    Country.find({}).select('name visa.documents').lean(),
  ]);
  const countryByUni = new Map();
  for (const u of unis) { countryByUni.set(String(u._id), u.country); countryByUni.set(`name:${u.name}`, u.country); }
  return { countryByUni, countries };
}

async function push(io, userSockets, userId, fields) {
  const n = await Notification.create({ userId, ...fields });
  if (io && userSockets) {
    const sids = userSockets.get(String(userId));
    if (sids) sids.forEach((sid) => io.to(sid).emit('automation:notification', {
      notificationId: String(n._id), priority: fields.priority, title: fields.title, message: fields.message, link: fields.link,
    }));
  }
  return n;
}

async function recentlySent(userId, type, days, now) {
  return !!(await Notification.exists({ userId, type, createdAt: { $gte: new Date(now.getTime() - days * DAY) } }));
}

function emailHtml(student, urgent, shown, more) {
  const list = shown.map((l) => `<li style="margin:4px 0;">${escapeHtml(l)}</li>`).join('');
  const accent = urgent ? '#dc2626' : '#ea580c';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:16px;">Hi ${escapeHtml(student.name)},</p>
        <div style="margin:20px 0;padding:16px 20px;background:${urgent ? '#fef2f2' : '#fff7ed'};border-left:4px solid ${accent};border-radius:4px;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:${accent};">Documents we still need from you</p>
          <ul style="margin:0;padding-left:20px;font-size:14px;">${list}</ul>
          ${more > 0 ? `<p style="margin:8px 0 0;font-size:14px;">…and ${more} more.</p>` : ''}
        </div>
        <p style="font-size:14px;color:#6b7280;">Log in to your Gradzest portal and open your document checklist to upload them. Your counselor can help if you are unsure what is needed.</p>
      </div>
    </div>`;
}

/**
 * `dryRun` decides who WOULD be nudged and returns them in `preview`, without creating a notification, sending an
 * email or WhatsApp message, or touching a counselor — for checking the audience before this goes live.
 * @returns {Promise<{ considered: number, nudged: number, emailed: number, counselorDigests: number, preview: object[] }>}
 */
async function runDocumentReminders(io, userSockets, mailer, { now = new Date(), dryRun = false } = {}) {
  const students = (await User.find({ role: 'student', status: { $nin: DONE_STAGES } })
    .select('name email phone notificationPrefs documents preferredCountries applications status counselorId')
    .lean()).filter(needsDocuments);

  const stats = { considered: students.length, nudged: 0, emailed: 0, counselorDigests: 0, preview: [] };
  if (!students.length) return stats;

  const { countryByUni, countries } = await loadReferenceData(students);
  const byCounselor = new Map(); // counselorId -> [{ name, count }]

  for (const student of students) {
    const uniCountries = (student.applications || [])
      .map((a) => countryByUni.get(String(a.universityId)) || countryByUni.get(`name:${a.universityName}`))
      .filter(Boolean);
    const wanted = destinationNames(student, uniCountries).map((n) => n.toLowerCase());
    const destinations = countries.filter((c) => wanted.includes(String(c.name).toLowerCase()));

    const items = owed(buildChecklist(student, destinations));
    if (!items.length) continue;

    const days = daysToNextIntake(student, now);
    const urgent = days !== null && days <= URGENT_WITHIN_DAYS;
    if (await recentlySent(student._id, 'document_reminder', urgent ? URGENT_GAP_DAYS : NORMAL_GAP_DAYS, now)) continue;

    const { shown, text } = describe(items);
    const title = urgent ? 'Documents needed before your intake' : 'Documents still needed';
    const message = `You still need to provide: ${text}.`;
    if (dryRun) {
      stats.nudged++;
      stats.preview.push({ name: student.name, email: student.email || '', urgent, owed: items.length, wouldEmail: !!(student.email && wantsEmail(student)), message });
      continue;
    }
    await push(io, userSockets, student._id, { type: 'document_reminder', priority: urgent ? 'urgent' : 'normal', title, message, link: '/student' });
    stats.nudged++;

    sendExtraChannels(student, `${title}. ${message}`);
    if (mailer && student.email && wantsEmail(student)) {
      try {
        await mailer.sendMail({
          from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: student.email,
          subject: `${title} — Gradzest`,
          html: emailHtml(student, urgent, shown, items.length - shown.length),
        });
        stats.emailed++;
      } catch { /* a bounced email must not stop the rest of the run */ }
    }

    if (student.counselorId) {
      const list = byCounselor.get(String(student.counselorId)) || [];
      list.push({ name: student.name, count: items.length });
      byCounselor.set(String(student.counselorId), list);
    }
  }

  // One digest per counselor per week, built only from the students nudged in this run.
  for (const [counselorId, list] of dryRun ? [] : byCounselor) {
    if (await recentlySent(counselorId, 'document_reminder_digest', NORMAL_GAP_DAYS, now)) continue;
    list.sort((a, b) => b.count - a.count);
    const shown = list.slice(0, MAX_LISTED).map((s) => `${s.name} (${s.count})`);
    const more = list.length - shown.length;
    await push(io, userSockets, counselorId, {
      type: 'document_reminder_digest', priority: 'normal',
      title: `${list.length} of your students ${list.length === 1 ? 'is' : 'are'} missing documents`,
      message: `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}. They have been reminded.`,
      link: '/counselor/students',
    });
    stats.counselorDigests++;
  }

  return stats;
}

function startDocumentReminders(io, userSockets, mailer) {
  // DOCUMENT_REMINDERS=off pauses the job (for example on a developer machine that points at the live database).
  if (String(process.env.DOCUMENT_REMINDERS || '').toLowerCase() === 'off') {
    console.log('[document-reminders] Disabled (DOCUMENT_REMINDERS=off)');
    return;
  }
  // Daily at 10:00, an hour after the intake-deadline reminders so a student isn't hit by both at once.
  cron.schedule('0 10 * * *', () => {
    runDocumentReminders(io, userSockets, mailer).catch((err) => console.error('[document-reminders] error:', err.message));
  });
  console.log('[document-reminders] Scheduled — runs daily at 10:00');
}

module.exports = { startDocumentReminders, runDocumentReminders };
