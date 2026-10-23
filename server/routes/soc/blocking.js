// Blocked IPs and suppression rules (the incident allowlist).
const express = require('express');
const { sendServerError } = require('../../lib/httpError');
const BlockedIp = require('../../models/BlockedIp');
const authMiddleware = require('../../middleware/auth');
const { refreshBlockedIps } = require('../../middleware/ipBlock');
const { logAnalystAction } = require('../../lib/logAnalystAction');
const attachUserEmail = require('../../middleware/attachUserEmail');
const { parseIpEntry, buildIpMatcher } = require('../../lib/ipMatch');
const { refreshSuppressions } = require('../../lib/suppression');
const SuppressionRule = require('../../models/SuppressionRule');
const { adminOnly, isObjectId } = require('./shared');

const router = express.Router();

// ── Blocked IPs ───────────────────────────────────────────────────────────────

const MIN_IPV4_PREFIX = 8;   // refuse ranges wider than a /8 — that's a self-inflicted outage
const MIN_IPV6_PREFIX = 32;

// Validates one block target (single IP or CIDR). Returns { value } or { error }.
function checkBlockTarget(raw, req) {
  const p = parseIpEntry(raw);
  if (!p.ok) return { error: 'Not a valid IP address or CIDR range' };
  if (p.prefix !== null && p.prefix < (p.family === 4 ? MIN_IPV4_PREFIX : MIN_IPV6_PREFIX)) {
    return { error: `Range too wide (minimum /${p.family === 4 ? MIN_IPV4_PREFIX : MIN_IPV6_PREFIX})` };
  }
  // Locking yourself out of the SOC dashboard is never intended.
  if (buildIpMatcher([p.value])(req.ip)) return { error: 'This would block your own IP address' };
  return { value: p.value };
}

function expiryFromHours(hours) {
  const h = Number(hours);
  return Number.isFinite(h) && h > 0 ? new Date(Date.now() + Math.min(h, 24 * 365) * 3600 * 1000) : null;
}

router.get('/blocked-ips', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await BlockedIp.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ createdAt: -1 }).populate('blockedBy', 'name email').lean();
    res.json({ blockedIps: rows });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/blocked-ips', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { ip, reason, expiresInHours } = req.body || {};
  if (!ip) return res.status(400).json({ message: 'IP address is required' });
  const target = checkBlockTarget(ip, req);
  if (target.error) return res.status(400).json({ message: target.error });
  try {
    const expiresAt = expiryFromHours(expiresInHours);
    const row = await BlockedIp.findOneAndUpdate(
      { ip: target.value },
      { ip: target.value, reason: reason || '', blockedBy: req.user.id, expiresAt },
      { upsert: true, new: true },
    );
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'block_ip', targetType: 'ip', targetId: target.value, reason: [reason, expiresAt && `until ${expiresAt.toISOString()}`].filter(Boolean).join(' — '), io: req.app.get('io') });
    res.json(row);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// Block many addresses/ranges in one go (pasted list). Invalid or unsafe
// entries are reported back individually; the rest are still applied.
router.post('/blocked-ips/bulk', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { ips, reason, expiresInHours } = req.body || {};
  if (!Array.isArray(ips) || !ips.length) return res.status(400).json({ message: 'Provide a non-empty list of IPs' });
  if (ips.length > 200) return res.status(400).json({ message: 'At most 200 entries per request' });
  try {
    const expiresAt = expiryFromHours(expiresInHours);
    const blocked = [];
    const rejected = [];
    for (const raw of [...new Set(ips.map((v) => String(v).trim()).filter(Boolean))]) {
      const target = checkBlockTarget(raw, req);
      if (target.error) { rejected.push({ ip: raw, reason: target.error }); continue; }
      await BlockedIp.findOneAndUpdate(
        { ip: target.value },
        { ip: target.value, reason: reason || '', blockedBy: req.user.id, expiresAt },
        { upsert: true },
      );
      blocked.push(target.value);
    }
    await refreshBlockedIps();
    if (blocked.length) {
      logAnalystAction({ analyst: req.user, action: 'bulk_block_ip', targetType: 'ip', targetId: blocked.length === 1 ? blocked[0] : `${blocked.length} entries`, reason: reason || '', metadata: { blocked, expiresAt }, io: req.app.get('io') });
    }
    res.json({ blocked, rejected });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.delete('/blocked-ips/:ip', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    await BlockedIp.deleteOne({ ip: req.params.ip });
    await refreshBlockedIps();
    logAnalystAction({ analyst: req.user, action: 'unblock_ip', targetType: 'ip', targetId: req.params.ip, io: req.app.get('io') });
    res.json({ message: 'IP unblocked' });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

// ── Suppression rules (incident allowlist) ───────────────────────────────────

router.get('/suppressions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await SuppressionRule.find({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ createdAt: -1 }).populate('createdBy', 'name email').lean();
    res.json({ suppressions: rows });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.post('/suppressions', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  const { kind, value, incidentTypes, reason, expiresInHours } = req.body || {};
  if (!['ip', 'email'].includes(kind)) return res.status(400).json({ message: 'kind must be "ip" or "email"' });
  if (incidentTypes !== undefined && (!Array.isArray(incidentTypes) || incidentTypes.some((t) => typeof t !== 'string'))) {
    return res.status(400).json({ message: 'incidentTypes must be an array of strings' });
  }
  let normalized;
  if (kind === 'ip') {
    const p = parseIpEntry(value);
    if (!p.ok) return res.status(400).json({ message: 'Not a valid IP address or CIDR range' });
    normalized = p.value;
  } else {
    normalized = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return res.status(400).json({ message: 'Not a valid email address' });
  }
  try {
    const rule = await SuppressionRule.create({
      kind, value: normalized, incidentTypes: incidentTypes || [], reason: String(reason || '').slice(0, 300),
      createdBy: req.user.id, expiresAt: expiryFromHours(expiresInHours),
    });
    await refreshSuppressions();
    logAnalystAction({ analyst: req.user, action: 'add_suppression', targetType: 'suppression', targetId: rule._id, reason: `${kind} ${normalized}${incidentTypes?.length ? ` for ${incidentTypes.join(', ')}` : ''}${reason ? ` — ${reason}` : ''}`, io: req.app.get('io') });
    res.status(201).json(rule);
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

router.delete('/suppressions/:id', authMiddleware, adminOnly, attachUserEmail, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Suppression rule not found' });
    const rule = await SuppressionRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Suppression rule not found' });
    await refreshSuppressions();
    logAnalystAction({ analyst: req.user, action: 'remove_suppression', targetType: 'suppression', targetId: rule._id, reason: `${rule.kind} ${rule.value}`, io: req.app.get('io') });
    res.json({ message: 'Suppression removed' });
  } catch (err) {
    sendServerError(res, err, 'Server error');
  }
});

module.exports = router;
