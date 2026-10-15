// The paged admin lists (lib/paging.js): students, applications and email subscribers. Each answers one page with the
// totals and counts the page shows, filtering and sorting in the database the way the page used to in the browser.
// Lean queries choose the page; only that page's documents are loaded in full, through the same toJSON as the whole
// list, so a paged item is the same object the whole list returns.
const User = require('../models/User');
const Subscriber = require('../models/Subscriber');
const { containsText, matchWithDefault, firstDate, inOrder } = require('./paging');
const userVersion = require('./userVersion');

const facetPage = ({ skip, limit }) => ({ $facet: { rows: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } });
const unpackFacet = ([out]) => ({ rows: out.rows, total: out.total[0]?.n || 0 });

/* ── Students ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const STUDENT_STATUS_DEFAULT = User.schema.path('status').defaultValue;
const LEAD_STAGES = User.schema.path('leadStage').enumValues;

// The Students page's filters. A student without a lead stage shows as "New Enquiry", and one without a counselor (or
// with an empty one) as unassigned.
function studentFilter(q = {}) {
  const and = [{ role: 'student' }];
  if (q.lead === 'new') and.push({ leadStatus: 'new' });
  if (q.status) and.push(matchWithDefault('status', q.status, STUDENT_STATUS_DEFAULT));
  if (q.stage) {
    and.push(q.stage === 'new_enquiry' ? { leadStage: { $nin: LEAD_STAGES.filter((s) => s !== 'new_enquiry') } } : { leadStage: q.stage });
  }
  if (q.country) and.push({ preferredCountries: q.country });
  if (q.counselorId === 'unassigned') and.push({ counselorId: { $in: [null, ''] } });
  else if (q.counselorId) and.push({ counselorId: q.counselorId });
  // joinedDate is a YYYY-MM-DD string; a student without one is outside any "from", but not outside a "to"
  if (q.from) and.push({ joinedDate: { $gte: q.from } });
  if (q.to) and.push({ $or: [{ joinedDate: { $lte: `${q.to}￿` } }, { joinedDate: { $in: [null, ''] } }] });
  const rx = containsText(q.q);
  if (rx) and.push({ $or: [{ name: rx }, { email: rx }, { phone: rx }] });
  return { $and: and };
}

// Newest first, by the day they joined (or when the account was made)
const studentOrder = (q, project = {}) => [
  { $match: studentFilter(q) },
  { $project: { ...project, _sortAt: firstDate(['$joinedDate', '$createdAt']) } },
  { $sort: { _sortAt: -1, _id: -1 } },
];

async function studentCounts() {
  const [c] = await User.aggregate([
    { $match: { role: 'student' } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
      enrolled: { $sum: { $cond: [{ $eq: ['$status', 'enrolled'] }, 1, 0] } },
      unassigned: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$counselorId', ''] }, ''] }, 1, 0] } },
      newLeads: { $sum: { $cond: [{ $eq: ['$leadStatus', 'new'] }, 1, 0] } },
    } },
  ]);
  const { total = 0, inactive = 0, enrolled = 0, unassigned = 0, newLeads = 0 } = c || {};
  return { total, active: total - inactive - enrolled, inactive, enrolled, unassigned, newLeads };
}

// The tab counts and the country list are the same for every page and every filter, and each one reads every student
// (about 180 of 320 ms per page at 20,000 students). They are remembered while no user has been written
// (lib/userVersion.js); the TTL is only the backstop for writes this process cannot see.
let summaryTtlMs = process.env.NODE_ENV === 'test' ? 0 : 10000;
let summaryCache = null;
function setSummaryTtl(ms) { summaryTtlMs = ms; summaryCache = null; }

async function studentSummary() {
  const version = userVersion.current();
  if (summaryTtlMs > 0 && summaryCache && summaryCache.version === version && Date.now() - summaryCache.at < summaryTtlMs) {
    return summaryCache.value;
  }
  const value = await Promise.all([studentCounts(), User.distinct('preferredCountries', { role: 'student' })]);
  // keyed by the version read BEFORE the queries: a write that lands while they run leaves the entry already stale
  if (summaryTtlMs > 0) summaryCache = { version, at: Date.now(), value };
  return value;
}

async function studentPage(q, paging) {
  const [{ rows, total }, [counts, countries]] = await Promise.all([
    User.aggregate([...studentOrder(q), facetPage(paging)]).then(unpackFacet),
    studentSummary(),
  ]);
  const ids = rows.map((r) => r._id);
  const docs = ids.length ? await User.find({ _id: { $in: ids } }).select('-password') : [];
  return {
    items: inOrder(ids, docs).map((s) => s.toJSON()),
    total, page: paging.page, limit: paging.limit, counts,
    countries: countries.filter(Boolean).sort(),
  };
}

// Every matching student's id, in list order: the student page's ‹ › arrows step through these
async function studentIds(q) {
  const rows = await User.aggregate(studentOrder(q));
  return { ids: rows.map((r) => String(r._id)) };
}

// The columns the page's CSV export uses, for every matching student
async function studentExport(q) {
  const fields = { name: 1, email: 1, nationality: 1, status: 1, leadStage: 1, counselorId: 1, joinedDate: 1 };
  const rows = await User.aggregate(studentOrder(q, fields));
  return { items: rows.map(({ _sortAt, _id, ...r }) => ({ id: String(_id), ...r })) };
}

/* ── Applications ───────────────────────────────────────────────────────────────────────────────────────────────── */

