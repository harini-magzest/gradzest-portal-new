const User = require('../models/User');
const { isSocOwnerEmail } = require('./socOwners');

// Who may be told about security incidents. The SOC is owner-only, so its alerts are too: before this, critical-incident
// emails, in-app notifications and the daily digest went to every admin account and carried incident titles (emails,
// IPs, file names) to people who cannot open the SOC. Application Team accounts are excluded as everywhere else.
async function socOwnerUsers() {
  const admins = await User.find({ role: 'admin', isAppTeam: { $ne: true } }).select('_id email name').lean();
  return admins.filter((a) => isSocOwnerEmail(a.email));
}

module.exports = { socOwnerUsers };
