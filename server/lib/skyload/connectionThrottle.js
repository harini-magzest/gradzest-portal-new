// Skyload connection throttle — caps how many requests from one IP can be
// in-flight (currently being processed by this server) at once. Real
// browsing traffic essentially never needs more than a handful of
// concurrent requests; a client holding open dozens simultaneously is
// either a broken client or deliberate resource-exhaustion abuse. This is
// application-layer connection accounting, not network-layer DDoS
// mitigation — see the honest limitation noted in server/middleware/skyload.js.
//
// Limits are lower for IPs the risk registry already considers suspicious
// (reputation-adaptive), matching Skyload's overall design: misbehaving
// IPs get treated more strictly on every subsequent request, not just the
// one that tripped a rule.

const { getScore } = require('./riskRegistry');

const inFlight = new Map(); // ip -> count of requests currently being processed

const NORMAL_LIMIT = 15;
const FLAGGED_LIMIT = 4; // applied once an IP's risk score crosses RISK_THRESHOLD
const RISK_THRESHOLD = 5;

function currentLimit(ip) {
  return getScore(ip) >= RISK_THRESHOLD ? FLAGGED_LIMIT : NORMAL_LIMIT;
}

function tryAcquire(ip) {
  const count = inFlight.get(ip) || 0;
  if (count >= currentLimit(ip)) return false;
  inFlight.set(ip, count + 1);
  return true;
}

function release(ip) {
  const count = inFlight.get(ip) || 0;
  if (count <= 1) inFlight.delete(ip);
  else inFlight.set(ip, count - 1);
}

module.exports = { tryAcquire, release };
