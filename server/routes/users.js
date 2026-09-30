const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Profile = require('../models/Profile');
const authMiddleware = require('../middleware/auth');
const { PERMISSIONS, ALL_KEYS, loadAccess } = require('../lib/access');

// Settings → Users and Controls: staff users and permission profiles
const router = express.Router();

const validId = (id) => id && mongoose.isValidObjectId(id);
const STAFF_FIELDS = 'name email role isAppTeam title phone hierarchyRole profileId active createdAt';

// Any logged-in staff member: their own effective permissions (drives which buttons the UI shows)
router.get('/me/permissions', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') return res.json({ permissions: [], restricted: false });
  try {
    const access = await loadAccess(req);
    res.json({ permissions: [...access.permissions], restricted: !!access.teamIds });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Everything below: full admins only
router.use(authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
  next();
});

/* ── Profiles ──────────────────────────────────────────────────────────────── */

function cleanPermissions(list) {
  return [...new Set((list || []).filter(k => ALL_KEYS.includes(k)))];
}

router.get('/profiles', async (req, res) => {
  try {
    const [profiles, counts] = await Promise.all([
      Profile.find().sort({ isSystem: -1, createdAt: 1 }).lean(),
      User.aggregate([{ $match: { role: 'counselor' } }, { $group: { _id: '$profileId', n: { $sum: 1 } } }]),
    ]);
    const byId = new Map(counts.map(c => [String(c._id), c.n]));
    const def = profiles.find(p => p.isDefault);
    res.json({
      catalogue: PERMISSIONS,
      profiles: profiles.map(p => ({
        ...p,
        // counselors with no profile use the default one
        userCount: (byId.get(String(p._id)) || 0) + (p.isDefault ? (byId.get('null') || 0) : 0),
      })),
      defaultId: def?._id || null,
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/profiles', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Profile name is required' });
  try {
    const profile = await Profile.create({
      name, description: String(req.body.description || ''),
      permissions: cleanPermissions(req.body.permissions),
    });
    res.status(201).json(profile);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/profiles/:id', async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    if (profile.isSystem) return res.status(400).json({ message: 'The Administrator profile cannot be changed' });
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Profile name is required' });
      profile.name = name;
    }
    if (req.body.description !== undefined) profile.description = String(req.body.description);
    if (req.body.permissions !== undefined) profile.permissions = cleanPermissions(req.body.permissions);
    if (req.body.isDefault === true && !profile.isDefault) {
      await Profile.updateMany({ isDefault: true }, { isDefault: false });
      profile.isDefault = true;
    }
    await profile.save();
    res.json(profile);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/profiles/:id', async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    if (profile.isSystem) return res.status(400).json({ message: 'The Administrator profile cannot be deleted' });
    if (profile.isDefault) return res.status(400).json({ message: 'Make another profile the default before deleting this one' });
    const users = await User.countDocuments({ profileId: profile._id });
    if (users) return res.status(400).json({ message: `Move the ${users} user(s) with this profile to another profile first` });
    await profile.deleteOne();
    res.json({ message: 'Profile deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ── Users ─────────────────────────────────────────────────────────────────── */

router.get('/', async (req, res) => {
  try {
    const [users, roles, profiles] = await Promise.all([
      User.find({ role: { $in: ['admin', 'counselor'] } }).select(STAFF_FIELDS).sort({ name: 1 }).lean(),
      Role.find().select('name').sort({ name: 1 }).lean(),
      Profile.find().select('name isSystem isDefault').sort({ isSystem: -1, name: 1 }).lean(),
    ]);
    res.json({ users, roles, profiles });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

async function validateLinks(body) {
  if (body.roleId && !(validId(body.roleId) && await Role.exists({ _id: body.roleId }))) return 'Role not found';
  if (body.profileId && !(validId(body.profileId) && await Profile.exists({ _id: body.profileId }))) return 'Profile not found';
  return null;
}

// Add a staff user. type: counselor | admin | appteam
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const type = ['counselor', 'admin', 'appteam'].includes(req.body.type) ? req.body.type : 'counselor';
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Invalid email address' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  try {
    const linkError = await validateLinks(req.body);
    if (linkError) return res.status(400).json({ message: linkError });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists' });
    const user = await User.create({
      name, email, password: await bcrypt.hash(password, 10),
      role: type === 'counselor' ? 'counselor' : 'admin',
      isAppTeam: type === 'appteam',
      title: String(req.body.title || ''), phone: String(req.body.phone || ''),
      hierarchyRole: req.body.roleId || null,
      profileId: type === 'counselor' ? (req.body.profileId || null) : null,
      emailVerified: true, active: true,
      ...(type === 'counselor' && { specialization: [], assignedStudents: [], experience: 0 }),
    });
    res.status(201).json(await User.findById(user._id).select(STAFF_FIELDS).lean());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// Change a staff user's name/title, profile, role or active status
router.put('/:id', async (req, res) => {
  try {
    const linkError = await validateLinks(req.body);
    if (linkError) return res.status(400).json({ message: linkError });
    const target = await User.findOne({ _id: req.params.id, role: { $in: ['admin', 'counselor'] } });
    if (!target) return res.status(404).json({ message: 'User not found' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Name is required' });
      target.name = name;
    }
    if (req.body.title !== undefined) target.title = String(req.body.title);
    if (req.body.roleId !== undefined) target.hierarchyRole = req.body.roleId || null;
    if (req.body.profileId !== undefined && target.role === 'counselor') target.profileId = req.body.profileId || null;
    if (req.body.active !== undefined) {
      if (String(target._id) === String(req.user.id) && req.body.active === false) {
        return res.status(400).json({ message: "You can't deactivate your own account" });
      }
      target.active = !!req.body.active;
      // Sign a deactivated user out everywhere (their access token expires within 15 min)
      if (!target.active) { target.refreshTokenHash = null; target.refreshTokenExpires = null; }
    }
    await target.save();
    res.json(await User.findById(target._id).select(STAFF_FIELDS).lean());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

module.exports = router;
