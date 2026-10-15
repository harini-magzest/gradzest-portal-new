const mongoose = require('mongoose');

// Staff role hierarchy (Admin → Associate Counsellor → Counsellor …), managed from the
// admin Roles page. Separate from User.role, which stays the access profile
// (student / counselor / admin). Staff link to a node here via User.hierarchyRole.
const RoleSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  // null = a top-level role
  parentRole:  { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  // Peer Data Visibility: users in this role can also see each other's students
  peerVisibility: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Role', RoleSchema);
