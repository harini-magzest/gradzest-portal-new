const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/tasks
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'student') {
      query = { assignedTo: req.user.id };
    } else {
      query = { assignedBy: req.user.id };
    }
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    res.json(tasks);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/tasks
router.post('/', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ message: 'Forbidden' });
  const { title, description, assignedTo, priority, dueDate } = req.body;
  if (!title?.trim()) return res.status(400).json({ message: 'Title required' });
  try {
    const creator = await User.findById(req.user.id).select('name');
    let assignedToName = '';
    if (assignedTo) {
      const assignee = await User.findById(assignedTo).select('name');
      assignedToName = assignee?.name || '';
    }
    const task = await Task.create({
      title: title.trim(),
      description: (description || '').trim(),
      assignedTo: assignedTo || null,
      assignedToName,
      assignedBy: req.user.id,
      assignedByName: creator?.name || '',
      priority: priority || 'medium',
      dueDate: dueDate || '',
    });

    // Real-time push to the assignee
    if (assignedTo) {
      const io = req.app.get('io');
      const userSockets = req.app.get('userSockets');
      const sids = userSockets?.get(String(assignedTo));
      if (sids && io) {
        sids.forEach(sid => io.to(sid).emit('task:assigned', {
          taskId:        task._id,
          title:         task.title,
          priority:      task.priority,
          dueDate:       task.dueDate,
          assignedByName: task.assignedByName,
        }));
      }
    }

    res.status(201).json(task);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const isAssignee = task.assignedTo?.toString() === req.user.id;
    const isCreator  = task.assignedBy.toString() === req.user.id;
    if (!isAssignee && !isCreator && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.body.status) task.status = req.body.status;
    await task.save();
    res.json(task);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ message: 'Forbidden' });
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.assignedBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await task.deleteOne();
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Comment text required' });
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const isAssignee = task.assignedTo?.toString() === req.user.id;
    const isCreator  = task.assignedBy.toString() === req.user.id;
    if (!isAssignee && !isCreator && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const poster = await User.findById(req.user.id).select('name role');
    task.comments.push({ author: poster.name, authorRole: poster.role, text: text.trim() });
    await task.save();
    res.json(task);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
