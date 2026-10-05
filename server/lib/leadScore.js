// Scores how likely a lead is to convert (0-100) so counselors know whom to call first. A transparent
// points system rather than a model: every score comes with the reasons behind it, so a counselor can see why a
// lead is hot and what would move it. Pure (no database access); routes/dashboards.js loads the data.

const DAY = 86400000;

// How far along the pipeline a lead is is the biggest signal.
const STAGE_POINTS = {
  new_enquiry: 10, interested: 25, counselling: 40, shortlisting: 50, applications: 65,
  visa_process: 80, visa_approved: 90, enrolment: 95,
  future_lead: 15, test_prep: 20, not_responding: 5, other: 15,
};
// These leads are no longer being worked, so they are not ranked.
const CLOSED_STAGES = ['dropped_plans', 'dnd', 'other_agent'];

const SUBMITTED = ['submitted', 'under_review', 'offer_received', 'accepted', 'enrolled'];
const OFFERED = ['offer_received', 'accepted', 'enrolled'];

function bandOf(score) {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  if (score >= 15) return 'cool';
  return 'cold';
}

/**
 * @param {object} lead   the student document (lean)
 * @param {{ meetingsLast30d?: number, now?: number }} [extra]
 * @returns {{ score: number, band: 'hot'|'warm'|'cool'|'cold'|'closed', reasons: { text: string, points: number }[] }}
 */
function scoreLead(lead, { meetingsLast30d = 0, now = Date.now() } = {}) {
  const stage = lead.leadStage || 'new_enquiry';
  if (CLOSED_STAGES.includes(stage)) {
    return { score: 0, band: 'closed', reasons: [{ text: 'Lead is closed (dropped, do not disturb or with another agent)', points: 0 }] };
  }

  const reasons = [];
  const add = (text, points) => { if (points) reasons.push({ text, points }); };

  const stagePoints = STAGE_POINTS[stage] ?? 15;
  add(`Pipeline stage: ${stage.replace(/_/g, ' ')}`, stagePoints);

  const apps = lead.applications || [];
  if (apps.some((a) => OFFERED.includes(a.status))) add('Has an offer', 15);
  else if (apps.some((a) => SUBMITTED.includes(a.status))) add('Has submitted an application', 10);

  const profile = [lead.phone, (lead.preferredCountries || []).length, lead.budget, lead.educationLevel, lead.gpa, lead.englishScore?.score];
  const filled = profile.filter(Boolean).length;
  add(`Profile ${filled} of ${profile.length} key details filled in`, Math.round((filled / profile.length) * 10));

  const docs = lead.documents || [];
  if (docs.some((d) => d.status === 'verified')) add('Has a verified document', 5);
  if (docs.filter((d) => d.url).length >= 3) add('Has uploaded 3 or more documents', 5);

  if (meetingsLast30d > 0) add(`${meetingsLast30d} meeting${meetingsLast30d === 1 ? '' : 's'} in the last 30 days`, 10);

  const lastSeen = Math.max(0, ...(lead.sessions || []).map((s) => new Date(s.lastUsedAt || 0).getTime()));
  if (lastSeen && now - lastSeen <= 7 * DAY) add('Signed in within the last 7 days', 5);

  // Momentum: a lead that has sat at the same stage loses points the longer it sits.
  const changed = new Date(lead.leadStageChangedAt || lead.createdAt || now).getTime();
  const idle = Math.floor((now - changed) / DAY);
  if (idle <= 3) add('Moved stage in the last 3 days', 5);
  else if (idle >= 30) add(`No stage movement for ${idle} days`, -20);
  else if (idle >= 14) add(`No stage movement for ${idle} days`, -10);

  const score = Math.max(0, Math.min(100, reasons.reduce((n, r) => n + r.points, 0)));
  return { score, band: bandOf(score), reasons };
}

module.exports = { scoreLead, bandOf, CLOSED_STAGES };
