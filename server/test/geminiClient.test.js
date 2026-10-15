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

  it("offers a student the catalogue search and their own progress, never a tool that can look up anyone else", async () => {
    const client = fakeGeminiClient([textResponse('You can see your own status under Applications.')]);
    setGeminiClientForTests(client);

    await askZest('What are my open tasks?', [], [], 'student', '', { id: 'student1', role: 'student' });

    const offered = client.calls[0].config.tools.flatMap(t => t.functionDeclarations.map(d => d.name));
    expect(offered).toEqual(['search_universities', 'my_status', 'my_upcoming']);
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

describe('geminiClient thinking setting', () => {
  const prev = { model: process.env.GEMINI_MODEL, thinking: process.env.ZEST_THINKING };
  afterEach(() => {
    if (prev.model === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = prev.model;
    if (prev.thinking === undefined) delete process.env.ZEST_THINKING; else process.env.ZEST_THINKING = prev.thinking;
  });
  const ask = () => askZest('hello', [], [], 'student', '', { id: 's1', role: 'student' });

  it('asks a 3.x model for the lowest level it accepts, and a 2.x model for a zero budget', async () => {
    delete process.env.ZEST_THINKING;
    let client = fakeGeminiClient([textResponse('hi')]);
    setGeminiClientForTests(client);
    process.env.GEMINI_MODEL = 'think-level-model';
    await ask();
    expect(client.calls[0].config.thinkingConfig).toEqual({ thinkingLevel: 'low' });

    client = fakeGeminiClient([textResponse('hi')]);
    setGeminiClientForTests(client);
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    await ask();
    expect(client.calls[0].config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('ZEST_THINKING overrides the choice, or sends nothing at all with "default"', async () => {
    process.env.GEMINI_MODEL = 'think-env-model';
    let client = fakeGeminiClient([textResponse('hi')]);
    setGeminiClientForTests(client);
    process.env.ZEST_THINKING = '512';
    await ask();
    expect(client.calls[0].config.thinkingConfig).toEqual({ thinkingBudget: 512 });

    client = fakeGeminiClient([textResponse('hi')]);
    setGeminiClientForTests(client);
    process.env.ZEST_THINKING = 'default';
    await ask();
    expect(client.calls[0].config).not.toHaveProperty('thinkingConfig');
  });

  it('repeats a turn without the setting when the model refuses it, and remembers that model', async () => {
    delete process.env.ZEST_THINKING;
    process.env.GEMINI_MODEL = 'picky-model';
    const seen = [];
    setGeminiClientForTests({ models: { generateContent: async (p) => {
      seen.push(p.config.thinkingConfig);
      if (p.config.thinkingConfig) throw Object.assign(new Error('Request contains an invalid argument.'), { status: 400 });
      return textResponse('Answered anyway.');
    } } });

    expect((await ask()).text).toBe('Answered anyway.');
    expect(seen).toEqual([{ thinkingLevel: 'low' }, undefined]);

    seen.length = 0;
    expect((await ask()).text).toBe('Answered anyway.');
    expect(seen).toEqual([undefined]); // no failed call the second time
  });

  it('does not mistake a rejected API key for a thinking-setting problem', async () => {
    delete process.env.ZEST_THINKING;
    process.env.GEMINI_MODEL = 'keyed-model';
    let calls = 0;
    setGeminiClientForTests({ models: { generateContent: async () => { calls++; throw Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 }); } } });
    await expect(ask()).rejects.toThrow(/API key/);
    expect(calls).toBe(1);
  });
});
