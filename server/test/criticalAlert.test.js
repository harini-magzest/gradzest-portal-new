const { initCriticalAlert, sendCriticalIncidentAlert } = require('../lib/criticalAlert');
const { checkWafBlockRule } = require('../lib/detectIncidents');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');
const { waitUntil } = require('./helpers');

describe('Critical incident email alerts', () => {
  it('emails every admin with the incident details when initialized with a real mailer', async () => {
    const email = `alert-admin-${Date.now()}@example.com`;
    await new User({ name: 'Alert Admin', email, password: 'hashed', role: 'admin', status: 'active' }).save();

    const sendMail = vi.fn().mockResolvedValue({});
    initCriticalAlert({ sendMail });

    const incident = await SecurityIncident.create({
      type: 'malware_upload', severity: 'critical', title: 'Test critical incident', relatedIp: '203.0.113.5',
    });

    await sendCriticalIncidentAlert(incident);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toContain(email);
    expect(call.subject).toContain('Test critical incident');
    expect(call.html).toContain('203.0.113.5');

    await SecurityIncident.deleteOne({ _id: incident._id });
    await User.deleteOne({ email });
  });

  it('does not throw when the mailer itself fails (fails closed, gracefully)', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('Missing credentials for "PLAIN"'));
    initCriticalAlert({ sendMail });

    const incident = await SecurityIncident.create({ type: 'malware_upload', severity: 'critical', title: 'Fail test' });
    await expect(sendCriticalIncidentAlert(incident)).resolves.not.toThrow();

    await SecurityIncident.deleteOne({ _id: incident._id });
  });

  it('is triggered by checkWafBlockRule only for a newly-created critical incident, not on reuse', async () => {
    // sendCriticalIncidentAlert correctly no-ops when there are zero admins to
    // notify — needs a real admin in the DB for this test to observe a send.
    const adminEmail = `alert-waf-admin-${Date.now()}@example.com`;
    await new User({ name: 'Alert Admin', email: adminEmail, password: 'hashed', role: 'admin', status: 'active' }).save();

    const sendMail = vi.fn().mockResolvedValue({});
    initCriticalAlert({ sendMail });

    const ip = `10.9.${Math.floor(Math.random() * 250)}.1`;
    const event1 = await SecurityEvent.create({ type: 'waf_block', severity: 'critical', ip, meta: { category: 'command_injection' } });
    await checkWafBlockRule(event1, null);
    // sendCriticalIncidentAlert is fire-and-forget — poll instead of a fixed
    // sleep, since how long it takes depends on whatever else is queued.
    await waitUntil(() => sendMail.mock.calls.length >= 1);
    expect(sendMail).toHaveBeenCalledTimes(1); // new critical incident -> alert fires

    const event2 = await SecurityEvent.create({ type: 'waf_block', severity: 'critical', ip, meta: { category: 'command_injection' } });
    await checkWafBlockRule(event2, null);
    await new Promise((r) => setTimeout(r, 300)); // reused incident -> incident_updated, not _created, so no alert is ever queued here to poll for
    expect(sendMail).toHaveBeenCalledTimes(1); // same open incident reused -> no second alert

    await SecurityEvent.deleteMany({ ip });
    await SecurityIncident.deleteMany({ relatedIp: ip });
    await User.deleteOne({ email: adminEmail });
  });
});
