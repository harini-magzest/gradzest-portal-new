// Self-hosted backend for Zest: a local Ollama model, free and with no student data leaving the
// server. Chosen explicitly with ZEST_PROVIDER=ollama (see lib/zestModel.js). Implements the same
// askZest(...)/isZestConfigured() contract as anthropicClient.js and geminiClient.js, and reuses
// buildSystemPrompt so all three backends share one set of instructions. The HTTP side, including
// the context-window and failure handling, lives in lib/ollamaChat.js.

const { getToolsForRole, executeTool } = require('./zestTools');
const { buildSystemPrompt } = require('./anthropicClient');
const { askOllama } = require('./ollamaChat');

const MAX_TOOL_ROUNDS = 4;

function isZestConfigured() {
  return String(process.env.ZEST_PROVIDER || '').toLowerCase() === 'ollama';
}

/**
 * Same signature and return shape as anthropicClient.js's askZest — see that file for param docs.
 * The answer is generated in one piece, so a streaming caller receives it as a single delta.
 * @returns {Promise<{ text: string, toolsUsed: string[] }>}
 */
async function askZest(question, chunks, history = [], role = 'student', attachedDocText = '', user = null, onText = null) {
  if (!isZestConfigured()) throw new Error('Zest is not configured for Ollama (set ZEST_PROVIDER=ollama)');

  const context = chunks.length
    ? chunks.map((c, i) => `[Source ${i + 1}: ${c.title}]\n${c.text}`).join('\n\n---\n\n')
    : '(No matching knowledge-base reference material was found for this question.)';
  const attachedBlock = attachedDocText
    ? `\n\nAttached document (provided by the user for this question only):\n${attachedDocText}`
    : '';
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.text })),
    { role: 'user', content: `Knowledge-base reference material:\n\n${context}${attachedBlock}\n\nQuestion: ${question}` },
  ];

  const result = await askOllama(
    { system: buildSystemPrompt(role), messages, tools: getToolsForRole(role), maxTokens: 800, maxToolRounds: MAX_TOOL_ROUNDS },
    (name, input) => executeTool(name, input, user),
  );
  if (onText) onText(result.text);
  return result;
}

module.exports = { askZest, isZestConfigured };
