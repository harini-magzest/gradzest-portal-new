// An overall daily cap on questions from signed-out visitors (POST /api/zest/public/ask-stream). The per-IP limiter
// stops one visitor asking too much; this stops many visitors together, since every guest answer is a paid model call.
// The count lives in the database (models/Counter, one document per UTC day) so the cap holds across restarts and
// instances. When the day's count reaches 80% of the cap, the SOC gets one incident.
//
// GUEST_ZEST_DAILY_LIMIT: guest questions per UTC day (default 500). 0 turns Zest off for signed-out visitors.
const Counter = require('../models/Counter');

const DEFAULT_LIMIT = 500;
const ALERT_SHARE = 0.8;
const FRIENDLY_MESSAGE = "Zest has answered all the visitor questions it can for today. Please try again tomorrow, or sign in to keep chatting.";

function dailyLimit() {
  const raw = process.env.GUEST_ZEST_DAILY_LIMIT;
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_LIMIT;
}

const dayKey = (now) => `zest-guest:${new Date(now).toISOString().slice(0, 10)}`;

/**
 * Counts one guest question against today's cap.
 * @returns {Promise<{ allowed: boolean, used: number, limit: number }>}
 */
async function takeGuestQuestion({ now = Date.now(), io } = {}) {
  const limit = dailyLimit();
  if (limit === 0) return { allowed: false, used: 0, limit };
  const { value: used } = await Counter.findOneAndUpdate(
    { _id: dayKey(now) }, { $inc: { value: 1 } }, { upsert: true, new: true },
  ).lean();
  // Exactly one request sees the count land on the threshold, so the alert is raised once a day
  if (used === Math.ceil(limit * ALERT_SHARE)) {
    const { raiseIncident } = require('./detectIncidents');
    raiseIncident(io, { type: 'ai_usage' }, {
      type: 'ai_usage', severity: 'medium',
      title: `Guest Zest questions reached ${used} of today's limit of ${limit} (${Math.round(ALERT_SHARE * 100)}%)`,
    }).catch((err) => console.error('[zestGuestCap] Could not raise the SOC incident:', err.message));
  }
  return { allowed: used <= limit, used, limit };
}

// Express middleware for the guest route. Requests the route will refuse anyway (no question) don't use up the cap.
async function guestDailyCap(req, res, next) {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return next();
  try {
    const { allowed } = await takeGuestQuestion({ io: req.app.get('io') });
    if (!allowed) return res.status(429).json({ message: FRIENDLY_MESSAGE, code: 'GUEST_DAILY_LIMIT' });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { guestDailyCap, takeGuestQuestion, dailyLimit, FRIENDLY_MESSAGE, DEFAULT_LIMIT };
