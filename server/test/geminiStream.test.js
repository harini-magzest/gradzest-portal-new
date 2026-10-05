const User = require('../models/User');
const Task = require('../models/Task');
const { askZest, setGeminiClientForTests } = require('../lib/geminiClient');

const originalGeminiKey = process.env.GEMINI_API_KEY;
beforeEach(() => { process.env.GEMINI_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked'; });
afterEach(() => {
  setGeminiClientForTests(null);
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalGeminiKey;
});

// Each scripted turn is a list of chunks; every chunk carries parts the way the SDK's stream does.
function fakeStreamingGemini(turns) {
  const calls = [];
  let i = 0;
  return {
    calls,
    models: {
      generateContent: async () => { throw new Error('non-streaming path not expected here'); },
      generateContentStream: async (params) => {
        calls.push(params);
        const chunks = turns[Math.min(i, turns.length - 1)];
        i++;
        return (async function* () {
          for (const parts of chunks) yield { candidates: [{ content: { role: 'model', parts } }] };
        })();
      },
    },
  };
}

describe('geminiClient streaming', () => {
  it('passes each text part to onText as it arrives and returns the full text', async () => {
    setGeminiClientForTests(fakeStreamingGemini([[[{ text: 'Processing takes ' }], [{ text: 'three weeks.' }]]]));
    const pieces = [];

    const { text, toolsUsed } = await askZest('How long?', [], [], 'admin', '', { id: 'a', role: 'admin' }, (d) => pieces.push(d));

    expect(pieces).toEqual(['Processing takes ', 'three weeks.']);
    expect(text).toBe('Processing takes three weeks.');
    expect(toolsUsed).toEqual([]);
  });

  it('still runs a tool call that arrives mid-stream, then streams the final answer', async () => {
    const counselor = new User({ name: 'Stream Counselor', email: `sc-${Date.now()}@example.com`, password: 'x', role: 'counselor', status: 'active' });
    await counselor.save();
    await Task.create({ title: 'Streamed task', assignedTo: counselor.id, assignedBy: counselor.id, status: 'pending', dueDate: '2026-10-05' });

    const client = fakeStreamingGemini([
      [[{ functionCall: { name: 'list_my_open_tasks', args: {} } }]],
      [[{ text: 'You have one task: ' }], [{ text: 'Streamed task.' }]],
    ]);
    setGeminiClientForTests(client);
    const pieces = [];

    const { text, toolsUsed } = await askZest('My tasks?', [], [], 'counselor', '', { id: counselor.id, role: 'counselor' }, (d) => pieces.push(d));

    expect(toolsUsed).toEqual(['list_my_open_tasks']);
    expect(text).toBe('You have one task: Streamed task.');
    expect(pieces.join('')).toBe('You have one task: Streamed task.');
    expect(client.calls).toHaveLength(2);
  });
});
