// Draft follow-up messages for counselors to send to a student who has gone quiet. The facts come from our own data;
// the AI (when available) only polishes the wording, and a plain template is the fallback, so a draft is always
// available. Pure (no database access): routes/zest.js loads the student and the checklist.

const { LEAD_STAGES } = require('./automation');

const APP_STATUSES = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', offer_received: 'Offer Received',
  accepted: 'Accepted', rejected: 'Rejected', enrolled: 'Enrolled',
};

const DAY = 86400000;
const CHANNELS = ['email', 'whatsapp'];

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/**
 * @param {object} student  lean student document
 * @param {{ items?: { label: string, status: string }[] }|null} checklist  from checklistFor()
 * @param {number} [now]
 */
function gatherFacts(student, checklist, now = Date.now()) {
  const changed = new Date(student.leadStageChangedAt || student.createdAt || now).getTime();
  const stage = student.leadStage || 'new_enquiry';
  const openApps = (student.applications || []).filter((a) => !['rejected', 'enrolled'].includes(a.status));
  return {
    firstName: firstName(student.name),
    stage,
    stageLabel: LEAD_STAGES[stage] || stage.replace(/_/g, ' '),
    daysIdle: Math.max(0, Math.floor((now - changed) / DAY)),
    countries: (student.preferredCountries || []).slice(0, 3),
    applications: openApps.slice(0, 3).map((a) => ({ university: a.universityName || 'a university', course: a.courseName || '', status: APP_STATUSES[a.status] || a.status })),
    missingDocuments: (checklist?.items || []).filter((i) => ['missing', 'requested', 'rejected'].includes(i.status)).slice(0, 3).map((i) => i.label),
  };
}

// The sentence(s) describing where things stand: used by the template, and given to the AI as the facts to use.
function situation(f) {
  const parts = [];
  if (f.applications.length) {
    parts.push(`your application${f.applications.length > 1 ? 's' : ''} to ${f.applications.map((a) => `${a.university}${a.course ? ` (${a.course})` : ''} is ${a.status.toLowerCase()}`).join(', ')}`);
  } else if (f.countries.length) {
    parts.push(`your plans to study in ${f.countries.join(' or ')}`);
  }
  return parts.join('');
}

function templateDraft(f, channel, counselorName = '') {
  const sign = counselorName ? `\n${counselorName}\nGradzest` : '\nGradzest';
  const ask = f.missingDocuments.length
    ? `The next step is to send us ${f.missingDocuments.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
    : 'Is there anything holding you back that I can help with?';
  const status = situation(f);
  if (channel === 'whatsapp') {
    return {
      subject: '',
      body: `Hi ${f.firstName}, it's ${counselorName || 'your Gradzest counselor'}. I wanted to check in${status ? ` about ${status}` : ' on your study abroad plans'}. ${ask} Reply here any time and I'll help.`,
    };
  }
  return {
    subject: `Checking in on your study abroad plans, ${f.firstName}`,
    body: `Hi ${f.firstName},\n\nI wanted to check in${status ? ` about ${status}` : ' on your study abroad plans'}. It has been a little while since we last spoke. ${ask}\n\nIf you would like to talk it through, reply to this message and we can set up a quick call.\n\nBest wishes,${sign}`,
  };
}

// What the AI is asked. It must use only these facts: no invented deadlines, fees or promises.
function buildPrompt(f, channel, counselorName = '') {
  const lines = [
    `Write a short, warm follow-up ${channel === 'whatsapp' ? 'WhatsApp message (2-4 sentences, no subject, casual but professional)' : 'email (a subject line, then a body of 3 short paragraphs at most)'} from the counselor${counselorName ? ` ${counselorName}` : ''} to a student who has gone quiet.`,
    `Student's first name: ${f.firstName}`,
    `Lead stage: ${f.stageLabel}, unchanged for ${f.daysIdle} days.`,
    f.countries.length ? `Interested in: ${f.countries.join(', ')}.` : '',
    f.applications.length ? `Open applications: ${f.applications.map((a) => `${a.university}${a.course ? ` (${a.course})` : ''}, ${a.status}`).join('; ')}.` : 'No applications yet.',
    f.missingDocuments.length ? `Documents still needed: ${f.missingDocuments.join(', ')}.` : '',
    'Rules: use only the facts above. Do not invent deadlines, fees, offers or promises. Make one clear, easy next step. Do not use placeholders like [name]. Do not mention that you are an AI.',
    channel === 'whatsapp' ? 'Reply with only the message text.' : 'Reply in exactly this form:\nSubject: <subject line>\n\n<body>',
  ];
  return lines.filter(Boolean).join('\n');
}

// Splits the model's reply into subject and body for email; WhatsApp is all body.
function parseDraft(text, channel) {
  const clean = String(text || '').trim();
  if (channel === 'whatsapp') return { subject: '', body: clean };
  const m = clean.match(/^subject:\s*(.+?)\r?\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: '', body: clean };
}

module.exports = { gatherFacts, templateDraft, buildPrompt, parseDraft, CHANNELS };
