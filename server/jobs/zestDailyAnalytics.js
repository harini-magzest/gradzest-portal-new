const cron = require('node-cron');
const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const { pushNotification } = require('../lib/automation');
const { daysSinceStageChange } = require('../lib/leadRisk');
const { buildAlertsWorkbook } = require('../lib/zestXlsx');

const STALE_DAYS = Number(process.env.ZEST_STALE_DAYS) || 5;
const NON_STALE_STATUSES = ['enrolled', 'dropped_plans'];
const STUCK_APP_STATUSES = ['draft', 'submitted', 'under_review'];
const STUCK_APP_DAYS = 10;
const ADMIN_FILTER = { role: 'admin', isAppTeam: { $ne: true } };

function todayBucket() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Upserts one alert row; returns true only if this is a brand-new flag (so callers don't
// re-notify admins for something already surfaced earlier today).
async function upsertAlert({ userId, alertType, severity, detail, counselorId, flaggedOn }) {
  const result = await LeadAlert.findOneAndUpdate(
    { userId, alertType, flaggedOn },
    { $setOnInsert: { userId, alertType, severity, detail, counselorId: counselorId || '', flaggedOn, resolved: false } },
    { upsert: true, new: false },
  );
  return result === null; // null means no prior doc existed — this upsert just created one
}

async function findStaleLeads(flaggedOn) {
  const leads = await User.find({ role: 'student', status: { $nin: NON_STALE_STATUSES } })
    .select('name counselorId leadStageChangedAt createdAt joinedDate status').lean();
  const flagged = [];
  for (const lead of leads) {
    const days = daysSinceStageChange(lead);
    if (days !== null && days >= STALE_DAYS) {
      flagged.push({
        userId: lead._id, alertType: 'stale', severity: days >= STALE_DAYS * 2 ? 'urgent' : 'warning',
        detail: `No lead-stage movement in ${days} days`, counselorId: lead.counselorId, flaggedOn,
      });
    }
  }
  return flagged;
}

// Same exact-phone-number signal as lib/notifyAdminsOfNewLead.js, run as a full daily sweep
// instead of only at signup time, to catch duplicates that slipped through (e.g. phone added later).
async function findDuplicateLeads(flaggedOn) {
  const leads = await User.find({ role: 'student', phone: { $nin: [null, ''] } }).select('name phone counselorId').lean();
  const byPhone = new Map();
  for (const lead of leads) {
    const key = lead.phone.trim();
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(lead);
  }
  const flagged = [];
  for (const group of byPhone.values()) {
    if (group.length < 2) continue;
    for (const lead of group) {
      const others = group.filter(l => String(l._id) !== String(lead._id)).map(l => l.name).join(', ');
      flagged.push({
        userId: lead._id, alertType: 'duplicate', severity: 'urgent',
        detail: `Shares a phone number with: ${others}`, counselorId: lead.counselorId, flaggedOn,
      });
    }
  }
  return flagged;
}

async function findOverdueTasks(flaggedOn) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const tasks = await Task.find({
    status: { $in: ['pending', 'in_progress'] }, dueDate: { $ne: '', $lt: todayStr }, studentId: { $ne: null },
  }).select('studentId studentName dueDate title').lean();
  const leadIds = [...new Set(tasks.map(t => String(t.studentId)))];
  const leads = await User.find({ _id: { $in: leadIds } }).select('counselorId').lean();
  const counselorById = new Map(leads.map(l => [String(l._id), l.counselorId]));
  return tasks.map(t => ({
    userId: t.studentId, alertType: 'overdue_task', severity: 'warning',
    detail: `Task "${t.title}" was due ${t.dueDate}`, counselorId: counselorById.get(String(t.studentId)), flaggedOn,
  }));
}

async function findStuckApplications(flaggedOn) {
  const leads = await User.find({ role: 'student', 'applications.status': { $in: STUCK_APP_STATUSES } })
    .select('name counselorId applications').lean();
  const flagged = [];
  for (const lead of leads) {
    for (const app of lead.applications || []) {
      if (!STUCK_APP_STATUSES.includes(app.status)) continue;
      const changed = app.statusChangedAt || app.submittedDate;
      if (!changed) continue;
      const days = Math.floor((Date.now() - new Date(changed).getTime()) / 86400000);
      if (days >= STUCK_APP_DAYS) {
        flagged.push({
          userId: lead._id, alertType: 'stuck_application', severity: 'warning',
          detail: `${app.universityName || 'Application'} stuck at "${app.status}" for ${days} days`,
          counselorId: lead.counselorId, flaggedOn,
        });
        break; // one alert per lead is enough even if several applications are stuck
      }
    }
  }
  return flagged;
}

