// Sanitizes client-supplied conversation history for Zest's /ask route before it's handed to
// the Claude API. The client sends its own visible chat transcript, so this is untrusted input:
// it must be capped in size, and Claude's API requires messages to strictly alternate
// user/assistant starting with 'user' — a malformed array (e.g. two errors in a row from a
// retry) must be cleaned up rather than causing a 400 from the model call.

const MAX_HISTORY_MESSAGES = 8; // last 4 exchanges — enough to resolve "which one?" follow-ups
const MAX_TEXT_LENGTH = 1000;

/**
 * @param {unknown} raw  req.body.history, untrusted
 * @returns {{ role: 'user'|'assistant', text: string }[]} oldest first, valid alternating, starts
 *   with 'user' and ends with 'assistant' (the caller appends the new question as the final turn)
 */
function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];

  const cleaned = raw
    .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim())
    .map(h => ({ role: h.role, text: h.text.trim().slice(0, MAX_TEXT_LENGTH) }))
    .slice(-MAX_HISTORY_MESSAGES * 2); // generous pre-trim before alternation collapsing below

  const alternating = [];
  for (const h of cleaned) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === h.role) {
      last.text = `${last.text}\n${h.text}`.slice(0, MAX_TEXT_LENGTH);
    } else {
      alternating.push({ ...h });
    }
  }

  while (alternating.length && alternating[0].role !== 'user') alternating.shift();
  while (alternating.length && alternating[alternating.length - 1].role !== 'assistant') alternating.pop();

  return alternating.slice(-MAX_HISTORY_MESSAGES);
}

module.exports = { sanitizeHistory, MAX_HISTORY_MESSAGES };
