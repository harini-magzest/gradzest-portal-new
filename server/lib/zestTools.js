// Zest's Action & Execution layer: read-only tools that let Zest look at live data instead of
// only reasoning from text handed to it. Every handler re-derives its own access scope from the
// authenticated `user` object — never from anything the model claims — using the same ownership
// queries the rest of the app already uses (see routes/students.js, routes/tasks.js,
// routes/zest.js's /alerts handler). No write/mutate tools here by design: look-but-don't-touch.
// Drafting tools (follow-up messages, chat replies) only hand Zest the facts; the person copies and
// sends the result themselves. Changing things (resolving an alert, editing the knowledge base) is
// done by an admin with an explicit click in the Zest panel, never by the model.
//
// Looking up a student through Zest is a PII access like opening their profile, so it goes through
// the same logPiiAccess audit (visible on the SOC Audit tab, and counted by the bulk-access rule).

const User = require('../models/User');
const Task = require('../models/Task');
const LeadAlert = require('../models/LeadAlert');
const University = require('../models/University');
const ChatRoom = require('../models/ChatRoom');
const KnowledgeDocument = require('../models/KnowledgeDocument');
const Meeting = require('../models/Meeting');
const { buildConversion } = require('./conversionReport');
const { followupsFor } = require('./counselorFollowups');
const { daysSinceStageChange } = require('./leadRisk');
const { logPiiAccess } = require('./logPiiAccess');
const { checklistFor, timelineFor } = require('./studentProgress');
const { nextStepFor } = require('./nextStep');
const { gatherFacts, templateDraft, CHANNELS } = require('./followupDraft');
const { recentTranscript, transcriptText, needsReply, DRAFT_INSTRUCTION } = require('./zestDraft');
const { lastMessages: recentMessages } = require('./chatMessages');
const { buildInsights, documentUsage } = require('./zestInsights');

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
      + 'applications — from the daily Zest analytics job, with the lead each one is about (and, for an admin, '
      + "the lead's counselor). A counselor only sees alerts for their own leads; an admin sees all open alerts. "
      + 'Staff only.',
    input_schema: { type: 'object', properties: {} },
  },
  my_status: {
    name: 'my_status',
    description: "The signed-in student's own progress: where each application stands, which documents are still "
      + 'needed, who their counselor is, and the single most useful next step the portal has worked out for them — for '
      + '"what is my application status", "which documents am I missing", "what should I do next". Students only; it '
      + "always returns the caller's own record and takes no input.",
    input_schema: { type: 'object', properties: {} },
  },
  my_upcoming: {
    name: 'my_upcoming',
    description: "The signed-in student's own upcoming scheduled meetings (with their counselor) and the intakes of their "
      + 'open applications, soonest first — for "when is my next call", "what is coming up", "what is due soon". Students '
      + "only; it always returns the caller's own schedule and takes no input.",
    input_schema: { type: 'object', properties: {} },
  },
  draft_followup_message: {
    name: 'draft_followup_message',
    description: 'Gather the facts for a follow-up message to a student who has gone quiet: their lead stage, days since it '
      + 'last moved, open applications and documents still needed, plus a plain template as a starting point. Use it for '
      + '"draft a follow-up for Asha" — then write the message yourself from ONLY those facts and show it as a draft the '
      + "counselor copies and sends; you cannot send it. A counselor can only use it for their own students; an admin for any. Staff only.",
    input_schema: {
      type: 'object',
      properties: {
        student: { type: 'string', description: "The student's name or email." },
        channel: { type: 'string', enum: CHANNELS, description: 'email (default) or whatsapp.' },
      },
      required: ['student'],
    },
  },
  get_chat_for_reply: {
    name: 'get_chat_for_reply',
    description: 'Help reply to students in chat. With a student name, returns the recent messages of the staff member\'s own chat '
      + 'with that student so you can draft a reply to their latest message (write it yourself; you cannot send it). With no '
      + 'name, lists the staff member\'s chats where the student wrote last and is still waiting for an answer — for "who is '
      + 'waiting for my reply". Only chats the caller is part of. Staff only.',
    input_schema: {
      type: 'object',
      properties: { student: { type: 'string', description: "The student's name. Leave out to list chats waiting for a reply." } },
    },
  },
  my_day_brief: {
    name: 'my_day_brief',
    description: "A counselor's day in one look: today's remaining meetings, chats where a student is waiting for a reply, tasks "
      + 'due today and overdue, leads with no movement, and applications stuck in one status — for "brief me on my day", "what '
      + 'needs my attention", "what should I do first". Always the caller\'s own students and tasks. Counselors only; takes no input.',
    input_schema: { type: 'object', properties: {} },
  },
  conversion_report: {
    name: 'conversion_report',
    description: 'How leads convert through lead -> application -> offer -> enrolled, grouped by counselor, destination country or '
      + 'lead source — for "which counselor converts best", "how many offers did we get this month", "which country converts '
      + 'worst". Optionally limited to leads created between two dates (YYYY-MM-DD; work them out from today\'s date). Admin only.',
    input_schema: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['counselor', 'country', 'source'], description: 'counselor (default), country or source.' },
        from: { type: 'string', description: 'Only leads created on or after this date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Only leads created on or before this date, YYYY-MM-DD.' },
      },
    },
  },
  get_zest_insights: {
    name: 'get_zest_insights',
    description: 'How Zest itself is doing: questions asked, thumbs-up/down counts, the questions it had nothing to answer from '
      + '(candidates for the knowledge base) and recent unhelpful answers. For "how is Zest doing" / "what is missing from the '
      + 'knowledge base". Admin only.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Look back this many days (1-365, default 30).' } },
    },
  },
  list_knowledge_documents: {
    name: 'list_knowledge_documents',
    description: 'List the documents in Zest\'s knowledge base with their processing status — for "what is in the knowledge base" / '
      + '"did my upload work". Admin only. (Uploading, renaming and deleting are done by the admin in the Zest panel\'s Knowledge tab.)',
    input_schema: { type: 'object', properties: {} },
  },
  search_universities: {
    name: 'search_universities',
    description: "Search the portal's own university and course catalogue — for \"which universities in the UK offer an MBA\", "
      + '"cheapest masters in Germany", "scholarships at X". This is reference data, not personal data, so every role may use it. '
      + 'It is the only source for university, course, fee, intake and scholarship facts. All filters are optional.',
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

// Tools about the signed-in student's own record: they take no input, so there is no way to ask for someone else's.
const STUDENT_ONLY_TOOLS = ['my_status', 'my_upcoming'];
const STUDENT_TOOLS = ['search_universities', ...STUDENT_ONLY_TOOLS];
const ADMIN_ONLY_TOOLS = ['get_zest_insights', 'list_knowledge_documents', 'conversion_report'];
// A day brief is built from the caller's own students, so it only makes sense for a counselor.
const COUNSELOR_ONLY_TOOLS = ['my_day_brief'];

// Students get the catalogue and their own progress and schedule. Counselors get the staff tools plus their day brief;
// admins also get the Zest-management and reporting ones. A student-only tool is never offered to staff.
function getToolsForRole(role) {
  // Guests (signed-out visitors on the public site) get the catalogue only. Checked first so a guest never falls
  // through to the staff filter below.
  if (role === 'guest') return [TOOL_SCHEMAS.search_universities];
  if (role === 'student') return STUDENT_TOOLS.map(n => TOOL_SCHEMAS[n]);
  return Object.values(TOOL_SCHEMAS).filter(t => !STUDENT_ONLY_TOOLS.includes(t.name)
    && (role === 'admin' || !ADMIN_ONLY_TOOLS.includes(t.name))
    && (role === 'counselor' || !COUNSELOR_ONLY_TOOLS.includes(t.name)));
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
  const [total, alerts] = await Promise.all([
    LeadAlert.countDocuments(filter),
    LeadAlert.find(filter).select('userId alertType severity detail flaggedOn')
      .sort({ flaggedOn: -1, severity: 1 }).limit(RESULT_CAP).lean(),
  ]);

  const leads = await User.find({ _id: { $in: alerts.map(a => a.userId) } }).select('name counselorId').lean();
  const leadById = new Map(leads.map(l => [String(l._id), l]));
  // Only an admin sees across counselors, so only an admin needs to be told whose lead each one is.
  let counselorById = new Map();
  if (user.role === 'admin') {
    const counselors = await User.find({ _id: { $in: leads.map(l => l.counselorId).filter(Boolean) } }).select('name').lean();
    counselorById = new Map(counselors.map(c => [String(c._id), c.name]));
  }
  return {
    total, shown: alerts.length,
    alerts: alerts.map(a => {
      const lead = leadById.get(String(a.userId));
      return {
        lead: lead?.name || null,
        ...(user.role === 'admin' ? { counselor: counselorById.get(String(lead?.counselorId)) || null } : {}),
        type: a.alertType, severity: a.severity, detail: a.detail, flaggedOn: a.flaggedOn,
      };
    }),
  };
}

// Students only, and takes no input: there is nothing to steer toward anyone else's record.
async function myStatus(_input, user) {
  if (user.role !== 'student') return { error: 'This is for students. Use lookup_student_status to look up a student.' };
  const self = await User.findById(user.id).select('name email status applications documents leadStageChangedAt createdAt joinedDate counselorId').lean();
  if (!self) return { error: 'Could not load your own record.' };

  const [checklist, timeline, counselor] = await Promise.all([
    checklistFor(user.id).catch(() => null),
    timelineFor(user.id).catch(() => null),
    self.counselorId ? User.findById(self.counselorId).select('name').lean() : null,
  ]);
  // The same "next step" the student's dashboard shows, so Zest and the portal never disagree.
  const next = checklist && timeline ? nextStepFor(checklist, timeline.applications) : null;
  return {
    ...summarizeStudent(self),
    counselor: counselor?.name || null,
    documentChecklist: (checklist?.items || []).slice(0, 20).map(i => ({ document: i.label, status: i.status })),
    nextStep: next ? { title: next.title, detail: next.detail, where: next.action?.to || null } : null,
  };
}

const istDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
const istTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }); // HH:MM

