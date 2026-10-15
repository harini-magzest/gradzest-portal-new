const cron = require('node-cron');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const { daysSinceStageChange } = require('../lib/leadRisk');

const STALE_DAYS = 7;
const OFFER_STATUSES = ['offer_received', 'accepted', 'enrolled'];

function summarizeStudents(students) {
  const weekAgo = Date.now() - 7 * 86400000;
  let newLeads = 0, pendingDocs = 0, staleLeads = 0, applications = 0, offers = 0;
  for (const s of students) {
    if (new Date(s.createdAt || s.joinedDate).getTime() >= weekAgo) newLeads++;
    pendingDocs += (s.documents || []).filter(d => d.status === 'pending').length;
    const stale = daysSinceStageChange(s);
    if (stale !== null && stale >= STALE_DAYS && !['enrolled'].includes(s.status)) staleLeads++;
    applications += (s.applications || []).length;
    offers += (s.applications || []).filter(a => OFFER_STATUSES.includes(a.status)).length;
  }
  return { newLeads, pendingDocs, staleLeads, applications, offers };
}

function summaryTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:20px 0;">${rows.map(([k, v]) => `
    <tr>
      <td style="padding:8px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">${k}</td>
      <td style="padding:8px 12px;color:#111827;font-size:15px;font-weight:bold;border-bottom:1px solid #f3f4f6;text-align:right;">${v}</td>
    </tr>`).join('')}</table>`;
}

function emailShell(title, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
        <p style="color:#a5b4fc;margin:6px 0 0;font-size:13px;">${title}</p>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${bodyHtml}
      </div>
    </div>`;
}

async function sendCounselorDigests(mailer) {
  const counselors = await User.find({ role: 'counselor' }).select('name email').lean();
  const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  for (const counselor of counselors) {
    if (!counselor.email) continue;
    const cid = String(counselor._id);
    const students = await User.find({ role: 'student', counselorId: cid })
      .select('createdAt joinedDate documents leadStageChangedAt applications status').lean();
    const meetings = await Meeting.countDocuments({
      $or: [{ createdBy: cid }, { 'participants.userId': cid }],
      scheduledDate: { $gte: weekAgoStr }, status: { $ne: 'cancelled' },
    });
    const s = summarizeStudents(students);

    mailer.sendMail({
      from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: counselor.email,
      subject: `Your weekly Gradzest summary — ${s.newLeads} new lead(s), ${s.staleLeads} need follow-up`,
      html: emailShell('Weekly Summary', `
        <p style="font-size:15px;">Hi ${counselor.name},</p>
        <p style="font-size:14px;color:#4b5563;">Here's your student portfolio over the last 7 days:</p>
        ${summaryTable([
          ['Total students', students.length],
          ['New leads this week', s.newLeads],
          ['Meetings this week', meetings],
          ['Applications', s.applications],
          ['Offers received', s.offers],
          ['Pending documents to verify', s.pendingDocs],
          [`Leads with no movement ${STALE_DAYS}+ days`, s.staleLeads],
        ])}
        <p style="font-size:13px;color:#6b7280;">Log in to your Gradzest portal to follow up.</p>
      `),
    }).catch(err => console.error('[weekly-digest] counselor email failed:', err.message));
  }
}

async function sendAdminDigest(mailer) {
  const admins = await User.find({ role: 'admin', isAppTeam: { $ne: true } }).select('name email').lean();
  if (!admins.length) return;

  const students = await User.find({ role: 'student' })
    .select('createdAt joinedDate documents leadStageChangedAt applications status counselorId').lean();
  const s = summarizeStudents(students);
  const unassigned = students.filter(st => !st.counselorId).length;
  const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const meetings = await Meeting.countDocuments({ scheduledDate: { $gte: weekAgoStr }, status: { $ne: 'cancelled' } });

  const rows = summaryTable([
    ['Total students', students.length],
    ['New leads this week', s.newLeads],
    ['Unassigned leads', unassigned],
    ['Meetings this week', meetings],
    ['Applications', s.applications],
    ['Offers received', s.offers],
    ['Pending documents to verify', s.pendingDocs],
    [`Leads with no movement ${STALE_DAYS}+ days`, s.staleLeads],
  ]);

  for (const admin of admins) {
    if (!admin.email) continue;
    mailer.sendMail({
      from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: admin.email,
      subject: `Gradzest weekly digest — ${s.newLeads} new leads, ${unassigned} unassigned`,
      html: emailShell('Weekly Digest — All Counselors', `
        <p style="font-size:15px;">Hi ${admin.name},</p>
        <p style="font-size:14px;color:#4b5563;">Here's how the team did over the last 7 days:</p>
        ${rows}
        <p style="font-size:13px;color:#6b7280;">Log in to your Gradzest admin portal for the full breakdown.</p>
      `),
    }).catch(err => console.error('[weekly-digest] admin email failed:', err.message));
  }
}

async function runWeeklyDigest(mailer) {
  if (!mailer) return;
  await sendCounselorDigests(mailer);
  await sendAdminDigest(mailer);
}

function startWeeklyDigest(mailer) {
  // Every Monday at 8:00 AM
  cron.schedule('0 8 * * 1', () => {
    runWeeklyDigest(mailer).catch(err => console.error('[weekly-digest] error:', err.message));
  });
  console.log('[weekly-digest] Scheduled — runs Mondays at 08:00');
}

module.exports = { startWeeklyDigest, runWeeklyDigest };
