// Pure scoring logic for Zest's knowledge-base retrieval, split out of routes/zest.js so it's
// unit-testable without a live Mongo $text index or an ANTHROPIC_API_KEY.

// Mongo's $text search is OR, not AND — a chunk can score just for matching one word out of a
// whole question, including a chunk from a document on a completely different topic. Keeping
// everything within TOP_K regardless of how weak the match is would feed Claude irrelevant
// "reference material" it might confidently (and wrongly) answer from. Instead, only keep
// chunks scoring within RELATIVE_SCORE_FLOOR of the best match — close to the top result, not
// just present somewhere in a loosely-matched top-K.
const RELATIVE_SCORE_FLOOR = 0.5;

/**
 * @param {{ score: number }[]} ranked  chunks already sorted by $text score, descending
 * @param {number} floor  fraction of the top score a chunk must reach to survive (0-1)
 * @returns {object[]} the subset of `ranked` worth showing to the model
 */
function filterByRelativeScore(ranked, floor = RELATIVE_SCORE_FLOOR) {
  const topScore = ranked[0]?.score || 0;
  if (topScore <= 0) return [];
  return ranked.filter(m => m.score >= topScore * floor);
}

const TOP_K = 5;

/**
 * The knowledge-base chunks worth showing the model for one turn. A short follow-up reply ("UK", "the second
 * one") won't $text-match anything on its own, so the previous user turn is folded into the search.
 * Shared by routes/zest.js and the evaluation script so both retrieve identically.
 * @param {string} question
 * @param {{ role: string, text: string }[]} history  sanitized prior turns, oldest first
 */
async function retrieveChunks(question, history = []) {
  const KnowledgeChunk = require('../models/KnowledgeChunk');
  const priorUserText = [...history].reverse().find(h => h.role === 'user')?.text;
  const searchQuery = priorUserText ? `${priorUserText} ${question}` : question;
  // $text needs the text index, which Mongoose builds in the background on a fresh database (a new deployment, CI):
  // wait for it, and if it still isn't there, answer without knowledge-base context rather than fail the question.
  let ranked;
  try {
    await KnowledgeChunk.init();
    ranked = await KnowledgeChunk.find(
      { $text: { $search: searchQuery } },
      { score: { $meta: 'textScore' } },
    ).sort({ score: { $meta: 'textScore' } }).limit(TOP_K).lean();
  } catch (err) {
    if (err?.code === 27 || /text index required/i.test(err?.message || '')) return []; // IndexNotFound
    throw err;
  }
  return filterByRelativeScore(ranked);
}

module.exports = { filterByRelativeScore, retrieveChunks, RELATIVE_SCORE_FLOOR, TOP_K };
