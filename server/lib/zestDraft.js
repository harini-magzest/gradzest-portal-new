// Helpers for Zest's "draft a reply" feature: staff pick a student's chat and Zest suggests a reply to the student's
// latest message, which the staff member edits and sends themselves. Pure (no database access) so it can be tested.

const MAX_MESSAGES = 12; // enough context for a reply; keeps the prompt small
const MAX_MESSAGE_CHARS = 600;

/** The recent plain-text messages of a chat room, oldest first, as { who, text } where who is 'student' or 'staff'. */
function recentTranscript(messages = []) {
  return messages
    .filter((m) => (m.type || 'text') === 'text' && String(m.content || '').trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      who: m.senderRole === 'student' ? 'student' : 'staff',
      name: m.senderName || '',
      text: String(m.content).trim().slice(0, MAX_MESSAGE_CHARS),
    }));
}

/** The text handed to Zest as an attached "document": the conversation, clearly marked as data. */
function transcriptText(lines) {
  return lines.map((l) => `${l.who === 'student' ? 'Student' : 'Counselor'}${l.name ? ` (${l.name})` : ''}: ${l.text}`).join('\n');
}

const DRAFT_INSTRUCTION =
  "Write a reply from the counselor to the student's most recent message in the attached conversation. "
  + 'Be warm, brief (2-4 sentences) and specific. Reply in the language the student used. '
  + 'Do not invent facts, fees, dates or promises. If the student asks whether something is allowed, accepted, required or '
  + 'possible, and the conversation and the facts you were given do not say so, do NOT answer yes or no and do not add '
  + 'conditions of your own: thank them for asking and say you will check and confirm. '
  + 'Output only the message text, with no greeting line like "Draft:" and no commentary.';

/** True when there is a student message to answer: the last message in the conversation is the student's. */
function needsReply(lines) {
  return lines.length > 0 && lines[lines.length - 1].who === 'student';
}

module.exports = { recentTranscript, transcriptText, needsReply, DRAFT_INSTRUCTION, MAX_MESSAGES };
