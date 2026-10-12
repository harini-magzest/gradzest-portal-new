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
const cache = new Map(); // userId -> { state, role, isAppTeam, revokedAt, at }

function stateOf(u) {
  if (!u) return 'missing';
  if (u.active === false) return 'deactivated';
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date() && new Date(u.lockedUntil).getFullYear() >= ADMIN_LOCK_FROM_YEAR) return 'locked';
  return 'ok';
}

// The account's state plus its current role, from one cached read. The role lets callers re-check privileges on every
// request instead of trusting the role baked into a token for its 15-minute life.
async function accountRecord(userId) {
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let entry;
  try {
    const u = await User.findById(key).select('active lockedUntil role isAppTeam sessionsRevokedAt').lean();
    entry = {
      state: stateOf(u), role: u?.role ?? null, isAppTeam: !!u?.isAppTeam,
      revokedAt: u?.sessionsRevokedAt ? new Date(u.sessionsRevokedAt).getTime() : 0, at: Date.now(),
    };
  } catch {
    return { state: 'ok', role: null, isAppTeam: null }; // a database hiccup must not log everyone out
  }
  cache.set(key, entry);
  return entry;
}

async function accountState(userId) {
  return (await accountRecord(userId)).state;
}

/** False when the role or App Team flag in a token no longer matches the account (someone was demoted or moved). */
async function tokenRoleIsCurrent(token) {
  const { role, isAppTeam } = await accountRecord(token.id);
  if (role === null) return true; // unknown (lookup failed): the blocked check already ran; don't lock people out
  return role === token.role && isAppTeam === !!token.isAppTeam;
}

/** True when every session of the account was ended after this token was issued (see revokeAllSessions). */
async function tokenRevoked(token) {
  const { revokedAt } = await accountRecord(token.id);
  if (!revokedAt) return false;
  // Tokens from before iatMs existed only have `iat` (seconds): treat them as issued at the start of that second
  const issuedAt = typeof token.iatMs === 'number' ? token.iatMs : (token.iat || 0) * 1000;
  return issuedAt < revokedAt;
}

/** The account as the access checks need it, { id, role, isAppTeam }, from the cached record; null when the account is
 *  missing, deactivated or locked, or cannot be read right now (callers refuse access then). */
async function currentAccess(userId) {
  const { state, role, isAppTeam } = await accountRecord(userId);
  if (state !== 'ok' || role === null) return null;
  return { id: String(userId), role, isAppTeam: !!isAppTeam };
}

const isBlocked = async (userId) => (await accountState(userId)) !== 'ok';
const invalidate = (userId) => { cache.delete(String(userId)); };

// Ends every session of an account at once: the refresh tokens go, and access tokens issued before now are refused on
// their next use. A server in another process (the API, when a script calls this) notices within TTL_MS.
async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $set: { sessions: [], sessionsRevokedAt: new Date() } });
  invalidate(userId);
}
const isAdminLocked = (u) => !!(u?.lockedUntil && new Date(u.lockedUntil) > new Date() && new Date(u.lockedUntil).getFullYear() >= ADMIN_LOCK_FROM_YEAR);

module.exports = { accountState, isBlocked, invalidate, isAdminLocked, tokenRoleIsCurrent, tokenRevoked, revokeAllSessions, currentAccess };
