// Picks which model backend Zest talks to. ZEST_PROVIDER=ollama (ollamaClient.js) is an explicit
// opt-in to a self-hosted model and wins when set. Otherwise anthropicClient.js
// (ANTHROPIC_API_KEY) is the production backend; geminiClient.js (GEMINI_API_KEY) is a free-tier
// fallback for local testing when no Anthropic key is set yet — see server/.env.example. All three
// implement the identical askZest(...)/isZestConfigured() contract, so routes/zest.js never needs
// to know which one actually ran.
const anthropic = require('./anthropicClient');
const gemini = require('./geminiClient');
const ollama = require('./ollamaClient');

function pickProvider() {
  if (ollama.isZestConfigured()) return ollama;
  if (anthropic.isZestConfigured()) return anthropic;
  if (gemini.isZestConfigured()) return gemini;
  return anthropic; // none configured — defer to anthropic's "not configured" error message
}

function isZestConfigured() {
  return ollama.isZestConfigured() || anthropic.isZestConfigured() || gemini.isZestConfigured();
}

// Which backend answers, for logs and alert emails
function providerName() {
  return ollama.isZestConfigured() ? 'ollama' : anthropic.isZestConfigured() ? 'anthropic' : gemini.isZestConfigured() ? 'gemini' : 'none';
}

function askZest(...args) {
  return pickProvider().askZest(...args);
}

module.exports = { askZest, isZestConfigured, providerName };