// Students only, no input. Meetings are matched on the caller's own id, so another student's meetings are unreachable.
async function myUpcoming(_input, user) {
  if (user.role !== 'student') return { error: 'This is for students.' };
  const today = istDate();
  const now = istTime();

  const [meetings, timeline] = await Promise.all([
    Meeting.find({ status: 'scheduled', scheduledDate: { $gte: today }, 'participants.userId': String(user.id) })
      .select('title scheduledDate scheduledTime duration platform meetingLink participants')
      .sort({ scheduledDate: 1, scheduledTime: 1 }).limit(10).lean(),
    timelineFor(user.id).catch(() => null),
  ]);

  return {
    today,
    meetings: meetings
      // The query is by date; a call earlier today has already happened.
      .filter(m => m.scheduledDate > today || m.scheduledTime >= now)
      .slice(0, 5)
      .map(m => ({
        title: m.title, date: m.scheduledDate, time: m.scheduledTime, minutes: m.duration, platform: m.platform,
        link: m.meetingLink || null,
        with: (m.participants || []).filter(p => String(p.userId) !== String(user.id)).map(p => p.name).filter(Boolean),
      })),
    intakes: (timeline?.applications || [])
      .filter(a => typeof a.daysToIntake === 'number' && a.daysToIntake >= 0 && !['rejected', 'enrolled'].includes(a.status))
      .sort((a, b) => a.daysToIntake - b.daysToIntake)
      .slice(0, 5)
      .map(a => ({ university: a.universityName || null, course: a.courseName || null, intake: a.intake, daysAway: a.daysToIntake, status: a.status })),
  };
}

