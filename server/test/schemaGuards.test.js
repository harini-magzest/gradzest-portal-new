const fs = require('fs');
const path = require('path');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const AnalystAction = require('../models/AnalystAction');

// logSecurityEvent / createIncident / logAnalystAction all swallow their own errors by design (logging must never break
// a request). The flip side is that a type missing from a schema enum fails SILENTLY: the event is simply never
// written. This happened once when a merge dropped three enum values and every SOC two-factor event vanished.
// These tests read the source and fail loudly if code logs something its schema would reject.

const SERVER = path.join(__dirname, '..');
function sourceFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'test', 'uploads', 'quarantine', 'scripts'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) sourceFiles(p, out); else if (f.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const sources = sourceFiles(SERVER).map((p) => ({ p: path.relative(SERVER, p), text: fs.readFileSync(p, 'utf8') }));
const literals = (re) => sources.flatMap(({ p, text }) => [...text.matchAll(re)].map((m) => ({ file: p, value: m[1] })));
const uniq = (arr) => [...new Map(arr.map((x) => [x.value, x])).values()];

describe('every logged type is allowed by its schema', () => {
  it('logSecurityEvent(\'type\') and the per-event rule table only use SecurityEvent enum values', () => {
    const allowed = SecurityEvent.schema.path('type').enumValues;
    const used = uniq([
      ...literals(/logSecurityEvent\(\s*'([a-z_]+)'/g),
      ...literals(/\bevent\(req,\s*'([a-z_]+)'/g), // routes/socAuth.js logs through a local event(req, type, …) helper
      ...literals(/^\s{2}([a-z_]+):\s*\[detect\./gm).filter((x) => x.file.endsWith('logSecurityEvent.js')), // RULES_BY_EVENT_TYPE keys
      ...literals(/\?\s*'(token_expired)'\s*:\s*'(token_invalid)'/g),
    ]);
    expect(used.length).toBeGreaterThan(8);
    const missing = used.filter((u) => !allowed.includes(u.value)).map((u) => `${u.value} (${u.file})`);
    expect(missing).toEqual([]);
    // the ternary in middleware/auth.js picks between two literals; check both
    for (const t of ['token_expired', 'token_invalid']) expect(allowed).toContain(t);
  });

  it('incident types used by the detection rules exist on SecurityIncident', () => {
    const allowed = SecurityIncident.schema.path('type').enumValues;
    const used = uniq([
      ...literals(/\btype:\s*'([a-z_]+)'/g).filter((x) => /detectIncidents|scanUpload|routes\/soc/.test(x.file)),
    ]).filter((u) => allowed.includes(u.value) || /^[a-z]+(_[a-z]+)+$/.test(u.value));
    // Only judge values that look like incident types (they appear in a `type:` next to a `severity:`)
    const incidentTypes = sources
      .filter((s) => /detectIncidents|scanUpload/.test(s.p))
      .flatMap((s) => [...s.text.matchAll(/type:\s*'([a-z_]+)',\s*\n\s*severity:/g)].map((m) => ({ file: s.p, value: m[1] })));
    expect(incidentTypes.length).toBeGreaterThan(5);
    const missing = incidentTypes.filter((u) => !allowed.includes(u.value)).map((u) => `${u.value} (${u.file})`);
    expect(missing).toEqual([]);
    expect(used.length).toBeGreaterThan(0);
  });

  it('analyst actions logged by the SOC routes exist on AnalystAction', () => {
    const allowed = AnalystAction.schema.path('action').enumValues;
    const used = uniq(literals(/logAnalystAction\(\{[^}]*?action:\s*'([a-z_]+)'/g));
    const templated = sources.filter((s) => s.p.endsWith('routes/soc.js')).flatMap((s) => [...s.text.matchAll(/action:\s*`\$\{action\}_upload`/g)]);
    expect(used.length).toBeGreaterThan(8);
    const missing = used.filter((u) => !allowed.includes(u.value)).map((u) => `${u.value} (${u.file})`);
    expect(missing).toEqual([]);
    if (templated.length) for (const a of ['quarantine_upload', 'restore_upload', 'purge_upload']) expect(allowed).toContain(a);
  });

  it('the SOC two-factor event types survive (regression for the dropped-enum merge)', () => {
    const allowed = SecurityEvent.schema.path('type').enumValues;
    for (const t of ['soc_mfa_success', 'soc_mfa_failure', 'soc_mfa_enrolled', 'data_export', 'privilege_change', 'password_reset_request']) {
      expect(allowed).toContain(t);
    }
  });
});
