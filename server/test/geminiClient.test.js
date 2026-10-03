// Tests geminiClient.js's wiring against a mocked @google/genai client (no real network call,
// no real GEMINI_API_KEY needed) — same spirit as zestMockIntegration.test.js for the Anthropic
// path. Proves the request/response shapes this module assumes are the ones actually used, and
// that the tool-use loop + real executeTool() scoping work the same as the Anthropic backend.

const User = require('../models/User');
const Task = require('../models/Task');
const { askZest, setGeminiClientForTests } = require('../lib/geminiClient');
const { isZestConfigured } = require('../lib/zestModel');

const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY; // force zestModel to fall back to Gemini
  process.env.GEMINI_API_KEY = 'fake-key-never-sent-anywhere-client-is-mocked';
});
afterEach(() => {
  setGeminiClientForTests(null);
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
});

// Replays `script` in order on successive generateContent() calls and records every call's
// params for assertions — mirrors the fakeClient() helper in zestMockIntegration.test.js.
function fakeGeminiClient(script) {
  const calls = [];
  let i = 0;
  return {
    calls,
    models: {
      generateContent: async (params) => {
        calls.push(params);
        const response = script[Math.min(i, script.length - 1)];
        i++;
        return response;
      },
    },
  };
}

const textResponse = (text) => ({
  text,
  functionCalls: undefined,
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
});
const functionCallResponse = (name, args = {}) => ({
  text: undefined,
  functionCalls: [{ id: `call_${Math.random().toString(36).slice(2)}`, name, args }],
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }],
});

describe('zestModel provider selection', () => {
  it('falls back to Gemini when ANTHROPIC_API_KEY is unset and GEMINI_API_KEY is set', () => {
    expect(isZestConfigured()).toBe(true);
  });

  it('reports unconfigured when neither key is set', () => {
    delete process.env.GEMINI_API_KEY;
    expect(isZestConfigured()).toBe(false);
  });
});

describe('geminiClient.askZest with a mocked @google/genai client', () => {
  it('answers from knowledge-base chunks with no tool call', async () => {
    setGeminiClientForTests(fakeGeminiClient([
      textResponse('Per the UK Visa Guide, processing takes three to four weeks.'),
    ]));

    const { text, toolsUsed } = await askZest(
      'How long does a UK visa take?',
      [{ title: 'UK Visa Guide', text: 'Processing takes three to four weeks after biometrics.' }],
      [], 'admin', '', { id: 'admin1', role: 'admin' },
    );

    expect(text).toContain('three to four weeks');
    expect(toolsUsed).toEqual([]);
  });

  it('never passes a tools config for a student (students get no tools)', async () => {
    const client = fakeGeminiClient([textResponse('You can see your own status under Applications.')]);
    setGeminiClientForTests(client);

    await askZest('What are my open tasks?', [], [], 'student', '', { id: 'student1', role: 'student' });

    expect(client.calls[0].config.tools).toBeUndefined();
  });

  it('runs the real tool-use loop against a real executeTool call, scoped to the caller', async () => {
    const counselorA = new User({ name: 'Counselor A', email: `ca-${Date.now()}@example.com`, password: 'x', role: 'counselor', status: 'active' });
    await counselorA.save();
    const counselorB = new User({ name: 'Counselor B', email: `cb-${Date.now()}@example.com`, password: 'x', role: 'counselor', status: 'active' });
    await counselorB.save();
    await Task.create({ title: "A's task", assignedTo: counselorA.id, assignedBy: counselorA.id, status: 'pending', dueDate: '2026-10-05' });
    await Task.create({ title: "B's task", assignedTo: counselorB.id, assignedBy: counselorB.id, status: 'pending', dueDate: '2026-10-01' });

    const client = fakeGeminiClient([
      functionCallResponse('list_my_open_tasks'),
      textResponse('You have one open task: "A\'s task", due 2026-10-05.'),
    ]);
    setGeminiClientForTests(client);

    const { text, toolsUsed } = await askZest(
      'What are my open tasks?', [], [], 'counselor', '', { id: counselorA.id, role: 'counselor' },
    );

    expect(text).toContain("A's task");
    expect(text).not.toContain("B's task");
    expect(toolsUsed).toEqual(['list_my_open_tasks']);
    expect(client.calls).toHaveLength(2);

    // Second call must carry a functionResponse part built from the real tool result.
    const secondCallContents = client.calls[1].contents;
    const responseContent = secondCallContents.find(c => c.parts?.some(p => p.functionResponse));
    expect(responseContent).toBeTruthy();
    const payload = responseContent.parts[0].functionResponse.response;
    expect(payload.tasks.map(t => t.title)).toEqual(["A's task"]);
  });

  it('caps the tool-use loop instead of looping forever', async () => {
    const client = fakeGeminiClient([functionCallResponse('list_open_lead_alerts')]);
    setGeminiClientForTests(client);

    const { text } = await askZest('alerts?', [], [], 'admin', '', { id: 'admin1', role: 'admin' });

    expect(client.calls.length).toBeLessThanOrEqual(5); // MAX_TOOL_ROUNDS (4) + the initial call
    expect(text).toBe('');
  });
});
