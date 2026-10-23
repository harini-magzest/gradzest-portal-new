const { checkLoginFailureRules, checkSuspiciousIpRule, checkWafBlockRule } = require('../lib/detectIncidents');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const RequestLog = require('../models/RequestLog');

describe('detectIncidents — idempotent incident creation', () => {
  it('brute force: reuses the same open incident for repeated triggers from one IP instead of duplicating', async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;

    // Simulate 5 login_failure events from the same IP, matching the real threshold.
    const events = [];
    for (let i = 0; i < 5; i++) {
      events.push(await SecurityEvent.create({ type: 'login_failure', severity: 'low', ip, email: 'x@x.com' }));
    }

    // Call the rule once per event, exactly as logSecurityEvent does in production.
    for (const event of events) {
      await checkLoginFailureRules(event, null);
    }

    const incidents = await SecurityIncident.find({ type: 'brute_force', relatedIp: ip });
    expect(incidents.length).toBe(1);
    expect(incidents[0].sourceEventIds.length).toBeGreaterThanOrEqual(1);
  });

  it('brute force: attaches every failed login it counted, not only the one that crossed the threshold', async () => {
    const ip = `10.0.4.${Math.floor(Math.random() * 250)}`;
    const events = [];
    for (let i = 0; i < 6; i++) {
      events.push(await SecurityEvent.create({ type: 'login_failure', severity: 'low', ip, email: 'evidence@x.com' }));
      await checkLoginFailureRules(events[i], null);
    }

    const incidents = await SecurityIncident.find({ type: 'brute_force', relatedIp: ip });
    expect(incidents).toHaveLength(1);
    expect(incidents[0].title).toMatch(/^6 failed logins/);
    const attached = incidents[0].sourceEventIds.map(String);
    for (const e of events) expect(attached).toContain(String(e._id));
    expect(new Set(attached).size).toBe(attached.length);
  });

  it('brute force: does not create an incident below the threshold', async () => {
    const ip = `10.0.1.${Math.floor(Math.random() * 250)}`;
    const event = await SecurityEvent.create({ type: 'login_failure', severity: 'low', ip, email: 'x@x.com' });

    await checkLoginFailureRules(event, null);

    const incidents = await SecurityIncident.find({ type: 'brute_force', relatedIp: ip });
    expect(incidents.length).toBe(0);
  });

  it('suspicious IP: fires once the 401/403/429 threshold is crossed for one IP', async () => {
    const ip = `10.0.2.${Math.floor(Math.random() * 250)}`;
    let lastLog;
    for (let i = 0; i < 10; i++) {
      lastLog = await RequestLog.create({ method: 'GET', path: '/api/test', status: 401, ip, latencyMs: 5 });
    }
    await checkSuspiciousIpRule(lastLog, null);

    const incidents = await SecurityIncident.find({ type: 'suspicious_ip', relatedIp: ip });
    expect(incidents.length).toBe(1);
  });

  it('waf_block: reuses the open incident across different attack categories from the same IP and updates the title', async () => {
    const ip = `10.0.3.${Math.floor(Math.random() * 250)}`;

    const xssEvent = await SecurityEvent.create({ type: 'waf_block', severity: 'high', ip, meta: { category: 'xss' } });
    await checkWafBlockRule(xssEvent, null);

    const sqliEvent = await SecurityEvent.create({ type: 'waf_block', severity: 'high', ip, meta: { category: 'sql_injection' } });
    await checkWafBlockRule(sqliEvent, null);

    const incidents = await SecurityIncident.find({ type: 'waf_block', relatedIp: ip });
    expect(incidents.length).toBe(1); // still one incident, not two
    expect(incidents[0].title).toMatch(/sql injection/i); // title reflects the latest category, not the first
    expect(incidents[0].sourceEventIds.length).toBe(2);
  });
});

describe('detectIncidents — concurrent triggers', () => {
  it('a burst of simultaneous events lands on one incident with every event attached, and the title stays encrypted at rest', async () => {
    const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(await SecurityEvent.create({ type: 'login_failure', severity: 'low', ip, email: 'burst@x.com' }));
    }
    // Open the incident first, then fire the rest at once — before the fix, all but one of these
    // concurrent saves failed with a VersionError and their event ids were lost.
    await checkLoginFailureRules(events[4], null);
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
    await Promise.all(events.slice(5).map(e => checkLoginFailureRules(e, null)));
    spy.mockRestore();

    const incidents = await SecurityIncident.find({ type: 'brute_force', relatedIp: ip });
    expect(incidents).toHaveLength(1);
    const attached = incidents[0].sourceEventIds.map(String);
    for (const e of events.slice(4)) expect(attached).toContain(String(e._id));
    expect(new Set(attached).size).toBe(attached.length); // no duplicates
    expect(errors.filter(m => /No matching document|VersionError/.test(m))).toEqual([]);

    // The atomic update still goes through the encryption setter
    const raw = await SecurityIncident.collection.findOne({ _id: incidents[0]._id });
    expect(raw.title).not.toMatch(/failed logins/);
    expect(incidents[0].title).toMatch(/failed logins from/);
  });
});
