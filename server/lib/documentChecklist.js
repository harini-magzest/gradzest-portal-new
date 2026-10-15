// Builds a student's document checklist: the documents every application needs, plus whatever each
// destination country's visa requires (Country.visa.documents), matched against what the student has uploaded.
// Pure functions (no database access) so they can be tested directly; routes/students.js loads the data.
const { passportWarning, parseDate } = require('./documentCheck');

// The standard set. `uploadType` is the document type the student's upload form uses, so "Upload" on a missing
// item files the document under the type that will match it next time.
const CORE = [
  { key: 'passport', label: 'Passport', uploadType: 'Passport', match: /passport/i },
  { key: 'transcripts', label: 'Academic transcripts and certificates', uploadType: 'Transcript', match: /transcript|mark\s?sheet|10th|12th|intermediate|diploma|degree/i, exclude: /english|ielts|toefl|pte|duolingo/i },
  { key: 'english', label: 'English test score (IELTS / TOEFL / PTE)', uploadType: 'English Test Certificate', match: /english|ielts|toefl|pte|duolingo|moi/i },
  { key: 'sop', label: 'Statement of purpose', uploadType: 'SOP', match: /\bsop\b|statement of purpose|personal statement/i },
  { key: 'lor', label: 'Letters of recommendation', uploadType: 'LOR', match: /\blor\b|reference|recommendation/i },
  { key: 'cv', label: 'CV / résumé', uploadType: 'CV/Resume', match: /\bcv\b|resume|résumé|curriculum/i },
  { key: 'financial', label: 'Proof of funds (bank statement)', uploadType: 'Bank Statement', match: /bank|financ|funds?\b|sponsor|income|affidavit/i },
];

const norm = (s) => String(s || '').trim();
const haystack = (d) => `${norm(d.type)} ${norm(d.name)}`;

function coreFor(text) {
  return CORE.find((c) => c.match.test(text) && !(c.exclude && c.exclude.test(text)));
}

// Words long enough to identify a document ("police", "clearance"), for matching free-text country requirements.
const words = (s) => norm(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
const STOP = new Set(['copy', 'copies', 'with', 'from', 'your', 'that', 'this', 'certified', 'original', 'valid', 'recent', 'document', 'documents', 'letter', 'proof', 'certificate', 'test', 'report', 'form']);

// A document counts only once there is a file behind it: staff "requests" create an empty placeholder row.
const hasFile = (d) => !!d.url;

const RANK = { verified: 3, uploaded: 2, rejected: 1, requested: 0 };

function statusOf(d) {
  if (d.status === 'verified') return 'verified';
  if (d.status === 'rejected') return 'rejected';
  return hasFile(d) ? 'uploaded' : 'requested';
}

function bestMatch(docs, test) {
  let best = null;
  for (const d of docs) {
    if (!test(d)) continue;
    const status = statusOf(d);
    if (!best || RANK[status] > RANK[best.status]) best = { doc: d, status };
  }
  return best;
}

/**
 * @param {{ documents?: any[] }} student
 * @param {{ name: string, visa?: { documents?: string[] } }[]} countries  the student's destination countries
 */
function buildChecklist(student, countries = [], now = Date.now()) {
  const docs = student.documents || [];
  const intakes = (student.applications || []).map((a) => parseDate(a.intake)).filter(Boolean).sort((a, b) => a - b);
  const passport = passportWarning(student.passport?.expiryDate, now, intakes[0] || null);
  const items = [];

  for (const c of CORE) {
    const m = bestMatch(docs, (d) => coreFor(haystack(d))?.key === c.key);
    items.push({
      key: c.key, label: c.label, scope: 'all', uploadType: c.uploadType,
      status: m ? m.status : 'missing', docId: m ? String(m.doc._id) : null, docName: m ? m.doc.name : null,
      ...(c.key === 'passport' && passport ? { warning: passport } : {}),
    });
  }

  const seen = new Set();
  for (const country of countries) {
    for (const raw of country.visa?.documents || []) {
      const label = norm(raw);
      if (!label) continue;
      const core = coreFor(label);
      if (core) continue; // already covered by the standard set
      const dedupe = label.toLowerCase();
      if (seen.has(dedupe)) {
        const existing = items.find((i) => i.label.toLowerCase() === dedupe);
        if (existing && !existing.scope.split(', ').includes(country.name)) existing.scope += `, ${country.name}`;
        continue;
      }
      seen.add(dedupe);
      const w = words(label);
      const m = w.length ? bestMatch(docs, (d) => { const h = haystack(d).toLowerCase(); return w.some((x) => h.includes(x)); }) : null;
      items.push({
        key: `visa:${dedupe}`, label, scope: country.name, uploadType: 'Other',
        status: m ? m.status : 'missing', docId: m ? String(m.doc._id) : null, docName: m ? m.doc.name : null,
      });
    }
  }

  const total = items.length;
  const verified = items.filter((i) => i.status === 'verified').length;
  const uploaded = items.filter((i) => i.status === 'uploaded').length;
  const missing = items.filter((i) => i.status === 'missing' || i.status === 'requested' || i.status === 'rejected').length;
  return {
    items,
    countries: countries.map((c) => c.name),
    summary: { total, verified, uploaded, missing, percent: total ? Math.round(((verified + uploaded) / total) * 100) : 0 },
  };
}

// Which Country documents apply: the student's preferred countries plus the country of each university applied to.
function destinationNames(student, universityCountries = []) {
  const names = [...(student.preferredCountries || []), ...universityCountries].map(norm).filter(Boolean);
  const seen = new Set();
  return names.filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)));
}

module.exports = { buildChecklist, destinationNames, CORE };
