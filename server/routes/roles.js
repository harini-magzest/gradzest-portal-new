const express = require('express');
const { logError } = require("../lib/logError");
const mongoose = require('mongoose');
const Role = require('../models/Role');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Role hierarchy is managed by full admins only (not Application Team accounts)
router.use(authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin' || req.user.isAppTeam) return res.status(403).json({ message: 'Admin only' });
  next();
});

const validId = (id) => id && mongoose.isValidObjectId(id);

// Would setting `roleId`'s parent to `parentId` create a loop?
async function createsCycle(roleId, parentId) {
  let cur = parentId;
  for (let i = 0; cur && i < 100; i++) {
    if (String(cur) === String(roleId)) return true;
    cur = (await Role.findById(cur).select('parentRole').lean())?.parentRole;
  }
  return false;
}

// All roles (flat — the client builds the tree) plus all staff with their role
router.get('/', async (req, res) => {
  try {
    const [roles, staff] = await Promise.all([
      Role.find().sort({ createdAt: 1 }).lean(),
      User.find({ role: { $in: ['admin', 'counselor'] } })
        .select('name email role isAppTeam title hierarchyRole').sort({ name: 1 }).lean(),
    ]);
    res.json({ roles, staff });
  } catch (err) {
    logError("roles", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  const { description = '', parentRole = null } = req.body;
  if (!name) return res.status(400).json({ message: 'Role name is required' });
  try {
    if (parentRole && !(validId(parentRole) && await Role.exists({ _id: parentRole }))) {
      return res.status(400).json({ message: 'Parent role not found' });
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (await Role.exists({ name: new RegExp('^' + escaped + '$', 'i') })) {
      return res.status(409).json({ message: 'A role with this name already exists' });
    }
    const role = await Role.create({ name, description, parentRole: parentRole || null });
    res.status(201).json(role);
  } catch (err) {
    logError("roles", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/assign/:userId', async (req, res) => {
  const { roleId } = req.body;
  try {
    if (roleId && !(validId(roleId) && await Role.exists({ _id: roleId }))) {
      return res.status(400).json({ message: 'Role not found' });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, role: { $in: ['admin', 'counselor'] } },
      { hierarchyRole: roleId || null },
      { new: true },
    ).select('name email role isAppTeam title hierarchyRole');
    if (!user) return res.status(404).json({ message: 'Staff member not found' });
    res.json(user);
  } catch (err) {
    logError("roles", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) {
    update.name = String(req.body.name).trim();
    if (!update.name) return res.status(400).json({ message: 'Role name is required' });
  }
  if (req.body.description !== undefined) update.description = req.body.description;
  try {
    if (req.body.parentRole !== undefined) {
      const parent = req.body.parentRole || null;
      if (parent) {
        if (!validId(parent) || !await Role.exists({ _id: parent })) return res.status(400).json({ message: 'Parent role not found' });
        if (await createsCycle(req.params.id, parent)) {
          return res.status(400).json({ message: 'A role cannot report to itself or to a role below it' });
        }
      }
      update.parentRole = parent;
    }
    const role = await Role.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (err) {
    logError("roles", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [children, users] = await Promise.all([
      Role.countDocuments({ parentRole: req.params.id }),
      User.countDocuments({ hierarchyRole: req.params.id }),
    ]);
    if (children) return res.status(400).json({ message: 'Move or delete the roles under this role first' });
    if (users) return res.status(400).json({ message: `Reassign the ${users} staff member(s) in this role first` });
    const deleted = await Role.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Role not found' });
    res.json({ message: 'Role deleted' });
  } catch (err) {
    logError("roles", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