// Same scoping as lookup_student_status: a counselor reaches only their own assigned students, an admin any.
async function findScopedStudents(query, user, select, limit = 5) {
  const rx = new RegExp(escapeRegex(query), 'i');
  const filter = { role: 'student', $or: [{ name: rx }, { email: rx }] };
  if (user.role === 'counselor') filter.counselorId = user.id;
  return User.find(filter).select(select).limit(limit).lean();
}

const NO_STUDENT = (user) => (user.role === 'counselor'
  ? 'No student matching that name/email found among your own assigned leads.'
  : 'No student matching that name/email found.');

async function draftFollowupMessage({ student, channel } = {}, user, ctx = {}) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const q = safeQuery(student);
  if (!q) return { error: "The student's name or email is required." };
  const ch = CHANNELS.includes(channel) ? channel : 'email';

  const matches = await findScopedStudents(q, user, 'name leadStage leadStageChangedAt createdAt preferredCountries applications counselorId');
  if (!matches.length) return { error: NO_STUDENT(user) };
  if (matches.length > 1) {
    return { error: 'More than one student matches. Ask which one is meant.', matches: matches.map(m => m.name) };
  }
  const lead = matches[0];
  logPiiAccess({ accessor: user, applicant: lead, accessType: 'view', ip: ctx.ip || '', io: ctx.io || null });

  const checklist = await checklistFor(lead._id).catch(() => null);
  const facts = gatherFacts(lead, checklist);
  // Contact details are deliberately not returned: the wording needs only the facts, and the counselor already
  // knows how to reach their student.
  return {
    student: lead.name, channel: ch, facts,
    startingPoint: templateDraft(facts, ch, user.name || ''),
    instructions: 'Write the message yourself from ONLY these facts, in the counselor\'s voice. Do not invent deadlines, fees, offers or promises, '
      + 'use no placeholders, make one clear next step, and do not say you are an AI. '
      + (ch === 'whatsapp' ? '2-4 sentences, no subject.' : 'A "Subject:" line, then at most 3 short paragraphs.')
      + ' Present it as a draft for the counselor to copy and send; you cannot send it.',
  };
}

