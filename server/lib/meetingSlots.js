// Free time slots for booking a call with a counselor. Pure (no database access): routes/meetings.js loads the
// counselor's meetings for the day. Times are wall-clock "HH:MM" strings like the Meeting model stores them.

const OPEN_HOUR = Number(process.env.MEETING_DAY_START_HOUR) || 9;
const CLOSE_HOUR = Number(process.env.MEETING_DAY_END_HOUR) || 18;
const SLOT_MINUTES = 60;
const MAX_DAYS_AHEAD = 60;

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const toTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today's date and time of day in the server's local zone, the zone meeting times are entered in.
function localNow(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * @param {string} date  YYYY-MM-DD
 * @param {{ scheduledTime: string, duration?: number }[]} busy  the counselor's meetings that day
 * @returns {{ open: boolean, reason?: string, slots: { time: string, available: boolean }[] }}
 */
function computeSlots(date, busy = [], now = new Date()) {
  if (!DATE_RE.test(date) || isNaN(new Date(`${date}T00:00:00`).getTime())) return { open: false, reason: 'invalid_date', slots: [] };

  const today = localNow(now);
  if (date < today.date) return { open: false, reason: 'past', slots: [] };
  const last = new Date(now.getTime() + MAX_DAYS_AHEAD * 86400000);
  if (date > localNow(last).date) return { open: false, reason: 'too_far', slots: [] };
  if (new Date(`${date}T00:00:00`).getDay() === 0) return { open: false, reason: 'sunday', slots: [] };

  const busyRanges = busy
    .map((m) => ({ start: toMinutes(m.scheduledTime), end: toMinutes(m.scheduledTime) + (m.duration || 60) }))
    .filter((r) => r.start !== null);

  const slots = [];
  for (let start = OPEN_HOUR * 60; start + SLOT_MINUTES <= CLOSE_HOUR * 60; start += SLOT_MINUTES) {
    const end = start + SLOT_MINUTES;
    const inPast = date === today.date && start <= today.minutes;
    const clash = busyRanges.some((r) => start < r.end && r.start < end);
    slots.push({ time: toTime(start), available: !inPast && !clash });
  }
  return { open: true, slots };
}

module.exports = { computeSlots, DATE_RE };
