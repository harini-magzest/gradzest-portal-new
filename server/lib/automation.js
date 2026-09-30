const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const AutomationRule = require('../models/AutomationRule');
const AutomationTemplate = require('../models/AutomationTemplate');
const AutomationLog = require('../models/AutomationLog');

/* ── Catalogue (also served to the admin UI via GET /api/automation/meta) ──── */

const LEAD_STAGES = {
  new_enquiry: 'New Enquiry', interested: 'Interested', counselling: 'Counselling', shortlisting: 'Shortlisting',
  applications: 'Applications', visa_process: 'Visa Process', visa_approved: 'Visa Approved', enrolment: 'Enrolment',
  future_lead: 'Future Lead', other_agent: 'Other Agent', dropped_plans: 'Dropped Plans', test_prep: 'Test Prep',
  dnd: 'DND', not_responding: 'Not Responding', other: 'Other',
};
const APP_STATUSES = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', offer_received: 'Offer Received',
  accepted: 'Accepted', rejected: 'Rejected', enrolled: 'Enrolled',
};
const STUDENT_STATUSES = {
  active: 'Active', inactive: 'Inactive', counseling: 'Counseling', shortlisting: 'Shortlisting', application: 'Application',
  test_preparation: 'Test Preparation', visa_process: 'Visa Process', loan_process: 'Loan Process', enrolled: 'Enrolled',
};
const SOURCES = { self_signup: 'Self signup', admin_created: 'Created by admin', counselor_created: 'Created by counselor' };
const YES_NO = { yes: 'Yes', no: 'No' };

const TRIGGERS = [
  { key: 'student.created',           label: 'New student is created',          group: 'student' },
  { key: 'student.stageChanged',      label: 'Lead stage changes',              group: 'student' },
  { key: 'counselor.assigned',        label: 'Counselor is assigned to student', group: 'student' },
  { key: 'document.uploaded',         label: 'Student uploads a document',      group: 'document' },
  { key: 'application.created',       label: 'Application is created',          group: 'application' },
  { key: 'application.statusChanged', label: 'Application status changes',      group: 'application' },
  { key: 'schedule.daily',            label: 'Every day (scheduled check on all students)', group: 'student' },
];

// `groups` limits a field to triggers of those groups; omitted = available everywhere
const FIELDS = [
  { key: 'student.leadStage',        label: 'Lead stage',            options: LEAD_STAGES },
  { key: 'student.status',           label: 'Student status',        options: STUDENT_STATUSES },
  { key: 'student.source',           label: 'Lead source',           options: SOURCES },
  { key: 'student.hasCounselor',     label: 'Has counselor',         options: YES_NO },
  { key: 'student.nationality',      label: 'Nationality' },
  { key: 'student.preferredCountries', label: 'Preferred countries' },
  { key: 'student.educationLevel',   label: 'Education level' },
  { key: 'student.daysSinceSignup',  label: 'Days since signup',     number: true },
  { key: 'student.documentCount',    label: 'Documents uploaded',    number: true },
  { key: 'student.applicationCount', label: 'Number of applications', number: true },
  { key: 'event.fromStage',          label: 'Previous lead stage',   options: LEAD_STAGES, triggers: ['student.stageChanged'] },
  { key: 'application.status',       label: 'Application status',    options: APP_STATUSES, groups: ['application'] },
  { key: 'event.fromStatus',         label: 'Previous application status', options: APP_STATUSES, triggers: ['application.statusChanged'] },
  { key: 'application.universityName', label: 'University',          groups: ['application'] },
  { key: 'application.courseName',   label: 'Course',                groups: ['application'] },
  { key: 'application.intake',       label: 'Intake',                groups: ['application'] },
  { key: 'document.type',            label: 'Document type',         groups: ['document'] },
  { key: 'document.name',            label: 'Document name',         groups: ['document'] },
];

const OPERATORS = [
  { key: 'equals',       label: 'is' },
  { key: 'not_equals',   label: 'is not' },
  { key: 'contains',     label: 'contains' },
  { key: 'not_contains', label: 'does not contain' },
  { key: 'is_empty',     label: 'is empty',     noValue: true },
  { key: 'is_not_empty', label: 'is not empty', noValue: true },
  { key: 'greater_than', label: 'greater than' },
  { key: 'less_than',    label: 'less than' },
];

