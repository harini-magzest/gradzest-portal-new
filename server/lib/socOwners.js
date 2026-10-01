// Who owns the SOC. One definition, used by the REST gate (routes/soc.js) and the live-event socket room (app.js),
// so the two can never disagree about who is allowed to see security data.
//
// SOC_OWNER_EMAILS is a comma-separated list (default: hameed@magzest.in). An entry starting with "@" allows a
// whole domain — used by the test suite only; never use it in production.

const owners = () => String(process.env.SOC_OWNER_EMAILS || 'hameed@magzest.in')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function isSocOwnerEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return owners().some((o) => (o.startsWith('@') ? e.endsWith(o) : e === o));
}

// Exact owner emails only (domain entries excluded); the SOC UI uses these to hide the maintainers' own emails.
const ownerEmails = () => owners().filter((o) => !o.startsWith('@'));

module.exports = { isSocOwnerEmail, ownerEmails };
