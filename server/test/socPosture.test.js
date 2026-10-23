// The Posture tab reads "no vulnerability counts" as "no vulnerabilities" and draws a green all-clear. So when npm audit
// cannot run, what reaches the dashboard must be an explicit error, never an empty object.
const fs = require('fs');
const path = require('path');
const { summariseAudit } = require('../routes/soc');
const { AUDIT_DIRS } = require('../routes/soc/posture');

describe('dependency audit folders', () => {
  // They are relative to the route file, so moving it would quietly audit the wrong folder (or none).
  it('audits the frontend at the repo root and the backend in server/', () => {
    const name = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
    expect(path.resolve(AUDIT_DIRS.backend)).toBe(path.resolve(__dirname, '..'));
    expect(name(AUDIT_DIRS.backend)).toBe('eduabroad-server');
    expect(path.resolve(AUDIT_DIRS.frontend)).toBe(path.resolve(__dirname, '..', '..'));
    expect(name(AUDIT_DIRS.frontend)).toBe('abroad-consultancy-platform');
  });
});

describe('summariseAudit', () => {
  it('passes the vulnerability counts through', () => {
    const counts = { info: 0, low: 1, moderate: 2, high: 3, critical: 0, total: 6 };
    expect(summariseAudit({ metadata: { vulnerabilities: counts } })).toBe(counts);
  });

  it('turns npm\'s error object (no network, registry down) into one sentence', () => {
    const out = summariseAudit({ error: { code: 'ENOTFOUND', summary: 'request to https://registry.npmjs.org failed', detail: 'long text' } });
    expect(out).toEqual({ error: 'request to https://registry.npmjs.org failed' });
  });

  it('keeps a plain error string, and falls back to the error code', () => {
    expect(summariseAudit({ error: 'npm audit produced no output' })).toEqual({ error: 'npm audit produced no output' });
    expect(summariseAudit({ error: { code: 'EAUDITNOLOCK' } })).toEqual({ error: 'EAUDITNOLOCK' });
  });

  it('never returns an empty object: a result with no counts is an error, not a clean bill of health', () => {
    expect(summariseAudit({})).toEqual({ error: 'npm audit returned no vulnerability data' });
    expect(summariseAudit(null)).toEqual({ error: 'npm audit returned no vulnerability data' });
    expect(summariseAudit({ metadata: {} })).toEqual({ error: 'npm audit returned no vulnerability data' });
  });

  it('bounds how much of an error it passes on', () => {
    expect(summariseAudit({ error: 'x'.repeat(5000) }).error).toHaveLength(300);
  });
});
