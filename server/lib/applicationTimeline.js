// Turns each of a student's applications into a step-by-step timeline: where it is now, how long it has been
// there, what happens next, and how long until the intake. Pure (no database access) so it can be tested directly.

// The happy path, in order. `draft` comes before the first step; `rejected` is a dead end handled separately.
const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'offer_received', label: 'Offer received' },
  { key: 'accepted', label: 'Offer accepted' },
  { key: 'enrolled', label: 'Enrolled' },
];

const NEXT = {
  draft: 'Finish your application and submit it.',
  submitted: 'The university will start reviewing it. Make sure your documents are uploaded and verified.',
  under_review: 'The university is reviewing it. Reply quickly if they ask for anything more.',
  offer_received: 'Review your offer with your counselor and accept it before the response deadline.',
  accepted: 'Move on to your visa and enrolment steps.',
  enrolled: "You're enrolled. Congratulations!",
  rejected: 'Talk to your counselor about alternative courses or universities.',
};

const DAY = 86400000;

// Accepts "September 2027", "Sep 2027" and "2027-09-01", the formats intakes are entered in.
function parseIntake(intake) {
  if (!intake) return null;
  const d = new Date(intake);
  if (!isNaN(d.getTime())) return d;
  const m = String(intake).match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const p = new Date(`${m[1]} 1, ${m[2]}`);
    if (!isNaN(p.getTime())) return p;
  }
  return null;
}

function daysSince(dateLike, now) {
  if (!dateLike) return null;
  const t = new Date(dateLike).getTime();
  return isNaN(t) ? null : Math.max(0, Math.floor((now - t) / DAY));
}

function buildTimeline(applications = [], now = Date.now()) {
  return applications.map((a) => {
    const status = a.status || 'submitted';
    const rejected = status === 'rejected';
    const idx = STEPS.findIndex((s) => s.key === status); // -1 for draft and rejected

    const steps = STEPS.map((s, i) => {
      let state = 'upcoming';
      if (!rejected && idx >= 0) state = i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
      // We only know when the current stage began, plus the original submission date.
      const at = s.key === 'submitted' ? (a.submittedDate || null) : state === 'current' ? (a.statusChangedAt || null) : null;
      return { key: s.key, label: s.label, state, at };
    });

    const intakeDate = parseIntake(a.intake);
    const daysToIntake = intakeDate ? Math.ceil((intakeDate.getTime() - now) / DAY) : null;

    return {
      id: String(a._id),
      universityName: a.universityName || '',
      courseName: a.courseName || '',
      intake: a.intake || '',
      status,
      rejected,
      steps,
      daysInStage: daysSince(a.statusChangedAt || a.submittedDate, now),
      daysToIntake,
      intakePassed: daysToIntake !== null && daysToIntake < 0,
      next: NEXT[status] || '',
    };
  });
}

module.exports = { buildTimeline, parseIntake, STEPS };
