// Scheduled jobs (reminders, digests, escalations) run inside the API process. With two or more API instances every job
// fires once per instance, which means double emails and double WhatsApp messages. Set RUN_JOBS=false on every instance
// except one (or on all of them and run one dedicated instance). Unset means on, which is how a single instance behaves.
const OFF = new Set(['false', '0', 'off', 'no']);

function jobsEnabled(env = process.env) {
  return !OFF.has(String(env.RUN_JOBS ?? '').trim().toLowerCase());
}

module.exports = { jobsEnabled };
