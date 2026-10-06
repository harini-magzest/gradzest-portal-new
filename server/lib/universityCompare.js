// Side-by-side comparison of universities for a student's shortlist. Pure (no database access).

const nums = (arr) => arr.filter((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);

// Everything the comparison table shows, worked out from one university document.
function summarise(uni) {
  const courses = uni.courses || [];
  const fees = nums(courses.map((c) => c.tuitionFee));
  const intakes = [...new Set(courses.flatMap((c) => c.intake || []).map((i) => String(i).trim()).filter(Boolean))];
  const scholarshipCourses = courses.filter((c) => c.scholarshipAvailable).length;
  const deadlines = (uni.applicationDeadlines || []).filter((d) => d.deadline && !isNaN(new Date(d.deadline).getTime()))
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const upcoming = deadlines.find((d) => new Date(d.deadline).getTime() >= Date.now());
  return {
    id: uni.id || String(uni._id),
    name: uni.name || '',
    country: uni.country || '',
    city: uni.city || '',
    type: uni.type || '',
    ranking: uni.ranking || null,
    rating: uni.rating || null,
    acceptanceRate: uni.acceptanceRate ?? null,
    currency: uni.averageFees?.currency || courses.find((c) => c.currency)?.currency || '',
    undergraduateFee: uni.averageFees?.undergraduate || null,
    postgraduateFee: uni.averageFees?.postgraduate || null,
    cheapestCourseFee: fees.length ? Math.min(...fees) : null,
    courseCount: courses.length,
    scholarshipCount: (uni.scholarships || []).length + scholarshipCourses,
    intakes,
    nextDeadline: upcoming ? { intake: upcoming.intake || '', deadline: upcoming.deadline } : null,
    internationalStudents: uni.internationalStudents ?? null,
    website: uni.website || '',
  };
}

// Which value is "best" for a row: the lowest or highest, or none when it is a matter of taste.
const ROWS = [
  { key: 'ranking', label: 'World ranking', best: 'min', format: 'rank' },
  { key: 'rating', label: 'Rating', best: 'max' },
  { key: 'acceptanceRate', label: 'Acceptance rate (%)', best: 'max' },
  { key: 'undergraduateFee', label: 'Undergraduate fee / year', best: 'min', format: 'money' },
  { key: 'postgraduateFee', label: 'Postgraduate fee / year', best: 'min', format: 'money' },
  { key: 'cheapestCourseFee', label: 'Cheapest course', best: 'min', format: 'money' },
  { key: 'courseCount', label: 'Courses offered', best: 'max' },
  { key: 'scholarshipCount', label: 'Scholarships', best: 'max' },
  { key: 'internationalStudents', label: 'International students', best: 'max' },
];

function pickBest(values, mode) {
  const candidates = values.map((v, i) => [v, i]).filter(([v]) => typeof v === 'number');
  if (candidates.length < 2) return null; // nothing to compare against
  const target = mode === 'min' ? Math.min(...candidates.map(([v]) => v)) : Math.max(...candidates.map(([v]) => v));
  const winners = candidates.filter(([v]) => v === target);
  return winners.length === candidates.length ? null : winners.map(([, i]) => i); // everyone equal: no winner
}

/** @param {object[]} summaries from summarise() */
function compare(summaries) {
  return {
    universities: summaries,
    rows: ROWS.map((r) => {
      const values = summaries.map((s) => s[r.key]);
      return { key: r.key, label: r.label, format: r.format || 'number', values, best: pickBest(values, r.best) };
    }),
  };
}

module.exports = { summarise, compare, ROWS };
