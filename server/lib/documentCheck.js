// Quick sanity checks on a student's documents that need no file parsing: is the passport still valid, and for
// long enough? Pure (no database access) so it can be tested directly.

const DAY = 86400000;
const MIN_VALID_MONTHS = 6; // most visa offices want the passport valid for 6 months beyond the stay or intake

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string|Date|undefined} expiryDate  passport expiry from the student's profile
 * @param {number} [now]
 * @param {Date|null} [intakeDate]  the earliest intake the student applied for, if any
 * @returns {{ level: 'expired'|'soon', message: string } | null}  null when the passport looks fine or is unknown
 */
function passportWarning(expiryDate, now = Date.now(), intakeDate = null) {
  const expiry = parseDate(expiryDate);
  if (!expiry) return null;
  if (expiry.getTime() < now) return { level: 'expired', message: 'Your passport has expired. Renew it before you apply for a visa.' };

  const needUntil = Math.max(now, intakeDate ? intakeDate.getTime() : 0) + MIN_VALID_MONTHS * 30 * DAY;
  if (expiry.getTime() < needUntil) {
    const monthsLeft = Math.max(0, Math.floor((expiry.getTime() - now) / (30 * DAY)));
    return {
      level: 'soon',
      message: `Your passport expires in about ${monthsLeft} month${monthsLeft === 1 ? '' : 's'}. Most visas need it valid for at least ${MIN_VALID_MONTHS} months beyond your intake, so consider renewing.`,
    };
  }
  return null;
}

module.exports = { passportWarning, parseDate, MIN_VALID_MONTHS };
