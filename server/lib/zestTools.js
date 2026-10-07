// Zest's Action & Execution layer: read-only tools that let Zest look at live data instead of
// only reasoning from text handed to it. Every handler re-derives its own access scope from the
// authenticated `user` object — never from anything the model claims — using the same ownership
// queries the rest of the app already uses (see routes/students.js, routes/tasks.js,
// routes/zest.js's /alerts handler). No write/mutate tools here by design: v1 is look-but-don't-touch.
//
// Looking up a student through Zest is a PII access like opening their profile, so it goes through
// the same logPiiAccess audit (visible on the SOC Audit tab, and counted by the bulk-access rule).

const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const University = require('../models/University');
const { daysSinceStageChange } = require('./leadRisk');
const { logPiiAccess } = require('./logPiiAccess');

const RESULT_CAP = 15;
const LEAD_STATUSES = ['active', 'inactive', 'counseling', 'shortlisting', 'application', 'test_preparation', 'visa_process', 'loan_process', 'enrolled'];

// The query reaches us from the model (which got it from a user, or from text inside an attached
// document), so it is never treated as a pattern: special characters are matched literally and the
// length is bounded. Otherwise "(a+)+$" could pin the database, and ".*" would match everyone.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeQuery = (s) => String(s || '').trim().slice(0, 80);

const TOOL_SCHEMAS = {
  lookup_student_status: {
    name: 'lookup_student_status',
    description: "Look up a student's current lead status, application progress, and document status. "
      + 'A student calling this always gets their own record, regardless of what query is given — it never '
      + "takes a name/email from a student. A counselor only sees students assigned to them; an admin can "
      + 'look up any student.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "The student's name or email to search for (ignored for the student role, who always gets their own record)." },
      },
      required: ['query'],
    },
  },
  list_my_students: {
    name: 'list_my_students',
    description: 'List students with their lead stage and how many days since the stage last changed — for "who is stuck", '
      + '"which students are in visa process", "my students in shortlisting". A counselor sees only their own assigned '
      + `students; an admin sees all. Optional status filter (one of: ${LEAD_STATUSES.join(', ')}). Staff only. `
      + `Shows at most ${RESULT_CAP}, longest-waiting first, plus the real total.`,
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', description: 'Only students in this lead stage.' } },
    },
  },
  pipeline_summary: {
    name: 'pipeline_summary',
    description: 'Count of students in each lead stage — for "how many students do I have", "what does my pipeline look like". '
      + 'A counselor gets counts for their own students only; an admin gets all students. Staff only.',
    input_schema: { type: 'object', properties: {} },
  },
  list_my_open_tasks: {
    name: 'list_my_open_tasks',
    description: "List the caller's own open tasks (pending or in progress) — tasks they created or that were "
      + 'assigned to them. Staff only (counselor/admin).',
    input_schema: { type: 'object', properties: {} },
  },
  list_open_lead_alerts: {
    name: 'list_open_lead_alerts',
    description: 'List open (unresolved) lead alerts — stale leads, possible duplicates, overdue tasks, stuck '
      + 'applications — from the daily Zest analytics job. A counselor only sees alerts for their own leads; an '
      + 'admin sees all open alerts. Staff only.',
    input_schema: { type: 'object', properties: {} },
  },
  search_universities: {
    name: 'search_universities',
    description: "Search the portal's own university and course catalogue — for \"which universities in the UK offer an MBA\", "
      + '"cheapest masters in Germany", "scholarships at X". This is reference data, not personal data, so every role may use it. '
      + 'Prefer it over general knowledge for anything about universities Gradzest works with. All filters are optional.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name, e.g. "United Kingdom".' },
        course: { type: 'string', description: 'Part of a course name, e.g. "MBA" or "data science".' },
        name: { type: 'string', description: 'Part of a university name.' },
      },
    },
  },
};

// Students get catalogue search only: for personal-data questions they only ever get their own
// data anyway, and a model deciding "no tool needed, I already know who's asking" is a worse
// failure mode than there being nothing to pick.
function getToolsForRole(role) {
  // Guests (signed-out visitors on the public site) get the same catalogue-only toolset.
  if (role === 'student' || role === 'guest') return [TOOL_SCHEMAS.search_universities];
  return Object.values(TOOL_SCHEMAS);
}

function summarizeStudent(student) {
  const days = daysSinceStageChange(student);
  return {
    name: student.name,
    email: student.email,
    leadStatus: student.status,
    daysSinceStageChange: days,
    applications: (student.applications || []).map(a => ({
      university: a.universityName, course: a.courseName, status: a.status, intake: a.intake,
    })),
    pendingDocuments: (student.documents || []).filter(d => d.status === 'pending').map(d => d.name),
  };
}

async function lookupStudentStatus({ query }, user, ctx = {}) {
  if (user.role === 'student') {
    const self = await User.findById(user.id).select('name email status applications documents leadStageChangedAt createdAt joinedDate').lean();
    if (!self) return { error: 'Could not load your own record.' };
    return summarizeStudent(self);
  }

  const q = safeQuery(query);
  if (!q) return { error: 'A name or email is required.' };

  const rx = new RegExp(escapeRegex(q), 'i');
  const filter = { role: 'student', $or: [{ name: rx }, { email: rx }] };
  if (user.role === 'counselor') filter.counselorId = user.id;

  const matches = await User.find(filter)
    .select('name email status applications documents leadStageChangedAt createdAt joinedDate counselorId')
    .limit(5).lean();

  if (!matches.length) {
    return { error: user.role === 'counselor'
      ? "No student matching that name/email found among your own assigned leads."
      : 'No student matching that name/email found.' };
  }
  // Same audit as opening the profile: who looked at whose documents, via Zest.
  for (const s of matches) logPiiAccess({ accessor: user, applicant: s, accessType: 'view', ip: ctx.ip || '', io: ctx.io || null });
  return { matches: matches.map(summarizeStudent) };
}

