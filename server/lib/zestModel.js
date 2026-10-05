// Picks which model backend Zest talks to. anthropicClient.js (ANTHROPIC_API_KEY) is the
// production backend and always wins when configured; geminiClient.js (GEMINI_API_KEY) is a
// free-tier fallback for local testing when no Anthropic key is set yet — see
// server/.env.example. Both implement the identical askZest(...)/isZestConfigured() contract, so
// routes/zest.js never needs to know which one actually ran.
const anthropic = require('./anthropicClient');
const gemini = require('./geminiClient');

function pickProvider() {
  if (anthropic.isZestConfigured()) return anthropic;
  if (gemini.isZestConfigured()) return gemini;
  return anthropic; // neither configured — defer to anthropic's "not configured" error message
}

function isZestConfigured() {
  return anthropic.isZestConfigured() || gemini.isZestConfigured();
}

function askZest(...args) {
  return pickProvider().askZest(...args);
}

module.exports = { askZest, isZestConfigured };