const APPLICATION_STATUS_DEFAULT = User.schema.path('applications').schema.path('status').defaultValue;
// A stored application without a status reads as the default, as it does once loaded
const appStatus = { $cond: [{ $eq: [{ $type: '$app.status' }, 'missing'] }, APPLICATION_STATUS_DEFAULT, '$app.status'] };

function applicationOrder(q = {}) {
  const match = [];
  if (q.status) match.push({ _status: q.status });
  const rx = containsText(q.q);
  if (rx) match.push({ $or: [{ name: rx }, { email: rx }, { 'app.universityName': rx }, { 'app.courseName': rx }] });
  return [
    { $match: { role: 'student', 'applications.0': { $exists: true } } },
    { $project: { name: 1, email: 1, nationality: 1, app: '$applications' } },
    { $unwind: '$app' },
    { $addFields: { _status: appStatus } },
    ...(match.length ? [{ $match: { $and: match } }] : []),
    // Most recently changed first
    { $addFields: { _sortAt: firstDate(['$app.updatedDate', '$app.updatedAt', '$app.submittedDate', '$app.createdAt']) } },
    { $sort: { _sortAt: -1, _id: 1, 'app._id': 1 } },
  ];
}

// Loads the students behind these (studentId, applicationId) rows and returns each application exactly as the whole
// list does: the application's own toJSON plus the student's id, name, email and nationality.
async function applicationItems(rows) {
  if (!rows.length) return [];
  const students = await User.find({ _id: { $in: [...new Set(rows.map((r) => String(r._id)))] } })
    .select('name email nationality applications');
  const byId = new Map(students.map((s) => [String(s._id), s]));
  return rows.map((r) => {
    const student = byId.get(String(r._id));
    const app = student?.applications.id(r.app._id);
    if (!app) return null; // removed since the page was chosen
    return {
      ...(app.toJSON ? app.toJSON() : app),
      studentId: student._id.toString(),
      studentName: student.name,
      studentEmail: student.email,
      studentNationality: student.nationality,
    };
  }).filter(Boolean);
}