const SNIPPET = 140;
const chatsOf = (user) => ({ participants: String(user.id), type: { $ne: 'group' } });
const ROOM_FIELDS = 'participants participantNames updatedAt';
// A chat with its last 12 messages, which is all a reply draft reads
const withRecentMessages = async (room) => ({ ...room, messages: await recentMessages(room._id, 12) });

// The caller's own one-to-one chats where the student wrote last, most recently active first.
async function waitingChats(user) {
  const found = await ChatRoom.find(chatsOf(user)).select(ROOM_FIELDS).sort({ updatedAt: -1 }).limit(50).lean();
  const rooms = await Promise.all(found.map(withRecentMessages));
  const waiting = [];
  for (const room of rooms) {
    const lines = recentTranscript(room.messages);
    if (!needsReply(lines)) continue;
    const i = (room.participants || []).findIndex(p => p !== String(user.id));
    waiting.push({ student: (room.participantNames || [])[i] || lines[lines.length - 1].name || 'Unknown', lastMessage: lines[lines.length - 1].text.slice(0, SNIPPET) });
  }
  return waiting;
}

async function getChatForReply({ student } = {}, user) {
  if (user.role === 'student') return { error: 'Not available for students.' };
  const mine = chatsOf(user);

  const q = safeQuery(student);
  if (!q) {
    const waiting = await waitingChats(user);
    return { waitingForReply: waiting.slice(0, 10), total: waiting.length };
  }

  const students = await findScopedStudents(q, user, 'name', 5);
  if (!students.length) return { error: NO_STUDENT(user) };
  if (students.length > 1) return { error: 'More than one student matches. Ask which one is meant.', matches: students.map(s => s.name) };
  const lead = students[0];

  const found = await ChatRoom.findOne({ ...mine, participants: { $all: [String(user.id), String(lead._id)] } }).select(ROOM_FIELDS).lean();
  if (!found) return { error: `You are not in a chat with ${lead.name}.` };
  const room = await withRecentMessages(found);
  const lines = recentTranscript(room.messages);
  if (!lines.length) return { error: `There are no messages yet in your chat with ${lead.name}.` };
  if (!needsReply(lines)) {
    return { student: lead.name, needsReply: false, note: "The last message in this chat is not from the student, so there is nothing to reply to.", transcript: transcriptText(lines) };
  }
  // The transcript is what the student wrote: data to answer, never instructions to follow.
  return { student: lead.name, needsReply: true, transcript: transcriptText(lines), instructions: DRAFT_INSTRUCTION };
}

