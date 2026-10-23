// Incidents: list, detail, PDF report, triage (status, assignment, bulk) and notes.
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const PDFDocument = require('pdfkit');
const SecurityEvent = require('../../models/SecurityEvent');
const SecurityIncident = require('../../models/SecurityIncident');
const AnalystAction = require('../../models/AnalystAction');
const User = require('../../models/User');
const authMiddleware = require('../../middleware/auth');
const { logAnalystAction } = require('../../lib/logAnalystAction');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { sendCsv } = require('../../lib/csv');
const { SLA_POLICY, CLOSED, computeSla } = require('../../lib/sla');
const { adminOnly, isObjectId, searchRows, logExport } = require('./shared');

const router = express.Router();

// ── Incidents ─────────────────────────────────────────────────────────────────

const INCIDENT_SEARCH_FIELDS = ['title', 'relatedIp', 'relatedEmail'];
// assignedTo: 'me' and 'unassigned' are resolved against the caller before this runs,
// since this function has no access to req.user — see the two routes below.
function buildIncidentQuery({ status, severity, type, assignedTo }) {
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (severity && severity !== 'all') query.severity = severity;
  if (type && type !== 'all') query.type = type;
  if (assignedTo === null) query.assignedTo = null;
  else if (assignedTo && isObjectId(assignedTo)) query.assignedTo = assignedTo;
  return query;
}
// 'me' -> the caller's id, 'unassigned' -> null (matches the query above), anything
// else passes through untouched (a specific analyst id, or undefined for "all").
function resolveAssignedTo(raw, req) {
  if (raw === 'me') return req.user.id;
  if (raw === 'unassigned') return null;
  return raw;
}

router.get('/incidents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const query = buildIncidentQuery({ ...req.query, assignedTo: resolveAssignedTo(req.query.assignedTo, req) });

    let incidents; let total; let truncated = false;
    if (req.query.q && req.query.q.trim()) {
      const matched = await searchRows(SecurityIncident, query, req.query.q, INCIDENT_SEARCH_FIELDS);
      total = matched.length; truncated = matched.truncated;
      incidents = await SecurityIncident.populate(matched.slice(skip, skip + limit), { path: 'assignedTo', select: 'name email' });
    } else {
      [incidents, total] = await Promise.all([
        SecurityIncident.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
          .populate('assignedTo', 'name email').lean(),
        SecurityIncident.countDocuments(query),
      ]);
    }
    // The policy travels with the list so the client can mirror computeSla()
    // for incidents that change live over the socket, without duplicating targets.
    res.json({ incidents, total, skip, limit, slaPolicy: SLA_POLICY, truncated });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.get('/incidents/export.csv', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const iq = buildIncidentQuery({ ...req.query, assignedTo: resolveAssignedTo(req.query.assignedTo, req) });
    const base = req.query.q && req.query.q.trim()
      ? await searchRows(SecurityIncident, iq, req.query.q, INCIDENT_SEARCH_FIELDS)
      : await SecurityIncident.find(iq).sort({ createdAt: -1 }).limit(5000).lean();
    const incidents = await SecurityIncident.populate(base, { path: 'assignedTo', select: 'name email' });
    logExport(req, 'incidents', incidents.length);
    sendCsv(res, 'soc-incidents.csv', [
      { label: 'Created', key: 'createdAt' }, { label: 'Type', key: 'type' }, { label: 'Severity', key: 'severity' },
      { label: 'Status', key: 'status' }, { label: 'Title', key: 'title' }, { label: 'IP', key: 'relatedIp' },
      { label: 'Email', key: 'relatedEmail' }, { label: 'Assigned to', value: (i) => i.assignedTo?.name || '' },
      { label: 'Acknowledged', key: 'acknowledgedAt' }, { label: 'Resolved', key: 'resolvedAt' },
      { label: 'Resolution reason', key: 'resolutionReason' }, { label: 'Resolution comment', key: 'resolutionComment' },
      { label: 'SLA ack breached', value: (i) => (computeSla(i).ackBreached ? 'yes' : 'no') },
      { label: 'SLA resolve breached', value: (i) => (computeSla(i).resolveBreached ? 'yes' : 'no') },
    ], incidents);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// A single incident by id — lets the client deep-link to one (e.g. from a shared URL)
// even when it isn't on the currently loaded page of the list above. Must stay after
// the literal '/incidents/export.csv' route, or ':id' would shadow it.
router.get('/incidents/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json({ incident, slaPolicy: SLA_POLICY });
  } catch (err) {
    sendServerError(res, err);
  }
});

