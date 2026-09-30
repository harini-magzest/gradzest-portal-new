const mongoose = require('mongoose');
const { checkImpossibleTravelRule, haversineKm } = require('../lib/detectIncidents');
const SecurityEvent = require('../models/SecurityEvent');
const SecurityIncident = require('../models/SecurityIncident');

// Real-world coordinates, used only for deterministic distance math — no
// network lookup involved. `intelFn` is injected so these tests don't
// depend on ip-api.com's live response, mirroring how criticalAlert.js
// takes an injectable mailer for the same reason.
const LONDON = { city: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 };
const NEW_YORK = { city: 'New York', country: 'US', lat: 40.7128, lon: -74.0060 };
// ~11km apart — well under the rule's 300km minimum-distance guard, unlike
// Mumbai/Delhi (~1150km, which would correctly trigger the rule).
const MUMBAI = { city: 'Mumbai', country: 'India', lat: 19.0760, lon: 72.8777 };
const NEARBY_SUBURB = { city: 'Mumbai suburb', country: 'India', lat: 19.1760, lon: 72.8777 };

function intelFor(map) {
  return async (ip) => ({ available: true, ...map[ip] });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('detectIncidents — impossible travel', () => {
  it('haversineKm: London to New York is ~5570km (real-world sanity check)', () => {
    const km = haversineKm(LONDON.lat, LONDON.lon, NEW_YORK.lat, NEW_YORK.lon);
    expect(km).toBeGreaterThan(5460);
    expect(km).toBeLessThan(5680);
  });

  it('flags a login from a far-apart IP soon after a login from another IP', async () => {
    const userId = new mongoose.Types.ObjectId();
    const email = 'traveler@example.com';

    await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.1.1.1' });
    await wait(10);
    const current = await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.2.2.2' });

    await checkImpossibleTravelRule(current, null, intelFor({ '11.1.1.1': LONDON, '11.2.2.2': NEW_YORK }));

    const incidents = await SecurityIncident.find({ type: 'impossible_travel', relatedUserId: userId });
    expect(incidents.length).toBe(1);
    expect(incidents[0].severity).toBe('high');
    expect(incidents[0].title).toContain('London');
    expect(incidents[0].title).toContain('New York');
  });

  it('does not flag two logins that are physically close together', async () => {
    const userId = new mongoose.Types.ObjectId();
    const email = 'commuter@example.com';

    await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.3.3.3' });
    await wait(10);
    const current = await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.4.4.4' });

    await checkImpossibleTravelRule(current, null, intelFor({ '11.3.3.3': MUMBAI, '11.4.4.4': NEARBY_SUBURB }));

    const incidents = await SecurityIncident.find({ type: 'impossible_travel', relatedUserId: userId });
    expect(incidents.length).toBe(0);
  });

  it('does not flag when there is no prior login to compare against', async () => {
    const userId = new mongoose.Types.ObjectId();
    const current = await SecurityEvent.create({ type: 'login_success', userId, email: 'solo@example.com', ip: '11.5.5.5' });

    await checkImpossibleTravelRule(current, null, intelFor({ '11.5.5.5': NEW_YORK }));

    const incidents = await SecurityIncident.find({ type: 'impossible_travel', relatedUserId: userId });
    expect(incidents.length).toBe(0);
  });

  it('does not flag when geolocation is unavailable for either IP', async () => {
    const userId = new mongoose.Types.ObjectId();
    const email = 'unresolvable@example.com';

    await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.6.6.6' });
    await wait(10);
    const current = await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.7.7.7' });

    const intelFn = async (ip) => (ip === '11.7.7.7' ? { available: true, ...NEW_YORK } : { available: false, reason: 'private range' });
    await checkImpossibleTravelRule(current, null, intelFn);

    const incidents = await SecurityIncident.find({ type: 'impossible_travel', relatedUserId: userId });
    expect(incidents.length).toBe(0);
  });

  it('reuses the same open incident on a repeated trigger instead of duplicating', async () => {
    const userId = new mongoose.Types.ObjectId();
    const email = 'repeat@example.com';

    await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.8.8.8' });
    await wait(10);
    const current1 = await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.9.9.9' });
    await checkImpossibleTravelRule(current1, null, intelFor({ '11.8.8.8': LONDON, '11.9.9.9': NEW_YORK }));

    await wait(10);
    const current2 = await SecurityEvent.create({ type: 'login_success', userId, email, ip: '11.10.10.10' });
    await checkImpossibleTravelRule(current2, null, intelFor({ '11.9.9.9': LONDON, '11.10.10.10': NEW_YORK }));

    const incidents = await SecurityIncident.find({ type: 'impossible_travel', relatedUserId: userId });
    expect(incidents.length).toBe(1); // still one incident, not two
    expect(incidents[0].sourceEventIds.length).toBe(3);
  });
});
