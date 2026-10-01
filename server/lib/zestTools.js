// Zest's Action & Execution layer: read-only tools that let Zest look at live data instead of
// only reasoning from text handed to it. Every handler re-derives its own access scope from the
// authenticated `user` object — never from anything the model claims — using the same ownership
// queries the rest of the app already uses (see routes/students.js, routes/tasks.js,
// routes/zest.js's /alerts handler). No write/mutate tools here by design: v1 is look-but-don't-touch.

const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const { daysSinceStageChange } = require('./leadRisk');

const RESULT_CAP = 15;

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
};

// Students get no tools: they only ever get their own data anyway, and a model deciding "no tool
// needed, I already know who's asking" is a worse failure mode than there being nothing to pick.
function getToolsForRole(role) {
  if (role === 'student') return [];
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

async function lookupStudentStatus({ query }, user) {
  if (user.role === 'student') {
    const self = await User.findById(user.id).select('name email status applications documents leadStageChangedAt createdAt joinedDate').lean();
    if (!self) return { error: 'Could not load your own record.' };
    return summarizeStudent(self);
  }

  const q = String(query || '').trim();
  if (!q) return { error: 'A name or email is required.' };

  const filter = { role: 'student', $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] };
  if (user.role === 'counselor') filter.counselorId = user.id;

  const matches = await User.find(filter)
    .select('name email status applications documents leadStageChangedAt createdAt joinedDate counselorId')
    .limit(5).lean();

  if (!matches.length) {
    return { error: user.role === 'counselor'
      ? "No student matching that name/email found among your own assigned leads."
      : 'No student matching that name/email found.' };
  }
  return { matches: matches.map(summarizeStudent) };
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

const HANDLERS = {
  lookup_student_status: lookupStudentStatus,
  list_my_open_tasks: listMyOpenTasks,
  list_open_lead_alerts: listOpenLeadAlerts,
};

/**
 * @param {string} name  tool name from a tool_use block
 * @param {object} input  tool_use block's input
 * @param {{ id: string, role: string }} user  the authenticated caller — never trust anything else for scoping
 * @returns {Promise<object>} JSON-serializable result, or { error } on a handled failure
 */
async function executeTool(name, input, user) {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool: ${name}` };
  try {
    return await handler(input || {}, user);
  } catch (err) {
    console.error(`[zestTools] ${name} failed:`, err.message);
    return { error: 'That lookup failed. Please try again.' };
  }
}

module.exports = { getToolsForRole, executeTool };