// One-incident report: summary, SLA, the source events that triggered it,
// analyst notes, and every recorded analyst action taken on it.
router.get('/incidents/:id/report.pdf', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id).populate('assignedTo', 'name email').lean();
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    const [events, actions] = await Promise.all([
      SecurityEvent.find({ _id: { $in: incident.sourceEventIds || [] } }).sort({ createdAt: 1 }).limit(100).lean(),
      AnalystAction.find({ targetType: 'incident', targetId: String(incident._id) }).sort({ createdAt: 1 }).lean(),
    ]);
    const sla = computeSla(incident);
    const fmt = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—');

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="incident-${incident._id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('Security Incident Report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(13).text(incident.title);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    [
      ['ID', String(incident._id)], ['Type', incident.type], ['Severity', incident.severity], ['Status', incident.status],
      ['Assigned to', incident.assignedTo ? `${incident.assignedTo.name} <${incident.assignedTo.email}>` : 'Unassigned'],
      ['Related IP', incident.relatedIp || '—'], ['Related account', incident.relatedEmail || '—'],
      ['Created', fmt(incident.createdAt)], ['Acknowledged', fmt(incident.acknowledgedAt)], ['Resolved', fmt(incident.resolvedAt)],
      ['Ack target', `${fmt(sla.ackDue)}${sla.ackBreached ? ' (BREACHED)' : ''}`],
      ['Resolve target', `${fmt(sla.resolveDue)}${sla.resolveBreached ? ' (BREACHED)' : ''}`],
      ['Resolution', [incident.resolutionReason, incident.resolutionComment].filter(Boolean).join(' — ') || '—'],
    ].forEach(([k, v]) => doc.text(`${k}: ${v}`));

    const section = (heading, lines) => {
      doc.moveDown(1).fontSize(13).fillColor('#000').text(heading);
      doc.moveDown(0.3).fontSize(9).fillColor('#333');
      if (!lines.length) doc.text('None recorded.');
      lines.forEach((l) => doc.text(l));
    };
    section('Triggering events', events.map((e) => `${fmt(e.createdAt)}  ${e.type}  ${e.ip || ''}  ${e.email || ''}  ${e.message || ''}`));
    section('Analyst notes', (incident.notes || []).map((n) => `${fmt(n.createdAt)}  ${n.author}: ${n.text}`));
    section('Analyst actions', actions.map((a) => `${fmt(a.createdAt)}  ${a.analystEmail}  ${a.action}  ${a.reason || ''}`));

    doc.moveDown(1).fontSize(8).fillColor('#888').text(`Generated ${new Date().toISOString()}`);
    doc.end();
  } catch (err) {
    if (!res.headersSent) sendServerError(res, err, 'Server error');
  }
});

// GET /api/soc/analysts — admins eligible to be assigned an incident.
router.get('/analysts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const analysts = await User.find({ role: 'admin' }).select('name email').sort({ name: 1 }).lean();
    res.json({ analysts });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'false_positive'];
const RESOLUTION_REASONS = ['fixed', 'benign_activity', 'expected_behavior', 'testing', 'duplicate', 'other'];

