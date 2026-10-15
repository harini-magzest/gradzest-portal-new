// Covers the Oct 2026 brevity hardening: a reply that hits the token cap mid-sentence is trimmed
// to the last complete sentence instead of showing a dangling half-thought, for both backends.
const {
  askZest: askClaude, setAnthropicClientForTests, trimIncompleteAnswer,
} = require('../lib/anthropicClient');
const { askZest: askGemini, setGeminiClientForTests } = require('../lib/geminiClient');

describe('trimIncompleteAnswer', () => {
  it('cuts a truncated reply back to the last full sentence', () => {
    expect(trimIncompleteAnswer('UK visas take three weeks. Apply early, usually 5 working days or next'))
      .toBe('UK visas take three weeks.');
  });

  it('leaves a reply with no sentence boundary unchanged rather than blanking it', () => {
    expect(trimIncompleteAnswer('mid-word trunc')).toBe('mid-word trunc');
  });

  it('leaves a short, already-complete reply unchanged', () => {
    expect(trimIncompleteAnswer('Short and done.')).toBe('Short and done.');
  });

  it('does not trim down to almost nothing', () => {
    expect(trimIncompleteAnswer('Ok. this trails off with no more punctuation anywhere')).toBe(
      'Ok. this trails off with no more punctuation anywhere',
    );
  });
});

describe('Claude backend trims a max_tokens cutoff', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked'; });
  afterEach(() => {
    setAnthropicClientForTests(null);
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('trims when stop_reason is max_tokens', async () => {
    setAnthropicClientForTests({
      messages: {
        create: async () => ({
          stop_reason: 'max_tokens',
          content: [{ type: 'text', text: 'Processing takes three weeks. Priority service costs extra, usually 5 working days or next' }],
        }),
      },
    });
    const { text } = await askClaude('q', [], [], 'admin', '', { id: 'a', role: 'admin' });
    expect(text).toBe('Processing takes three weeks.');
  });

  it('does not trim a normal, complete reply', async () => {
    setAnthropicClientForTests({
      messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Short answer here.' }] }) },
    });
    const { text } = await askClaude('q', [], [], 'admin', '', { id: 'a', role: 'admin' });
    expect(text).toBe('Short answer here.');
  });
});

describe('Gemini backend trims a MAX_TOKENS cutoff', () => {
  const originalKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked'; });
  afterEach(() => {
    setGeminiClientForTests(null);
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
  });

  it('trims when finishReason is MAX_TOKENS (non-streaming path)', async () => {
    setGeminiClientForTests({
      models: {
        generateContent: async () => ({
          text: 'Processing takes three weeks. Priority service costs extra, usually 5 working days or next',
          functionCalls: undefined,
          candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'MAX_TOKENS' }],
        }),
      },
    });
    const { text } = await askGemini('q', [], [], 'admin', '', { id: 'a', role: 'admin' });
    expect(text).toBe('Processing takes three weeks.');
  });

  it('trims when finishReason is MAX_TOKENS (streaming path)', async () => {
    setGeminiClientForTests({
      models: {
        generateContentStream: async () => (async function* () {
          yield { candidates: [{ content: { role: 'model', parts: [{ text: 'Processing takes three weeks. ' }] } }] };
          yield {
            candidates: [{
              content: { role: 'model', parts: [{ text: 'Priority costs extra, usually 5 working days or next' }] },
              finishReason: 'MAX_TOKENS',
            }],
          };
        })(),
      },
    });
    const pieces = [];
    const { text } = await askGemini('q', [], [], 'admin', '', { id: 'a', role: 'admin' }, (d) => pieces.push(d));
    // Streamed pieces are exactly what the model produced, including the incomplete tail —
    // only the final stored/returned answer is trimmed, since the stream already reached the user.
    expect(pieces.join('')).toContain('usually 5 working days or next');
    expect(text).toBe('Processing takes three weeks.');
  });
});
