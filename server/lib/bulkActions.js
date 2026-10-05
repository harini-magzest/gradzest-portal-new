// Validation for bulk actions on students (POST /api/students/bulk). Pure: the route does the permission checks and
// the writes. Anything unexpected is rejected before a single student is touched.
const mongoose = require('mongoose');

const MAX_IDS = 100;
const ACTIONS = ['set_stage', 'add_tag', 'create_task', 'reassign'];
const ADMIN_ONLY = ['reassign'];
const PRIORITIES = ['high', 'medium', 'low'];

/**
 * @param {object} body  { ids, action, value }
 * @param {{ role: string }} user
 * @param {Record<string,string>} leadStages  valid lead stage keys
 * @returns {{ error: string } | { ids: string[], action: string, value: any }}
 */
function validateBulk(body, user, leadStages) {
  const { ids, action, value } = body || {};
  if (!ACTIONS.includes(action)) return { error: `action must be one of: ${ACTIONS.join(', ')}` };
  if (ADMIN_ONLY.includes(action) && user.role !== 'admin') return { error: 'Only an admin can do that', status: 403 };

  if (!Array.isArray(ids) || ids.length === 0) return { error: 'Choose at least one student' };
  const unique = [...new Set(ids.map(String))];
  if (unique.length > MAX_IDS) return { error: `You can change up to ${MAX_IDS} students at a time` };
  if (!unique.every((id) => mongoose.isValidObjectId(id))) return { error: 'One of the student ids is not valid' };

  if (action === 'set_stage') {
    if (!leadStages[value]) return { error: 'Invalid lead stage' };
    return { ids: unique, action, value };
  }
  if (action === 'add_tag') {
    const tag = String(value ?? '').trim().slice(0, 40);
    if (!tag) return { error: 'Tag cannot be empty' };
    return { ids: unique, action, value: tag };
  }
  if (action === 'create_task') {
    const title = String(value?.title ?? '').trim().slice(0, 120);
    if (!title) return { error: 'Task title is required' };
    const dueDate = value?.dueDate ? String(value.dueDate) : '';
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'dueDate must be YYYY-MM-DD' };
    const priority = PRIORITIES.includes(value?.priority) ? value.priority : 'medium';
    return { ids: unique, action, value: { title, dueDate, priority } };
  }
  // reassign: a counselor id, or empty to unassign
  if (value === null || value === '' || value === undefined) return { ids: unique, action, value: null };
  if (!mongoose.isValidObjectId(value)) return { error: 'counselor id is not valid' };
  return { ids: unique, action, value: String(value) };
}

module.exports = { validateBulk, MAX_IDS, ACTIONS };