// Applies a status / assignment / resolution change to ONE incident, keeping the SLA clock honest: the first analyst touch
// acknowledges, closing stamps resolvedAt, reopening clears it and the previous outcome. Shared by PATCH /incidents/:id
// and PATCH /incidents/bulk so both behave identically. Returns { error: { status, message } } or { incident }.
async function applyIncidentUpdate(id, body, actor, io) {
  if (!isObjectId(id)) return { error: { status: 404, message: 'Incident not found' } };
  const { status, assignedTo, resolutionReason, resolutionComment } = body || {};
  if (status && !INCIDENT_STATUSES.includes(status)) return { error: { status: 400, message: 'Invalid status' } };
  if (resolutionReason && !RESOLUTION_REASONS.includes(resolutionReason)) return { error: { status: 400, message: 'Invalid resolution reason' } };

  const before = await SecurityIncident.findById(id).select('status assignedTo acknowledgedAt').lean();
  if (!before) return { error: { status: 404, message: 'Incident not found' } };

  const update = {};
  if (status) update.status = status;
  if (assignedTo !== undefined) update.assignedTo = assignedTo || null;

  const now = new Date();
  const touched = (status && status !== 'open') || (assignedTo !== undefined && assignedTo);
  if (touched && !before.acknowledgedAt) update.acknowledgedAt = now;
  if (status) {
    if (CLOSED.includes(status)) {
      update.resolvedAt = CLOSED.includes(before.status) ? undefined : now;
      if (resolutionReason !== undefined) update.resolutionReason = resolutionReason;
      if (resolutionComment !== undefined) update.resolutionComment = String(resolutionComment).slice(0, 1000);
    } else {
      update.resolvedAt = null;
      update.resolutionReason = '';
      update.resolutionComment = '';
    }
    if (update.resolvedAt === undefined) delete update.resolvedAt;
  }

  const incident = await SecurityIncident.findByIdAndUpdate(id, update, { new: true }).populate('assignedTo', 'name email');

  if (status && status !== before.status) {
    const outcome = CLOSED.includes(status) && resolutionReason ? ` (${resolutionReason})` : '';
    logAnalystAction({ analyst: actor, action: 'incident_status_change', targetType: 'incident', targetId: incident._id, reason: `${before.status} → ${status}${outcome}`, io });
  }
  if (assignedTo !== undefined && String(before.assignedTo || '') !== String(assignedTo || '')) {
    logAnalystAction({ analyst: actor, action: 'incident_assigned', targetType: 'incident', targetId: incident._id, reason: assignedTo ? `Assigned to ${incident.assignedTo?.name || assignedTo}` : 'Unassigned', io });
  }
  io?.to('admin-room').emit('incident_updated', incident.toObject());
  return { incident };
}

// PATCH /api/soc/incidents/bulk { ids: [...], status?, assignedTo?, resolutionReason?, resolutionComment? } — up to 100
// incidents at once (e.g. clearing a noisy rule's false positives). Must be registered BEFORE /incidents/:id.
router.patch('/incidents/bulk', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const { ids, ...changes } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids must be a non-empty array' });
    if (ids.length > 100) return res.status(400).json({ message: 'At most 100 incidents per request' });
    if (changes.status === undefined && changes.assignedTo === undefined) return res.status(400).json({ message: 'Nothing to change: provide status and/or assignedTo' });
    const io = req.app.get('io');
    const updated = [];
    const failed = [];
    for (const id of [...new Set(ids.map(String))]) {
      const r = await applyIncidentUpdate(id, changes, req.user, io);
      if (r.error) failed.push({ id, message: r.error.message }); else updated.push(String(r.incident._id));
    }
    res.json({ updated, failed });
  } catch (err) {
    sendServerError(res, err);
  }
});

router.patch('/incidents/:id', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    const r = await applyIncidentUpdate(req.params.id, req.body, req.user, req.app.get('io'));
    if (r.error) return res.status(r.error.status).json({ message: r.error.message });
    res.json(r.incident);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

const NOTE_MAX_LENGTH = 4000;
router.post('/incidents/:id/notes', authMiddleware, adminOnly, async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'Note text required' });
  // Refused rather than cut short: silently dropping the end of an investigation note is worse than asking for a shorter one.
  if (text.trim().length > NOTE_MAX_LENGTH) {
    return res.status(400).json({ message: `Note is too long (${NOTE_MAX_LENGTH.toLocaleString('en-US')} characters at most).` });
  }
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Incident not found' });
    const incident = await SecurityIncident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    if (!incident.acknowledgedAt) incident.acknowledgedAt = new Date();

    const poster = await User.findById(req.user.id).select('name role');
    incident.notes.push({ author: poster?.name || 'Admin', authorRole: poster?.role || 'admin', text: text.trim() });
    await incident.save();
    await incident.populate('assignedTo', 'name email');

    req.app.get('io')?.to('admin-room').emit('incident_updated', incident.toObject());
    res.json(incident);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
