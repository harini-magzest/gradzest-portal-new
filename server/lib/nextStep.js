// Works out the single most useful thing a student should do next, from their document checklist and
// application timeline. Pure (no database access) so it can be tested directly; routes/students.js loads the data.
// First match wins, in order of how much it blocks the student.

/**
 * @param {{ items: any[], summary: any }} checklist  from documentChecklist.buildChecklist
 * @param {any[]} applications  from applicationTimeline.buildTimeline
 * @returns {{ kind: string, title: string, detail: string, action: { label: string, to: string } }}
 */
function nextStepFor(checklist, applications = []) {
  const items = checklist?.items || [];

  const rejected = items.find((i) => i.status === 'rejected');
  if (rejected) {
    return {
      kind: 'document_rejected', title: `Re-upload your ${rejected.label.toLowerCase()}`,
      detail: 'Your counselor could not accept the file you uploaded. Please upload a clearer or corrected copy.',
      action: { label: 'Fix document', to: '/student/profile' },
    };
  }

  const expired = items.find((i) => i.warning?.level === 'expired');
  if (expired) {
    return {
      kind: 'passport_expired', title: 'Renew your passport', detail: expired.warning.message,
      action: { label: 'Update passport details', to: '/student/profile' },
    };
  }

  const offer = applications.find((a) => a.status === 'offer_received');
  if (offer) {
    return {
      kind: 'respond_to_offer', title: `Respond to your offer from ${offer.universityName || 'your university'}`,
      detail: 'Review the offer with your counselor and accept it before the response deadline.',
      action: { label: 'View applications', to: '/student/applications' },
    };
  }

  const missing = items.find((i) => i.status === 'missing' || i.status === 'requested');
  if (missing) {
    const count = checklist.summary?.missing ?? 1;
    return {
      kind: 'upload_document', title: `Upload your ${missing.label.toLowerCase()}`,
      detail: `${count} document${count === 1 ? ' is' : 's are'} still needed for your applications.`,
      action: { label: 'Upload now', to: '/student/profile' },
    };
  }

  const draft = applications.find((a) => a.status === 'draft');
  if (draft) {
    return {
      kind: 'finish_application', title: `Finish your application to ${draft.universityName || 'your university'}`,
      detail: 'It is saved as a draft. Submit it so the university can start reviewing.',
      action: { label: 'Open applications', to: '/student/applications' },
    };
  }

  const soon = applications
    .filter((a) => typeof a.daysToIntake === 'number' && a.daysToIntake >= 0 && a.daysToIntake <= 60 && !['rejected', 'enrolled'].includes(a.status))
    .sort((a, b) => a.daysToIntake - b.daysToIntake)[0];
  if (soon) {
    return {
      kind: 'intake_soon', title: `Your ${soon.intake} intake is ${soon.daysToIntake} day${soon.daysToIntake === 1 ? '' : 's'} away`,
      detail: 'Check with your counselor that nothing is holding up your application or visa.',
      action: { label: 'View timeline', to: '/student/applications' },
    };
  }

  if (items.some((i) => i.status === 'uploaded')) {
    return {
      kind: 'waiting_verification', title: 'Your documents are waiting for verification',
      detail: 'Your counselor will review them soon. You can message them if it is urgent.',
      action: { label: 'Message counselor', to: '/student/chat' },
    };
  }

  if (!applications.length) {
    return {
      kind: 'explore', title: 'Find a course and start your first application',
      detail: "Browse programs that match your profile, then apply with your counselor's help.",
      action: { label: 'Browse courses', to: '/student/courses' },
    };
  }

  return {
    kind: 'on_track', title: "You're on track",
    detail: "Nothing needs your attention right now. We'll tell you when something does.",
    action: { label: 'View applications', to: '/student/applications' },
  };
}

module.exports = { nextStepFor };
