const UiActivity = require('../models/UiActivity');
const { buildDevice } = require('./device');

/**
 * Writes a "signed in" / "signed out" row to the activity trail, with the person's NAME and the device they used.
 * Written for every role (the security feed already records every sign-in); clicks are a separate, role-gated
 * policy. Fire-and-forget: never throws, never delays or fails the login.
 *
 * `deviceHints` is whatever the browser reported about itself (screen, timezone, Client Hints); it is cleaned and
 * bounded by buildDevice() and is display information only.
 */
async function recordSignInActivity({ kind, user, req, deviceHints }) {
  try {
    const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 300);
    const row = await UiActivity.create({
      userId: user._id,
      email: user.email || '',
      name: user.name || '',
      role: user.role || '',
      kind,
      page: kind === 'login' ? '/login' : '',
      element: { tag: 'session', label: kind === 'login' ? 'Signed in' : 'Signed out' },
      ip: req.ip || '',
      userAgent,
      device: buildDevice(userAgent, deviceHints),
    });
    req.app?.get?.('io')?.to('admin-room').emit('ui_activity', [row.toObject()]);
    return row;
  } catch (err) {
    console.error('[recordSignIn] Failed:', err.message);
    return null;
  }
}

module.exports = { recordSignInActivity };
