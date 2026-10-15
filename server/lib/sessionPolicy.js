// How long a sign-in lasts. Two limits apply to every session, both enforced on the server when the browser asks for a new access
// token (POST /api/auth/refresh), so a stolen or forgotten refresh cookie cannot be kept alive forever:
//   * IDLE: no activity for this long ends the session. Staff (counselors and admins, who can see personal data) get a shorter
//     window than students.
//   * ABSOLUTE: the session ends this long after sign-in, however busy the person is. Using the site never extends it.
//
// "Activity" for the server is the browser renewing its access token. The web app renews it while the person is really using
// the page, and warns them before the idle limit is reached (see src/hooks/useSessionTimeout.ts).
//
// Defaults: staff 30 min idle, students 60 min idle, 12 hours absolute. Override with SESSION_IDLE_MINUTES_STAFF,
// SESSION_IDLE_MINUTES_STUDENT and SESSION_MAX_HOURS.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const positive = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function policyFor(role) {
  const staff = role === 'counselor' || role === 'admin'; // admin accounts include Application Team and Board
  return {
    idleMs: (staff ? positive('SESSION_IDLE_MINUTES_STAFF', 30) : positive('SESSION_IDLE_MINUTES_STUDENT', 60)) * MINUTE,
    absoluteMs: positive('SESSION_MAX_HOURS', 12) * HOUR,
  };
}

const MESSAGES = {
  idle: 'You were signed out because you were inactive for a while. Please sign in again.',
  expired: 'Your sign-in reached its time limit. Please sign in again.',
};
const CODES = { idle: 'SESSION_IDLE', expired: 'SESSION_EXPIRED' };

/**
 * Is this refresh-token session still allowed to renew?
 * @param {{ createdAt?: Date, lastUsedAt?: Date, expires: Date }} session
 * @returns {{ ok: true, expiresAt: Date, idleMs: number } | { ok: false, reason: 'idle'|'expired' }}
 */
function sessionStatus(session, role, now = Date.now()) {
  const { idleMs, absoluteMs } = policyFor(role);
  const created = new Date(session.createdAt || 0).getTime();   // a session with no start time is treated as already over
  const hardEnd = Math.min(new Date(session.expires).getTime(), created + absoluteMs);
  if (!(hardEnd > now)) return { ok: false, reason: 'expired' };
  const lastUsed = new Date(session.lastUsedAt || session.createdAt || 0).getTime();
  if (!(lastUsed + idleMs > now)) return { ok: false, reason: 'idle' };
  return { ok: true, expiresAt: new Date(hardEnd), idleMs };
}

/** What the browser is told about its own session, so it can warn before the limits are reached. */
const sessionPayload = (expiresAt, role) => ({ expiresAt: new Date(expiresAt).toISOString(), idleTimeoutMs: policyFor(role).idleMs });

module.exports = { policyFor, sessionStatus, sessionPayload, SESSION_MESSAGES: MESSAGES, SESSION_CODES: CODES };