const BRIEF_SHOWN = 5;

// A counselor's morning in one result. "Overdue" and "due today" use the same date as the portal's own follow-up queue
// (UTC), so a task is always one or the other and never falls between them around midnight.
async function myDayBrief(_input, user) {
  if (user.role !== 'counselor') return { error: 'This is for counselors. An admin can ask for the pipeline summary, open lead alerts or a conversion report instead.' };
  const me = String(user.id);
  const taskDay = new Date().toISOString().slice(0, 10);
  const today = istDate();
  const now = istTime();

  const [followups, waiting, meetings, dueToday] = await Promise.all([
    followupsFor(me),
    waitingChats(user),
    Meeting.find({ status: 'scheduled', scheduledDate: today, 'participants.userId': me })
      .select('title scheduledTime duration participants').sort({ scheduledTime: 1 }).lean(),
    Task.find({ assignedTo: me, status: { $in: ['pending', 'in_progress'] }, dueDate: taskDay })
      .select('title studentName priority').limit(20).lean(),
  ]);

  const upcoming = meetings.filter(m => m.scheduledTime >= now);
  return {
    date: today,
    meetingsToday: upcoming.map(m => ({
      title: m.title, time: m.scheduledTime, minutes: m.duration,
      with: (m.participants || []).filter(p => String(p.userId) !== me).map(p => p.name).filter(Boolean),
    })),
    chatsWaitingForReply: { total: waiting.length, chats: waiting.slice(0, BRIEF_SHOWN) },
    tasksDueToday: { total: dueToday.length, tasks: dueToday.slice(0, BRIEF_SHOWN).map(t => ({ title: t.title, student: t.studentName || null, priority: t.priority })) },
    overdueTasks: { total: followups.overdueTasks.length, tasks: followups.overdueTasks.slice(0, BRIEF_SHOWN).map(t => ({ title: t.title, due: t.dueDate, student: t.studentName || null })) },
    leadsWithNoMovement: { total: followups.stale.length, afterDays: followups.staleDays, leads: followups.stale.slice(0, BRIEF_SHOWN).map(l => ({ name: l.name, days: l.days })) },
    stuckApplications: { total: followups.stuck.length, applications: followups.stuck.slice(0, BRIEF_SHOWN).map(a => ({ student: a.name, university: a.universityName || null, status: a.status, days: a.days })) },
  };
}

const REPORT_ROWS_SHOWN = 15;
const GROUPINGS = ['counselor', 'country', 'source'];
const isoDay = (v, endOfDay) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
  const d = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00'}Z`);
  return isNaN(d.getTime()) ? null : d;
};

