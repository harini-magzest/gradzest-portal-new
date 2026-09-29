const axios = require('axios');

// Tata Smartflo (cloudphone.tatateleservices.com) call-records client.
//
// Configure in server/.env:
//   SMARTFLO_API_TOKEN=<token from Smartflo portal>   (sent verbatim as the Authorization header;
//                                                      include "Bearer " if your token needs it)
//   SMARTFLO_API_BASE=https://api-smartflo.tatateleservices.com/v1   (optional, this is the default)
//
// Each counselor is matched to call records by the "Smartflo agent" set on their profile
// (agent number or agent name).

const BASE = () => (process.env.SMARTFLO_API_BASE || 'https://api-smartflo.tatateleservices.com/v1').replace(/\/+$/, '');
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { at, records }

const isConfigured = () => Boolean(process.env.SMARTFLO_API_TOKEN);

// Smartflo reports and filters times in its account time zone (IST by default), regardless
// of where this server runs. Override with e.g. SMARTFLO_UTC_OFFSET=+00:00 if needed.
const OFFSET = () => process.env.SMARTFLO_UTC_OFFSET || '+05:30';
const offsetMinutes = () => {
  const m = OFFSET().match(/^([+-])(\d{2}):?(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 330;
};
const pad = (n) => String(n).padStart(2, '0');
const fmt = (date) => {
  const d = new Date(date.getTime() + offsetMinutes() * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const digits = (s) => String(s || '').replace(/\D/g, '');
const pick = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]; return undefined; };

// Map Smartflo's record into the shape the performance page uses.
function normalize(r) {
  const direction = String(pick(r, 'direction', 'call_direction') || '').toLowerCase().includes('in') ? 'inbound' : 'outbound';
  const statusRaw = String(pick(r, 'status', 'call_status') || '').toLowerCase();
  const answeredSec = Number(pick(r, 'answered_seconds', 'call_duration', 'duration') || 0);
  const answered = statusRaw ? statusRaw.includes('answer') && !statusRaw.includes('not') && !statusRaw.includes('no ') : answeredSec > 0;
  const date = pick(r, 'date', 'start_date');
  const time = pick(r, 'time', 'start_time');
  const local = date ? `${date}T${time || '00:00:00'}` : String(pick(r, 'start_stamp', 'created_at') || '').replace(' ', 'T');
  const startedAt = local ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(local) ? local : `${local}${OFFSET()}`) : new Date();
  const service = String(pick(r, 'service', 'description', 'call_type') || '');
  return {
    id: String(pick(r, 'id', 'call_id', 'uuid') ?? `${startedAt.getTime()}-${pick(r, 'client_number') || ''}`),
    source: 'smartflo',
    direction,
    status: answered ? 'answered' : 'missed',
    channel: /whats/i.test(service) ? 'whatsapp' : direction === 'inbound' ? 'incoming' : 'click_to_call',
    durationSec: answered ? answeredSec : 0,
    startedAt: isNaN(startedAt) ? new Date() : startedAt,
    clientNumber: String(pick(r, 'client_number', 'customer_number', 'caller_id_number') || ''),
    agentNumber: String(pick(r, 'agent_number_with_prefix', 'agent_number') || ''),
    agentName: String(pick(r, 'agent_name') || ''),
    recordingUrl: String(pick(r, 'recording_url', 'recording', 'recording_link') || ''),
  };
}

/** Fetch all call records between two dates (cached). Throws on API/network errors. */
async function fetchCallRecords(from, to) {
  const key = `${from.toISOString().slice(0, 13)}|${to.toISOString().slice(0, 13)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.records;

  const records = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await axios.get(`${BASE()}/call/records`, {
      headers: { Authorization: process.env.SMARTFLO_API_TOKEN, Accept: 'application/json' },
      params: { from_date: fmt(from), to_date: fmt(to), page, limit: PAGE_SIZE },
      timeout: 15000,
    });
    const rows = Array.isArray(data) ? data : data?.results || data?.data || [];
    records.push(...rows.map(normalize));
    if (rows.length < PAGE_SIZE) break;
  }
  cache.set(key, { at: Date.now(), records });
  return records;
}

/** Does this record belong to the counselor with the given Smartflo agent (number or name)? */
function matchesAgent(record, agent) {
  if (!agent) return false;
  const d = digits(agent);
  if (d.length >= 6) return digits(record.agentNumber).endsWith(d.slice(-10));
  return record.agentName.trim().toLowerCase() === agent.trim().toLowerCase();
}

module.exports = { isConfigured, fetchCallRecords, matchesAgent };