async function applicationStatusCounts() {
  const rows = await User.aggregate([
    { $match: { role: 'student', 'applications.0': { $exists: true } } },
    { $project: { app: '$applications' } },
    { $unwind: '$app' },
    { $group: { _id: appStatus, n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

async function applicationPage(q, paging) {
  const [{ rows, total }, statusCounts] = await Promise.all([
    User.aggregate([...applicationOrder(q), facetPage(paging)]).then(unpackFacet),
    applicationStatusCounts(),
  ]);
  return { items: await applicationItems(rows), total, page: paging.page, limit: paging.limit, statusCounts };
}

// The students behind every matching application, once each, in list order (the profile's ‹ › arrows)
async function applicationStudentIds(q) {
  const rows = await User.aggregate([...applicationOrder(q), { $project: { _id: 1 } }]);
  return { ids: [...new Set(rows.map((r) => String(r._id)))] };
}

// The columns the page's CSV export uses, for every matching application
async function applicationExport(q) {
  const rows = await User.aggregate([
    ...applicationOrder(q),
    { $project: {
      studentName: '$name', studentEmail: '$email', studentNationality: '$nationality', status: '$_status',
      universityName: '$app.universityName', courseName: '$app.courseName', intake: '$app.intake',
      submittedDate: '$app.submittedDate', updatedDate: '$app.updatedDate', notes: '$app.notes',
    } },
  ]);
  return { items: rows.map(({ _id, ...r }) => r) };
}

/* ── Email subscribers ──────────────────────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 86400000;

function subscriberFilter(q = {}, now = Date.now()) {
  const and = [];
  // A subscriber without a follow-up status is a new one
  if (q.leadStatus) and.push(q.leadStatus === 'new' ? { leadStatus: { $in: [null, '', 'new'] } } : { leadStatus: q.leadStatus });
  if (q.days) and.push({ subscribedAt: { $gte: new Date(now - Number(q.days) * DAY_MS) } });
  const rx = containsText(q.q);
  if (rx) and.push({ $or: [{ name: rx }, { email: rx }, { phone: rx }, { notes: rx }] });
  return and.length ? { $and: and } : {};
}

// The tiles above the list, over every subscriber. `weekStart` is the start of "this week" in the viewer's time zone
// (midnight seven days ago); `seenAt` is when this admin last opened the list.
async function subscriberStats({ weekStart, seenAt }) {
  const [c] = await Subscriber.aggregate([
    { $group: {
      _id: null,
      total: { $sum: 1 },
      thisWeek: { $sum: { $cond: [{ $gte: ['$subscribedAt', weekStart] }, 1, 0] } },
      withPhone: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$phone', ''] }, ''] }, 1, 0] } },
      unread: { $sum: { $cond: [{ $gt: ['$subscribedAt', seenAt] }, 1, 0] } },
    } },
  ]);
  const byStatus = await Subscriber.aggregate([
    { $group: { _id: { $cond: [{ $in: [{ $ifNull: ['$leadStatus', ''] }, ['', 'new']] }, 'new', '$leadStatus'] }, n: { $sum: 1 } } },
  ]);
  const { total = 0, thisWeek = 0, withPhone = 0, unread = 0 } = c || {};
  return { stats: { total, thisWeek, withPhone, unread }, statusCounts: Object.fromEntries(byStatus.map((r) => [r._id, r.n])) };
}

async function subscriberPage(q, paging, { userId }) {
  const filter = subscriberFilter(q);
  const asked = q.weekStart ? new Date(q.weekStart) : null;
  const weekStart = asked && !Number.isNaN(asked.getTime()) ? asked : new Date(Date.now() - 7 * DAY_MS);
  const me = await User.findById(userId).select('subscribersSeenAt').lean();
  const [items, total, stats] = await Promise.all([
    Subscriber.find(filter).sort({ subscribedAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit),
    Subscriber.countDocuments(filter),
    subscriberStats({ weekStart, seenAt: me?.subscribersSeenAt || new Date(0) }),
  ]);
  return { items, total, page: paging.page, limit: paging.limit, ...stats };
}

async function subscriberExport(q) {
  const items = await Subscriber.find(subscriberFilter(q)).sort({ subscribedAt: -1, _id: -1 })
    .select('name email phone leadStatus notes subscribedAt').lean();
  return { items };
}

module.exports = {
  studentFilter, studentPage, studentIds, studentExport,
  applicationPage, applicationStudentIds, applicationExport,
  subscriberFilter, subscriberPage, subscriberExport,
  setSummaryTtl, // for tests: the summary cache is off under NODE_ENV=test unless a test turns it on
};
