// Lead -> application -> offer -> enrolled conversion, grouped by counselor, destination country or lead source.
// Pure (no database access): routes/dashboards.js loads the students and counselor names.

const OFFER = ['offer_received', 'accepted', 'enrolled'];

const SOURCE_LABELS = {
  self_signup: 'Self sign-up',
  admin_created: 'Added by admin',
  counselor_created: 'Added by counselor',
};

const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

// The group(s) a student belongs to. A student interested in several countries counts once under each, so country
// rows can add up to more than the number of students.
function keysFor(student, groupBy, counselorNames) {
  if (groupBy === 'counselor') {
    const name = student.counselorId ? counselorNames.get(String(student.counselorId)) : null;
    return [name || (student.counselorId ? 'Unknown counselor' : 'Unassigned')];
  }
  if (groupBy === 'country') {
    const countries = (student.preferredCountries || []).map((c) => String(c).trim()).filter(Boolean);
    return countries.length ? [...new Set(countries)] : ['Not specified'];
  }
  return [SOURCE_LABELS[student.source] || 'Unknown'];
}

/**
 * @param {object[]} students  lean student documents (counselorId, source, preferredCountries, applications, createdAt)
 * @param {'counselor'|'country'|'source'} groupBy
 * @param {{ counselorNames?: Map<string,string>, from?: Date|null, to?: Date|null }} [opts]  filters on the date the lead was created
 */
function buildConversion(students, groupBy, { counselorNames = new Map(), from = null, to = null } = {}) {
  const rows = new Map();
  const totals = { leads: 0, applied: 0, offers: 0, enrolled: 0 };

  for (const s of students) {
    const created = s.createdAt ? new Date(s.createdAt) : null;
    if (from && (!created || created < from)) continue;
    if (to && (!created || created > to)) continue;

    const apps = s.applications || [];
    const applied = apps.some((a) => a.status && a.status !== 'draft');
    const offer = apps.some((a) => OFFER.includes(a.status));
    const enrolled = apps.some((a) => a.status === 'enrolled');

    totals.leads++; if (applied) totals.applied++; if (offer) totals.offers++; if (enrolled) totals.enrolled++;

    for (const key of keysFor(s, groupBy, counselorNames)) {
      const r = rows.get(key) || { group: key, leads: 0, applied: 0, offers: 0, enrolled: 0 };
      r.leads++; if (applied) r.applied++; if (offer) r.offers++; if (enrolled) r.enrolled++;
      rows.set(key, r);
    }
  }

  const withRates = (r) => ({
    ...r,
    leadToApplied: pct(r.applied, r.leads),
    appliedToOffer: pct(r.offers, r.applied),
    leadToEnrolled: pct(r.enrolled, r.leads),
  });
  return {
    groupBy,
    rows: [...rows.values()].map(withRates).sort((a, b) => b.enrolled - a.enrolled || b.leads - a.leads || a.group.localeCompare(b.group)),
    totals: withRates(totals),
  };
}

module.exports = { buildConversion };