function studentScope(user) {
  const filter = { role: 'student' };
  if (user.role === 'counselor') filter.counselorId = user.id;
  return filter;
}

async function listMyStudents({ status } = {}, user) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const filter = studentScope(user);
  if (status) {
    if (!LEAD_STATUSES.includes(status)) return { error: `Unknown stage "${String(status).slice(0, 30)}". Valid stages: ${LEAD_STATUSES.join(', ')}.` };
    filter.status = status;
  }
  const [total, rows] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).select('name status leadStageChangedAt statusChangedAt createdAt joinedDate').sort({ leadStageChangedAt: 1 }).limit(RESULT_CAP).lean(),
  ]);
  return {
    total, shown: rows.length,
    students: rows.map(s => ({ name: s.name, leadStatus: s.status, daysSinceStageChange: daysSinceStageChange(s) })),
  };
}

async function pipelineSummary(_input, user) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const rows = await User.aggregate([{ $match: studentScope(user) }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const byStage = Object.fromEntries(LEAD_STATUSES.map(s => [s, 0]));
  let total = 0;
  for (const r of rows) { byStage[r._id || 'unknown'] = r.count; total += r.count; }
  return { total, byStage };
}

async function listMyOpenTasks(_input, user) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const tasks = await Task.find({
    $or: [{ assignedBy: user.id }, { assignedTo: user.id }],
    status: { $in: ['pending', 'in_progress'] },
  }).select('title status dueDate studentName priority').sort({ dueDate: 1 }).limit(RESULT_CAP).lean();
  return { tasks: tasks.map(t => ({ title: t.title, status: t.status, dueDate: t.dueDate, student: t.studentName || null, priority: t.priority })) };
}

async function listOpenLeadAlerts(_input, user) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const filter = { resolved: false };
  if (user.role === 'counselor') filter.counselorId = user.id;
  const alerts = await LeadAlert.find(filter).select('alertType severity detail flaggedOn')
    .sort({ flaggedOn: -1, severity: 1 }).limit(RESULT_CAP).lean();
  return { alerts: alerts.map(a => ({ type: a.alertType, severity: a.severity, detail: a.detail, flaggedOn: a.flaggedOn })) };
}

async function searchUniversities({ country, course, name } = {}) {
  const and = [];
  const like = (s) => new RegExp(escapeRegex(safeQuery(s)), 'i');
  if (safeQuery(country)) and.push({ country: like(country) });
  if (safeQuery(name)) and.push({ name: like(name) });
  if (safeQuery(course)) and.push({ 'courses.name': like(course) });
  if (!and.length) return { error: 'Give at least a country, a course or a university name.' };

  const unis = await University.find({ $and: and }).select('name country city ranking courses scholarships applicationDeadlines acceptanceRate')
    .sort({ ranking: 1 }).limit(8).lean();
  if (!unis.length) return { error: 'No matching universities in the portal catalogue.' };
  const courseRx = safeQuery(course) ? like(course) : null;
  return {
    universities: unis.map(u => ({
      name: u.name, country: u.country, city: u.city, ranking: u.ranking || null, acceptanceRate: u.acceptanceRate ?? null,
      matchingCourses: (u.courses || []).filter(c => !courseRx || courseRx.test(c.name || '')).slice(0, 5).map(c => ({
        name: c.name, level: c.level, duration: c.duration, tuitionFee: c.tuitionFee, currency: c.currency, intake: c.intake,
        scholarshipAvailable: !!c.scholarshipAvailable,
      })),
      scholarships: (u.scholarships || []).slice(0, 3).map(s => ({ name: s.name, amount: s.amount, currency: s.currency, deadline: s.deadline })),
      applicationDeadlines: (u.applicationDeadlines || []).slice(0, 3),
    })),
  };
}

const HANDLERS = {
  lookup_student_status: lookupStudentStatus,
  list_my_students: listMyStudents,
  pipeline_summary: pipelineSummary,
  list_my_open_tasks: listMyOpenTasks,
  list_open_lead_alerts: listOpenLeadAlerts,
  search_universities: searchUniversities,
};

/**
 * @param {string} name  tool name from a tool_use block
 * @param {object} input  tool_use block's input
 * @param {{ id: string, role: string }} user  the authenticated caller — never trust anything else for scoping
 * @param {{ ip?: string, io?: object }} [ctx]  request context, used only for the PII access audit
 * @returns {Promise<object>} JSON-serializable result, or { error } on a handled failure
 */
async function executeTool(name, input, user, ctx = {}) {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  // A guest has no account to scope by, so only public reference data is reachable, whatever tool is named.
  if (!user && name !== 'search_universities') return { error: 'Not available without signing in.' };
  // Scoping is enforced inside each handler (students are refused staff tools even if they name them).
  try {
    return await handler(input || {}, user, ctx);
  } catch (err) {
    console.error(`[zestTools] ${name} failed:`, err.message);
    return { error: 'That lookup failed. Please try again.' };
  }
}

module.exports = { getToolsForRole, executeTool, escapeRegex, LEAD_STATUSES };