// Placeholders usable in templates as {{key}}; `sample` feeds the editor preview
const VARIABLES = [
  { key: 'student.name',       label: 'Student full name',   sample: 'Priya Sharma' },
  { key: 'student.firstName',  label: 'Student first name',  sample: 'Priya' },
  { key: 'student.email',      label: 'Student email',       sample: 'priya@example.com' },
  { key: 'student.phone',      label: 'Student phone',       sample: '+91 98765 43210' },
  { key: 'student.leadStage',  label: 'Lead stage',          sample: 'Counselling' },
  { key: 'counselor.name',     label: 'Counselor name',      sample: 'Rahul Verma' },
  { key: 'counselor.email',    label: 'Counselor email',     sample: 'rahul@gradzest.com' },
  { key: 'counselor.phone',    label: 'Counselor phone',     sample: '+91 90000 00000' },
  { key: 'application.universityName', label: 'University',  sample: 'University of Leeds' },
  { key: 'application.courseName',     label: 'Course',      sample: 'MSc Data Science' },
  { key: 'application.intake',         label: 'Intake',      sample: 'September 2027' },
  { key: 'application.status',         label: 'Application status', sample: 'Offer Received' },
  { key: 'document.name',      label: 'Document name',       sample: 'Passport.pdf' },
  { key: 'portal.url',         label: 'Portal login link',   sample: 'https://portal.gradzest.com/login' },
  { key: 'today',              label: "Today's date",        sample: '30 Sep 2026' },
];

const ACTION_TYPES = [
  { key: 'send_email',        label: 'Send email' },
  { key: 'send_notification', label: 'Send in-app notification' },
  { key: 'create_task',       label: 'Create task' },
  { key: 'assign_counselor',  label: 'Assign counselor' },
  { key: 'change_stage',      label: 'Change lead stage' },
];

const RECIPIENTS = [
  { key: 'student',   label: 'The student' },
  { key: 'counselor', label: "Student's counselor" },
  { key: 'admins',    label: 'All admins' },
  { key: 'role',      label: 'Everyone in a role' },
  { key: 'user',      label: 'A specific staff member' },
];

/* ── Runtime wiring ─────────────────────────────────────────────────────────── */

let _deps = { io: null, userSockets: null, mailer: null };

/** Call once at startup so rules can send mail and push socket notifications. */
function initAutomation(deps) { _deps = { ..._deps, ...deps }; }

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Replace {{key}} placeholders. Unknown keys become empty strings. */
function renderText(text, vars, { html = false } = {}) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key] ?? '';
    return html ? escapeHtml(v) : String(v);
  });
}

function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ''); }

