const EmailLog = require('../models/EmailLog');
const User = require('../models/User');

/**
 * Wrap a nodemailer transporter so every email sent to a student is recorded in EmailLog,
 * whichever route sent it. Callers may pass `gzMeta: { sentById, sentByName, kind }`
 * in the mail options; it is stripped before sending.
 */
function withEmailLog(mailer) {
  const send = mailer.sendMail.bind(mailer);
  mailer.sendMail = (options, callback) => {
    const { gzMeta, ...opts } = options || {};
    const result = send(opts);
    record(opts, gzMeta, result);
    if (typeof callback === 'function') result.then(info => callback(null, info), err => callback(err));
    return result;
  };
  return mailer;
}

async function record(opts, meta = {}, result) {
  let status = 'sent';
  let error = '';
  try { await result; } catch (err) { status = 'failed'; error = err.message || 'Send failed'; }
  try {
    const recipients = String(opts.to || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!recipients.length) return;
    const students = await User.find({ role: 'student', email: { $in: recipients } }).select('_id email');
    if (!students.length) return;
    await EmailLog.insertMany(students.map(s => ({
      studentId: s._id, to: s.email, subject: opts.subject || '', html: String(opts.html || opts.text || ''),
      kind: meta.kind || 'auto', sentById: meta.sentById || null, sentByName: meta.sentByName || '',
      status, error,
    })));
  } catch (err) {
    console.error('[emailLog] Failed:', err.message);
  }
}

module.exports = { withEmailLog };