// The same report as the admin dashboard's conversion endpoint (lib/conversionReport.js does the counting), read-only.
async function conversionReport({ groupBy, from, to } = {}, user) {
  if (user.role !== 'admin') return { error: 'Admin only.' };
  const group = GROUPINGS.includes(groupBy) ? groupBy : 'counselor';
  const fromDate = isoDay(from, false);
  const toDate = isoDay(to, true);
  if (from && !fromDate) return { error: 'from must be a date written YYYY-MM-DD.' };
  if (to && !toDate) return { error: 'to must be a date written YYYY-MM-DD.' };

  const [students, counselors] = await Promise.all([
    User.find({ role: 'student' }).select('counselorId source preferredCountries applications.status createdAt').lean(),
    User.find({ role: 'counselor' }).select('name').lean(),
  ]);
  const report = buildConversion(students, group, { counselorNames: new Map(counselors.map(c => [String(c._id), c.name])), from: fromDate, to: toDate });
  return {
    groupBy: group, from: from || null, to: to || null,
    totals: report.totals, total: report.rows.length, shown: Math.min(report.rows.length, REPORT_ROWS_SHOWN),
    rows: report.rows.slice(0, REPORT_ROWS_SHOWN),
    ...(group === 'country' ? { note: 'A student interested in several countries counts once under each, so country rows can add up to more than the number of students.' } : {}),
  };
}

const DOWNVOTED_SHOWN = 5;

async function getZestInsights({ days } = {}, user) {
  if (user.role !== 'admin') return { error: 'Admin only.' };
  const data = await buildInsights(days);
  return {
    days: data.days, questionsAsked: data.total, helpful: data.up, notHelpful: data.down,
    helpfulRatePercent: data.rated ? Math.round((data.up / data.rated) * 100) : null,
    timesTheAIWasUnavailable: data.degraded,
    mostUsedLookups: data.toolUsage.slice(0, 8),
    unansweredQuestions: data.unanswered.slice(0, 10),
    recentUnhelpfulAnswers: data.downvoted.slice(0, DOWNVOTED_SHOWN).map(d => ({
      question: d.question, answer: String(d.answer || '').slice(0, 300), comment: d.comment,
    })),
  };
}

async function listKnowledgeDocuments(_input, user) {
  if (user.role !== 'admin') return { error: 'Admin only.' };
  const [total, docs, usage] = await Promise.all([
    KnowledgeDocument.countDocuments({}),
    KnowledgeDocument.find().select('title status chunkCount error createdAt').sort({ createdAt: -1 }).limit(30).lean(),
    documentUsage(90),
  ]);
  return {
    total, shown: docs.length,
    documents: docs.map(d => ({
      title: d.title, status: d.status, sections: d.chunkCount, usedAsSourceInLast90Days: usage.get(String(d._id)) || 0,
      ...(d.error ? { problem: d.error } : {}), added: d.createdAt,
    })),
  };
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
  my_status: myStatus,
  my_upcoming: myUpcoming,
  my_day_brief: myDayBrief,
  conversion_report: conversionReport,
  draft_followup_message: draftFollowupMessage,
  get_chat_for_reply: getChatForReply,
  get_zest_insights: getZestInsights,
  list_knowledge_documents: listKnowledgeDocuments,
};

// What the chat panel shows while a tool runs ("Checking your students…") instead of bare dots. Plain words only:
// nothing from the tool's input or result goes in here, since it is sent to the browser before the answer is.
const TOOL_STATUS = {
  lookup_student_status: 'Looking up the student…',
  list_my_students: 'Checking your students…',
  pipeline_summary: 'Counting your pipeline…',
  list_my_open_tasks: 'Checking your tasks…',
  list_open_lead_alerts: 'Checking lead alerts…',
  search_universities: 'Searching the university catalogue…',
  my_status: 'Checking your progress…',
  my_upcoming: 'Checking your calendar…',
  draft_followup_message: 'Gathering the facts for a follow-up…',
  get_chat_for_reply: 'Reading the chat…',
  my_day_brief: 'Putting your day together…',
  conversion_report: 'Working out the conversion numbers…',
  get_zest_insights: 'Reviewing how Zest is doing…',
  list_knowledge_documents: 'Checking the knowledge base…',
};
const statusFor = (name) => TOOL_STATUS[name] || 'Looking that up…';

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

module.exports = { getToolsForRole, executeTool, statusFor, escapeRegex, LEAD_STATUSES };
