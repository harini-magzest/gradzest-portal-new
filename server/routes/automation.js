const express = require('express');
const { logError } = require('../lib/logError');
const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const AutomationRule = require('../models/AutomationRule');
const AutomationTemplate = require('../models/AutomationTemplate');
const AutomationLog = require('../models/AutomationLog');
const authMiddleware = require('../middleware/auth');
const A = require('../lib/automation');

const router = express.Router();

// Automation is configured by full admins only (not Application Team accounts)
router.use(authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
  next();
});

const validId = (id) => id && mongoose.isValidObjectId(id);

// Everything the rule builder and template editor need to render their dropdowns
router.get('/meta', async (req, res) => {
  try {
    const [roles, staff] = await Promise.all([
      Role.find().select('name').sort({ name: 1 }).lean(),
      User.find({ role: { $in: ['admin', 'counselor'] } }).select('name role isAppTeam').sort({ name: 1 }).lean(),
    ]);
    res.json({
      triggers: A.TRIGGERS, fields: A.FIELDS, operators: A.OPERATORS, variables: A.VARIABLES,
      actionTypes: A.ACTION_TYPES, recipients: A.RECIPIENTS, leadStages: A.LEAD_STAGES,
      roles, staff,
    });
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ── Templates ─────────────────────────────────────────────────────────────── */

function templateInput(body) {
  return {
    name: String(body.name || '').trim(),
    channel: body.channel === 'notification' ? 'notification' : 'email',
    category: String(body.category || 'General').trim() || 'General',
    subject: String(body.subject || ''),
    body: String(body.body || ''),
  };
}

router.get('/templates', async (req, res) => {
  try {
    const [templates, usage] = await Promise.all([
      AutomationTemplate.find().sort({ updatedAt: -1 }).lean(),
      AutomationRule.aggregate([{ $unwind: '$actions' }, { $match: { 'actions.templateId': { $ne: null } } },
        { $group: { _id: '$actions.templateId', rules: { $addToSet: '$name' } } }]),
    ]);
    const usedBy = new Map(usage.map(u => [String(u._id), u.rules]));
    res.json(templates.map(t => ({ ...t, usedBy: usedBy.get(String(t._id)) || [] })));
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/templates', async (req, res) => {
  const data = templateInput(req.body);
  if (!data.name) return res.status(400).json({ message: 'Template name is required' });
  if (!data.body.trim()) return res.status(400).json({ message: 'Message body is required' });
  try {
    res.status(201).json(await AutomationTemplate.create({ ...data, createdBy: req.user.id }));
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/templates/:id', async (req, res) => {
  const data = templateInput(req.body);
  if (!data.name) return res.status(400).json({ message: 'Template name is required' });
  if (!data.body.trim()) return res.status(400).json({ message: 'Message body is required' });
  try {
    const t = await AutomationTemplate.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!t) return res.status(404).json({ message: 'Template not found' });
    res.json(t);
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const rules = await AutomationRule.find({ 'actions.templateId': req.params.id }).select('name').lean();
    if (rules.length) {
      return res.status(400).json({ message: `Used by rule(s): ${rules.map(r => r.name).join(', ')}. Remove it there first.` });
    }
    const t = await AutomationTemplate.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted' });
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send the template, filled with sample data, to the logged-in admin
router.post('/templates/:id/test', async (req, res) => {
  try {
    const [t, me] = await Promise.all([
      AutomationTemplate.findById(req.params.id).lean(),
      User.findById(req.user.id).select('email').lean(),
    ]);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const mailer = req.app.get('mailer');
    if (!mailer || !me?.email) return res.status(400).json({ message: 'Email is not configured' });
    const { subject, html } = A.renderEmail(t, A.sampleVars());
    await mailer.sendMail({
      from: `"Gradzest" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: me.email, subject: `[TEST] ${subject}`, html,
    });
    res.json({ message: `Test email sent to ${me.email}` });
  } catch (err) {
    sendServerError(res, err, 'Could not send test email');
  }
});

/* ── Rules ─────────────────────────────────────────────────────────────────── */

const TRIGGER_KEYS = new Set(A.TRIGGERS.map(t => t.key));
const FIELD_KEYS = new Set(A.FIELDS.map(f => f.key));
const OP_KEYS = new Set(A.OPERATORS.map(o => o.key));
const ACTION_KEYS = new Set(A.ACTION_TYPES.map(a => a.key));
const RECIPIENT_KEYS = new Set(A.RECIPIENTS.map(r => r.key));

// Validate and normalise a rule from the client; returns { data } or { error }
async function ruleInput(body) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Rule name is required' };
  if (!TRIGGER_KEYS.has(body.trigger)) return { error: 'Choose when the rule should run' };

  const conditions = [];
  for (const c of body.conditions || []) {
    if (!FIELD_KEYS.has(c.field) || !OP_KEYS.has(c.op)) return { error: 'A condition is incomplete' };
    conditions.push({ field: c.field, op: c.op, value: String(c.value ?? '') });
  }

  const actions = [];
  for (const a of body.actions || []) {
    if (!ACTION_KEYS.has(a.type)) return { error: 'Unknown action' };
    const act = { type: a.type };
    if (a.type === 'send_email' || a.type === 'send_notification') {
      if (!validId(a.templateId) || !await AutomationTemplate.exists({ _id: a.templateId })) return { error: 'Choose a template for every message action' };
      act.templateId = a.templateId;
    }
    if (['send_email', 'send_notification', 'create_task'].includes(a.type)) {
      if (!RECIPIENT_KEYS.has(a.recipient)) return { error: 'Choose who receives each action' };
      if (a.type === 'create_task' && a.recipient === 'student') return { error: 'Tasks must be assigned to staff' };
      act.recipient = a.recipient;
      if (a.recipient === 'role') {
        if (!validId(a.roleId)) return { error: 'Choose a role' };
        act.roleId = a.roleId;
      }
      if (a.recipient === 'user') {
        if (!validId(a.userId)) return { error: 'Choose a staff member' };
        act.userId = a.userId;
      }
    }
    if (a.type === 'create_task') {
      act.taskTitle = String(a.taskTitle || '').trim();
      if (!act.taskTitle) return { error: 'Task title is required' };
      act.taskDescription = String(a.taskDescription || '');
      act.taskPriority = ['high', 'medium', 'low'].includes(a.taskPriority) ? a.taskPriority : 'medium';
      act.taskDueDays = Math.max(0, Math.min(365, Number(a.taskDueDays) || 0));
    }
    if (a.type === 'assign_counselor') {
      if (!validId(a.userId)) return { error: 'Choose a counselor to assign' };
      act.userId = a.userId;
    }
    if (a.type === 'change_stage') {
      if (!A.LEAD_STAGES[a.leadStage]) return { error: 'Choose a lead stage' };
      act.leadStage = a.leadStage;
    }
    actions.push(act);
  }
  if (!actions.length) return { error: 'Add at least one action' };

  return {
    data: {
      name, description: String(body.description || ''),
      active: body.active !== false,
      trigger: body.trigger,
      scheduleHour: Math.max(0, Math.min(23, Number(body.scheduleHour) || 0)),
      conditionMatch: body.conditionMatch === 'any' ? 'any' : 'all',
      conditions, actions,
    },
  };
}

router.get('/rules', async (req, res) => {
  try {
    res.json(await AutomationRule.find().sort({ createdAt: -1 }).lean());
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const { data, error } = await ruleInput(req.body);
    if (error) return res.status(400).json({ message: error });
    res.status(201).json(await AutomationRule.create({ ...data, createdBy: req.user.id }));
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/rules/:id', async (req, res) => {
  try {
    const { data, error } = await ruleInput(req.body);
    if (error) return res.status(400).json({ message: error });
    const rule = await AutomationRule.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/rules/:id/active', async (req, res) => {
  try {
    const rule = await AutomationRule.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true });
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    const rule = await AutomationRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Run a rule now for one student (conditions are still checked) — for testing
router.post('/rules/:id/run', async (req, res) => {
  try {
    const rule = await AutomationRule.findById(req.params.id).lean();
    if (!rule) return res.status(404).json({ message: 'Rule not found' });
    if (!validId(req.body.studentId)) return res.status(400).json({ message: 'Choose a student' });
    const ctx = await A.buildContext(req.body.studentId);
    if (!ctx) return res.status(404).json({ message: 'Student not found' });
    if (!A.matches(rule, ctx)) return res.json({ matched: false, message: "This student doesn't match the rule's conditions" });
    const log = await A.executeRule(rule, ctx);
    res.json({ matched: true, log });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

/* ── Logs ──────────────────────────────────────────────────────────────────── */

router.get('/logs', async (req, res) => {
  const filter = {};
  if (validId(req.query.ruleId)) filter.ruleId = req.query.ruleId;
  if (['success', 'partial', 'failed'].includes(req.query.status)) filter.status = req.query.status;
  try {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    res.json(await AutomationLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean());
  } catch (err) {
    logError('automation', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