function emailLayout(bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <div style="background:#3b0764;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Gradzest</h1>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </div>
    </div>`;
}

/** Render a template for email: returns { subject, html }. */
function renderEmail(template, vars) {
  return {
    subject: renderText(template.subject, vars),
    html: emailLayout(renderText(template.body, vars, { html: true }).replace(/\r?\n/g, '<br/>')),
  };
}

function sampleVars() {
  return Object.fromEntries(VARIABLES.map(v => [v.key, v.sample]));
}

/* ── Context building ──────────────────────────────────────────────────────── */

async function findCounselor(student) {
  if (student.counselorId) {
    const c = await User.findById(student.counselorId).select('name email phone role isAppTeam').lean();
    if (c) return c;
  }
  return User.findOne({ role: 'counselor', assignedStudents: String(student._id) }).select('name email phone role isAppTeam').lean();
}

async function buildContext(studentOrId, extra = {}) {
  const student = typeof studentOrId === 'object' && studentOrId?._id
    ? studentOrId
    : await User.findOne({ _id: studentOrId, role: 'student' }).select('-password').lean();
  if (!student) return null;
  const counselor = await findCounselor(student);
  return { student, counselor, ...extra };
}

function fieldValue(ctx, key) {
  const { student, counselor, application, document } = ctx;
  switch (key) {
    case 'student.leadStage':        return student.leadStage || 'new_enquiry';
    case 'student.status':           return student.status || '';
    case 'student.source':           return student.source || '';
    case 'student.hasCounselor':     return counselor ? 'yes' : 'no';
    case 'student.nationality':      return student.nationality || '';
    case 'student.preferredCountries': return student.preferredCountries || [];
    case 'student.educationLevel':   return student.educationLevel || '';
    case 'student.daysSinceSignup': {
      const joined = student.createdAt || student.joinedDate;
      return joined ? Math.floor((Date.now() - new Date(joined).getTime()) / 86400000) : '';
    }
    case 'student.documentCount':    return (student.documents || []).length;
    case 'student.applicationCount': return (student.applications || []).length;
    case 'event.fromStage':          return ctx.fromStage || '';
    case 'event.fromStatus':         return ctx.fromStatus || '';
    case 'application.status':       return application?.status || '';
    case 'application.universityName': return application?.universityName || '';
    case 'application.courseName':   return application?.courseName || '';
    case 'application.intake':       return application?.intake || '';
    case 'document.type':            return document?.type || '';
    case 'document.name':            return document?.name || '';
    default: return '';
  }
}

function checkCondition(ctx, { field, op, value }) {
  const actual = fieldValue(ctx, field);
  const want = String(value ?? '').trim().toLowerCase();
  const list = Array.isArray(actual) ? actual.map(a => String(a).toLowerCase()) : null;
  const str = list ? list.join(', ') : String(actual ?? '').toLowerCase();
  switch (op) {
    case 'equals':       return list ? list.includes(want) : str === want;
    case 'not_equals':   return list ? !list.includes(want) : str !== want;
    case 'contains':     return str.includes(want);
    case 'not_contains': return !str.includes(want);
    case 'is_empty':     return list ? list.length === 0 : str === '';
    case 'is_not_empty': return list ? list.length > 0 : str !== '';
    case 'greater_than': return str !== '' && Number(actual) > Number(value);
    case 'less_than':    return str !== '' && Number(actual) < Number(value);
    default: return false;
  }
}

function matches(rule, ctx) {
  const conds = rule.conditions || [];
  if (!conds.length) return true;
  return rule.conditionMatch === 'any'
    ? conds.some(c => checkCondition(ctx, c))
    : conds.every(c => checkCondition(ctx, c));
}

function contextVars(ctx) {
  const { student, counselor, application, document } = ctx;
  return {
    'student.name': student.name || '',
    'student.firstName': student.firstName || (student.name || '').split(' ')[0],
    'student.email': student.email || '',
    'student.phone': student.phone || '',
    'student.leadStage': LEAD_STAGES[student.leadStage || 'new_enquiry'] || '',
    'counselor.name': counselor?.name || 'your counselor',
    'counselor.email': counselor?.email || '',
    'counselor.phone': counselor?.phone || '',
    'application.universityName': application?.universityName || '',
    'application.courseName': application?.courseName || '',
    'application.intake': application?.intake || '',
    'application.status': APP_STATUSES[application?.status] || application?.status || '',
    'document.name': document?.name || '',
    'portal.url': `${frontendUrl()}/login`,
    'today': new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/* ── Actions ───────────────────────────────────────────────────────────────── */

async function resolveRecipients(action, ctx) {
  const pick = 'name email role isAppTeam';
  switch (action.recipient) {
    case 'student':   return [ctx.student];
    case 'counselor': return ctx.counselor ? [ctx.counselor] : [];
    case 'admins':    return User.find({ role: 'admin', isAppTeam: { $ne: true } }).select(pick).lean();
    case 'role':      return action.roleId ? User.find({ hierarchyRole: action.roleId }).select(pick).lean() : [];
    case 'user':      return action.userId ? User.find({ _id: action.userId }).select(pick).lean() : [];
    default: return [];
  }
}

function homeLink(user, ctx) {
  if (user.role === 'student') return '/student';
  if (user.role === 'counselor') return '/counselor/students';
  if (user.isAppTeam) return '/appteam';
  return ctx.student ? '/admin/students' : '/admin';
}

async function pushNotification(user, { title, message, link, priority = 'normal' }) {
  const n = await Notification.create({ userId: user._id, type: 'automation', priority, title, message, link });
  const { io, userSockets } = _deps;
  const sids = userSockets?.get(String(user._id));
  if (io && sids) sids.forEach(sid => io.to(sid).emit('automation:notification', {
    notificationId: String(n._id), priority, title, message, link,
  }));
}

async function loadTemplate(action) {
  if (!action.templateId) throw new Error('No template selected');
  const t = await AutomationTemplate.findById(action.templateId).lean();
  if (!t) throw new Error('Template was deleted');
  return t;
}

const ACTION_RUNNERS = {
  async send_email(action, ctx, vars) {
    if (!_deps.mailer) throw new Error('Mailer not configured');
    const template = await loadTemplate(action);
    const to = (await resolveRecipients(action, ctx)).map(u => u.email).filter(Boolean);
    if (!to.length) return { status: 'skipped', detail: 'No recipient with an email address' };
    const { subject, html } = renderEmail(template, vars);
    await Promise.all(to.map(addr => _deps.mailer.sendMail({
      from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: addr, subject, html,
      gzMeta: { kind: 'automation', sentByName: 'Automation' },
    })));
    return { status: 'success', detail: `"${template.name}" → ${to.join(', ')}` };
  },

  async send_notification(action, ctx, vars) {
    const template = await loadTemplate(action);
    const users = await resolveRecipients(action, ctx);
    if (!users.length) return { status: 'skipped', detail: 'No recipients' };
    const title = renderText(template.subject || template.name, vars);
    const message = stripTags(renderText(template.body, vars)).slice(0, 500);
    await Promise.all(users.map(u => pushNotification(u, { title, message, link: homeLink(u, ctx) })));
    return { status: 'success', detail: `"${template.name}" → ${users.map(u => u.name).join(', ')}` };
  },

  async create_task(action, ctx, vars, rule) {
    const users = await resolveRecipients(action, ctx);
    const assignees = users.filter(u => u.role !== 'student');
    if (!assignees.length) return { status: 'skipped', detail: 'No staff assignee found' };
    let assignedBy = rule.createdBy;
    if (!assignedBy) assignedBy = (await User.findOne({ role: 'admin' }).select('_id').lean())?._id;
    const due = new Date(Date.now() + (Number(action.taskDueDays) || 0) * 86400000).toISOString().split('T')[0];
    const title = renderText(action.taskTitle || 'Follow up with {{student.name}}', vars);
    const description = renderText(action.taskDescription, vars);
    for (const u of assignees) {
      await Task.create({
        title, description, priority: action.taskPriority || 'medium', dueDate: due,
        assignedTo: u._id, assignedToName: u.name,
        assignedToRole: u.role === 'counselor' ? 'counselor' : u.isAppTeam ? 'appteam' : 'admin',
        assignedBy, assignedByName: 'Automation',
      });
      await pushNotification(u, { title: 'New task assigned', message: title, link: homeLink(u, ctx) });
    }
    return { status: 'success', detail: `"${title}" → ${assignees.map(u => u.name).join(', ')}` };
  },

  async assign_counselor(action, ctx) {
    const counselor = await User.findOne({ _id: action.userId, role: 'counselor' }).select('name email phone role').lean();
    if (!counselor) throw new Error('Counselor not found');
    const sid = String(ctx.student._id);
    if (ctx.student.counselorId && String(ctx.student.counselorId) !== String(counselor._id)) {
      await User.findByIdAndUpdate(ctx.student.counselorId, { $pull: { assignedStudents: sid } });
    }
    const update = { counselorId: String(counselor._id) };
    if (ctx.student.leadStatus === 'new') update.leadStatus = 'contacted';
    await User.findByIdAndUpdate(sid, update);
    await User.findByIdAndUpdate(counselor._id, { $addToSet: { assignedStudents: sid } });
    // Later actions in the same rule see the new counselor
    ctx.student = { ...ctx.student, ...update };
    ctx.counselor = counselor;
    Object.assign(ctx.vars, contextVars(ctx));
    return { status: 'success', detail: `Assigned to ${counselor.name}` };
  },

  async change_stage(action, ctx) {
    if (!LEAD_STAGES[action.leadStage]) throw new Error('Invalid lead stage');
    await User.findByIdAndUpdate(ctx.student._id, { leadStage: action.leadStage });
    ctx.student = { ...ctx.student, leadStage: action.leadStage };
    Object.assign(ctx.vars, contextVars(ctx));
    return { status: 'success', detail: `Stage → ${LEAD_STAGES[action.leadStage]}` };
  },
};

/** Run one rule's actions for a context and record an AutomationLog entry. */
async function executeRule(rule, ctx) {
  ctx.vars = contextVars(ctx);
  const results = [];
  for (const action of rule.actions || []) {
    const runner = ACTION_RUNNERS[action.type];
    try {
      const r = runner ? await runner(action, ctx, ctx.vars, rule) : { status: 'failed', detail: 'Unknown action' };
      results.push({ type: action.type, ...r });
    } catch (err) {
      results.push({ type: action.type, status: 'failed', detail: err.message || 'Failed' });
    }
  }
  const failed = results.filter(r => r.status === 'failed').length;
  const status = !failed ? 'success' : failed === results.length ? 'failed' : 'partial';
  await AutomationRule.updateOne({ _id: rule._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } });
  return AutomationLog.create({
    ruleId: rule._id, ruleName: rule.name, trigger: rule.trigger,
    studentId: ctx.student._id, studentName: ctx.student.name, status, actions: results,
  });
}

/**
 * Fire an event from a route. Never throws and never blocks the response.
 * Actions performed by rules do not fire further events, so rules cannot loop.
 *
 * @param {string} trigger  one of TRIGGERS[].key (except schedule.daily)
 * @param {object} data     { studentId, application?, document?, fromStage?, fromStatus? }
 */
function fireEvent(trigger, data = {}) {
  setImmediate(async () => {
    try {
      const rules = await AutomationRule.find({ trigger, active: true }).lean();
      if (!rules.length) return;
      const { studentId, ...extra } = data;
      const application = extra.application?.toObject ? extra.application.toObject() : extra.application;
      const document = extra.document?.toObject ? extra.document.toObject() : extra.document;
      for (const rule of rules) {
        // Fresh context per rule: an earlier rule may have changed the student
        const ctx = await buildContext(studentId, { ...extra, application, document });
        if (!ctx) return;
        if (matches(rule, ctx)) await executeRule(rule, ctx);
      }
    } catch (err) {
      console.error(`[automation] ${trigger} failed:`, err.message);
    }
  });
}

/* ── Starter templates ─────────────────────────────────────────────────────── */

const STARTER_TEMPLATES = [
  {
    name: 'Welcome new student', channel: 'email', category: 'Onboarding',
    subject: 'Welcome to Gradzest, {{student.firstName}}!',
    body: 'Hi {{student.firstName}},\n\nThank you for joining Gradzest. We are excited to help you on your study-abroad journey.\n\nA counselor will contact you shortly. Meanwhile, log in to complete your profile and upload your documents:\n{{portal.url}}\n\nWarm regards,\nThe Gradzest Team',
  },
  {
    name: 'Counselor introduction', channel: 'email', category: 'Onboarding',
    subject: 'Meet your Gradzest counselor, {{counselor.name}}',
    body: 'Hi {{student.firstName}},\n\n{{counselor.name}} is now your dedicated counselor and will guide you through shortlisting, applications and visa.\n\nYou can reach them at {{counselor.email}} or through chat in your portal.\n\nThe Gradzest Team',
  },
  {
    name: 'Offer received – congratulations', channel: 'email', category: 'Applications',
    subject: 'Congratulations {{student.firstName}}! Offer from {{application.universityName}}',
    body: 'Hi {{student.firstName}},\n\nGreat news! You have received an offer from {{application.universityName}} for {{application.courseName}} ({{application.intake}}).\n\n{{counselor.name}} will contact you about the next steps.\n\nThe Gradzest Team',
  },
  {
    name: 'Document uploaded – please verify', channel: 'notification', category: 'Documents',
    subject: 'New document from {{student.name}}',
    body: '{{student.name}} uploaded "{{document.name}}". Please review and verify it.',
  },
  {
    name: 'No contact reminder', channel: 'notification', category: 'Follow-up',
    subject: 'Follow up with {{student.name}}',
    body: '{{student.name}} signed up and is still at stage "{{student.leadStage}}". Please get in touch.',
  },
];

async function seedStarterTemplates() {
  try {
    if (await AutomationTemplate.estimatedDocumentCount() > 0) return;
    await AutomationTemplate.insertMany(STARTER_TEMPLATES);
    console.log('[automation] Seeded starter templates');
  } catch (err) {
    console.error('[automation] Seeding templates failed:', err.message);
  }
}

module.exports = {
  TRIGGERS, FIELDS, OPERATORS, VARIABLES, ACTION_TYPES, RECIPIENTS, LEAD_STAGES,
  initAutomation, fireEvent, buildContext, matches, executeRule,
  renderEmail, renderText, stripTags, sampleVars, seedStarterTemplates,
};
