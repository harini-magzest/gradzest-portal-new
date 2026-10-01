// Is this account still allowed to use a token it already holds?
//
// Access tokens live 15 minutes and sockets live as long as the page is open, so checking the account only at
// sign-in means a locked or deactivated person keeps working for a while. This is consulted on every
// authenticated request, socket connection and file download, with a short cache so it costs one cheap read per
// user per few seconds. The lock/deactivate routes call invalidate() so the change takes effect immediately.
//
// What counts as blocked:
//   - the account no longer exists (deleted);
//   - an administrator deactivated it (active === false);
//   - an administrator locked it from the SOC (lockedUntil in 2090+).
// The automatic 15-minute lockout after failed logins deliberately does NOT block existing sessions —
// otherwise anyone could kick a victim out just by failing logins on their account.

const User = require('../models/User');

const TTL_MS = 10 * 1000;
const ADMIN_LOCK_FROM_YEAR = 2090;
const cache = new Map(); // userId -> { state, at }

function stateOf(u) {
  if (!u) return 'missing';
  if (u.active === false) return 'deactivated';
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date() && new Date(u.lockedUntil).getFullYear() >= ADMIN_LOCK_FROM_YEAR) return 'locked';
  return 'ok';
}

async function accountState(userId) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
  let state = 'ok';
  try {
    state = stateOf(await User.findById(key).select('active lockedUntil').lean());
  } catch {
    return 'ok'; // a database hiccup must not log everyone out
  }
  cache.set(key, { state, at: Date.now() });
  return state;
}

const isBlocked = async (userId) => (await accountState(userId)) !== 'ok';
const invalidate = (userId) => { cache.delete(String(userId)); };
const isAdminLocked = (u) => !!(u?.lockedUntil && new Date(u.lockedUntil) > new Date() && new Date(u.lockedUntil).getFullYear() >= ADMIN_LOCK_FROM_YEAR);

module.exports = { accountState, isBlocked, invalidate, isAdminLocked };
