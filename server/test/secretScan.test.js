const { findSecrets, addedLines } = require('../../scripts/secret-scan.mjs');

// Fake keys: the right shape, not real credentials.
const FAKE_GOOGLE = 'AIza' + 'A'.repeat(35);
const FAKE_AQ = 'AQ.' + 'b'.repeat(40);
const FAKE_ANTHROPIC = 'sk-ant-' + 'c'.repeat(30);

describe('pre-commit secret scan', () => {
  it('blocks a Google, Anthropic and AQ.-style key in added lines', () => {
    expect(findSecrets(`GEMINI_API_KEY=${FAKE_GOOGLE}`).map(h => h.name)).toContain('Google API key');
    expect(findSecrets(`key: ${FAKE_AQ}`).map(h => h.name)).toContain('Google API key (AQ. form)');
    expect(findSecrets(`ANTHROPIC=${FAKE_ANTHROPIC}`).map(h => h.name)).toContain('Anthropic API key');
  });

  it('blocks a private key block', () => {
    // Split so this file doesn't contain the literal header and trip the scanner itself.
    expect(findSecrets('-----BEGIN RSA ' + 'PRIVATE KEY-----').length).toBe(1);
  });

  it('passes ordinary code and empty placeholders', () => {
    expect(findSecrets('const key = process.env.GEMINI_API_KEY;')).toEqual([]);
    expect(findSecrets('GEMINI_API_KEY=')).toEqual([]);
  });

  it('only scans added lines of a diff, not removed ones or file headers', () => {
    const diff = `--- a/x\n+++ b/x\n-old AIza${'A'.repeat(35)}\n+const ok = 1;`;
    expect(findSecrets(addedLines(diff))).toEqual([]);
  });
});
