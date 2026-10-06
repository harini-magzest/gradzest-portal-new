const { buildSystemPrompt } = require('../lib/anthropicClient');

describe('Zest answers in the language the person writes in', () => {
  it.each(['student', 'counselor', 'admin'])('tells the model so for %s', (role) => {
    const p = buildSystemPrompt(role);
    expect(p).toMatch(/Reply in the language the person wrote in/);
    expect(p).toMatch(/Hindi/);
    // Facts must survive translation unchanged
    expect(p).toMatch(/keep numbers, dates, fees/);
  });
});
