// A student's saved courses ("shortlist") and how they are shown side by side. The pure helpers here take
// plain objects so they can be tested directly; routes/students.js does the database lookups.

const MAX_SHORTLIST = 12; // compare tables stop being readable well before this; it also bounds the lookup

/** Flattens one university + course into the row the compare table shows. */
function describeEntry(university, course, addedAt) {
  const elig = course.eligibility || {};
  return {
    universityId: String(university.id || university._id),
    courseId: String(course.id || course._id),
    universityName: university.name || '',
    country: university.country || '',
    city: university.city || '',
    logo: university.logo || '',
    ranking: university.ranking ?? null,
    courseName: course.name || '',
    level: course.level || '',
    duration: course.duration || '',
    tuitionFee: course.tuitionFee ?? null,
    currency: course.currency || university.averageFees?.currency || '',
    applicationFee: course.applicationFee ?? null,
    intake: course.intake || [],
    scholarshipAvailable: !!course.scholarshipAvailable,
    scholarshipAmount: course.scholarshipAmount || '',
    minGPA: elig.minGPA ?? null,
    englishRequirements: (elig.englishRequirements || []).map((r) => ({ test: r.test, minScore: r.minScore })),
    addedAt: addedAt || null,
  };
}

/** Which entries are the cheapest / best ranked, so the table can highlight them. */
function highlights(rows) {
  const cheapest = rows.filter((r) => typeof r.tuitionFee === 'number' && r.tuitionFee > 0)
    .sort((a, b) => a.tuitionFee - b.tuitionFee)[0];
  const best = rows.filter((r) => typeof r.ranking === 'number' && r.ranking > 0)
    .sort((a, b) => a.ranking - b.ranking)[0];
  const key = (r) => (r ? `${r.universityId}:${r.courseId}` : null);
  return { cheapest: key(cheapest), bestRanked: key(best) };
}

/** Adds an entry, ignoring a repeat and refusing past the cap. Returns the new list, or null if the list is full. */
function addEntry(list, universityId, courseId, now = new Date()) {
  const u = String(universityId);
  const c = String(courseId);
  if (list.some((e) => e.universityId === u && e.courseId === c)) return list;
  if (list.length >= MAX_SHORTLIST) return null;
  return [...list, { universityId: u, courseId: c, addedAt: now }];
}

function removeEntry(list, universityId, courseId) {
  return list.filter((e) => !(e.universityId === String(universityId) && e.courseId === String(courseId)));
}

module.exports = { MAX_SHORTLIST, describeEntry, highlights, addEntry, removeEntry };