// Takes only `mailer` — the admin in-app alert goes through lib/automation.js's pushNotification,
// which already has its own io/userSockets wired up via initAutomation() at startup.
async function runZestDailyAnalytics(mailer) {
  const flaggedOn = todayBucket();
  const [stale, duplicates, overdueTasks, stuckApps] = await Promise.all([
    findStaleLeads(flaggedOn), findDuplicateLeads(flaggedOn), findOverdueTasks(flaggedOn), findStuckApplications(flaggedOn),
  ]);
  const all = [...stale, ...duplicates, ...overdueTasks, ...stuckApps];

  let newCount = 0;
  for (const alert of all) {
    if (await upsertAlert(alert)) newCount++;
  }

  if (newCount > 0) {
    const admins = await User.find(ADMIN_FILTER).select('_id').lean();
    const title = `Zest: ${newCount} new lead alert${newCount === 1 ? '' : 's'} today`;
    const message = `${stale.length} stale, ${duplicates.length} possible duplicate, ${overdueTasks.length} overdue task, ${stuckApps.length} stuck application alert(s) flagged.`;
    await Promise.all(admins.map(a => pushNotification(a, {
      title, message, link: '/admin?zest=alerts', priority: duplicates.length > 0 ? 'urgent' : 'normal',
    })));
  }

  if (mailer && all.length > 0) {
    const admins = await User.find(ADMIN_FILTER).select('name email').lean();
    const leadIds = [...new Set(all.map(a => String(a.userId)))];
    const leads = await User.find({ _id: { $in: leadIds } }).select('name email counselorId').lean();
    const leadById = new Map(leads.map(l => [String(l._id), l]));
    const counselorIds = [...new Set(leads.map(l => l.counselorId).filter(Boolean))];
    const counselors = await User.find({ _id: { $in: counselorIds } }).select('name').lean();
    const counselorById = new Map(counselors.map(c => [String(c._id), c.name]));

    const rows = all.map(a => {
      const lead = leadById.get(String(a.userId));
      return {
        leadName: lead?.name || 'Unknown', leadEmail: lead?.email || '',
        counselorName: counselorById.get(lead?.counselorId) || '',
        alertType: a.alertType, severity: a.severity, detail: a.detail, flaggedOn: a.flaggedOn,
      };
    });
    const buffer = await buildAlertsWorkbook(rows);
    const dateStr = flaggedOn.toISOString().slice(0, 10);

    for (const admin of admins) {
      if (!admin.email) continue;
      mailer.sendMail({
        from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: admin.email,
        subject: `Zest daily lead alerts — ${all.length} flagged (${dateStr})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
            <div style="background:#0d1b4b;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">Zest</h1>
              <p style="color:#a5b4fc;margin:6px 0 0;font-size:13px;">Daily Lead Alerts</p>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
              <p style="font-size:15px;">Hi ${admin.name},</p>
              <p style="font-size:14px;color:#4b5563;">${all.length} lead(s) were flagged today: ${stale.length} stale, ${duplicates.length} possible duplicate, ${overdueTasks.length} overdue task, ${stuckApps.length} stuck application. Full list attached as an Excel sheet.</p>
              <p style="font-size:13px;color:#6b7280;">Log in to your Gradzest admin portal, open Zest (the graduation-cap button) and go to the Alerts tab to review and resolve.</p>
            </div>
          </div>`,
        attachments: [{ filename: `zest-lead-alerts-${dateStr}.xlsx`, content: buffer }],
      }).catch(err => console.error('[zest-daily-analytics] admin email failed:', err.message));
    }
  }
}

function startZestDailyAnalytics(mailer) {
  // Daily at 8:00 AM — same hour as the weekly digest, every day instead of just Mondays.
  cron.schedule('0 8 * * *', () => {
    runZestDailyAnalytics(mailer).catch(err => console.error('[zest-daily-analytics] error:', err.message));
  });
  console.log('[zest-daily-analytics] Scheduled — runs daily at 08:00');
}

module.exports = { startZestDailyAnalytics, runZestDailyAnalytics };
