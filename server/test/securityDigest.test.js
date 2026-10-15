const SecurityIncident = require('../models/SecurityIncident');
const SecurityEvent = require('../models/SecurityEvent');
const User = require('../models/User');
const { markStaleIncidents, runSecurityDigest } = require('../jobs/securityDigest');

const FIFTEEN_DAYS_AGO = () => new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

describe('securityDigest — stale marking', () => {
  it('marks an open incident stale after 14+ days with no update, leaves a recent one alone', async () => {
    const old = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Old incident', status: 'open' });
    const recent = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Recent incident', status: 'open' });

    // Bypass mongoose's timestamps plugin (which would overwrite updatedAt on
    // any .save()) via the raw driver, to simulate a genuinely old incident.
    await SecurityIncident.collection.updateOne({ _id: old._id }, { $set: { updatedAt: FIFTEEN_DAYS_AGO() } });

    await markStaleIncidents();

    expect((await SecurityIncident.findById(old._id)).stale).toBe(true);
    expect((await SecurityIncident.findById(recent._id)).stale).toBe(false);
  });

  it('un-stales an incident once an analyst updates it again', async () => {
    const incident = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Will be revived', status: 'open' });
    await SecurityIncident.collection.updateOne({ _id: incident._id }, { $set: { updatedAt: FIFTEEN_DAYS_AGO(), stale: true } });

    const doc = await SecurityIncident.findById(incident._id);
    doc.notes.push({ author: 'Analyst', authorRole: 'admin', text: 'Still looking into this' });
    await doc.save(); // real mongoose save — bumps updatedAt to now via the timestamps plugin

    await markStaleIncidents();

    expect((await SecurityIncident.findById(incident._id)).stale).toBe(false);
  });

  it('does not mark a resolved incident stale', async () => {
    const resolved = await SecurityIncident.create({ type: 'manual', severity: 'low', title: 'Resolved long ago', status: 'resolved' });
    await SecurityIncident.collection.updateOne({ _id: resolved._id }, { $set: { updatedAt: FIFTEEN_DAYS_AGO() } });

    await markStaleIncidents();

    expect((await SecurityIncident.findById(resolved._id)).stale).toBe(false);
  });
});

describe('securityDigest — daily email', () => {
  it('emails every admin with real counts from the last 24h', async () => {
    const email = `digest-admin-${Date.now()}@example.com`;
    await new User({ name: 'Digest Admin', email, password: 'hashed', role: 'admin', status: 'active' }).save();

    await SecurityIncident.create({ type: 'manual', severity: 'critical', title: 'Digest test incident', status: 'open' });
    await SecurityEvent.create({ type: 'login_failure', ip: '12.0.0.1' });

    const sendMail = vi.fn().mockResolvedValue({});
    await runSecurityDigest({ sendMail });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toContain(email);
    expect(call.subject).toMatch(/new incident/);
    expect(call.html).toContain('critical');

    await User.deleteOne({ email });
  });

  it('does not send when there are no admins', async () => {
    await User.deleteMany({ role: 'admin' });
    const sendMail = vi.fn().mockResolvedValue({});
    await runSecurityDigest({ sendMail });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('no-ops without a mailer configured, does not throw', async () => {
    await expect(runSecurityDigest(null)).resolves.not.toThrow();
  });
});
