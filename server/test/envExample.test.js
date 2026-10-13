// server/.env.example is where a new deployment learns what it can set, so every setting the server reads is listed there.
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..');
// Arguments for one-off commands, given on the command line when they are run, not deployment settings
const COMMAND_ARGUMENTS = new Set(['ADMIN_EMAIL', 'ADMIN_NAME', 'ADMIN_PASSWORD']); // scripts/createAdmin.js

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return ['node_modules', 'test', 'uploads'].includes(e.name) ? [] : sources(path.join(dir, e.name));
    return e.name.endsWith('.js') ? [path.join(dir, e.name)] : [];
  });
}

describe('server/.env.example', () => {
  it('documents every environment variable the server reads', () => {
    const example = fs.readFileSync(path.join(SERVER, '.env.example'), 'utf8');
    const read = new Set();
    for (const file of sources(SERVER)) {
      for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(name);
    }
    const missing = [...read].filter((name) => !COMMAND_ARGUMENTS.has(name) && !new RegExp(`\\b${name}\\b`).test(example));
    expect(missing).toEqual([]);
  });

  it('includes the Zest Gemini fallback and the demo-seed override', () => {
    const example = fs.readFileSync(path.join(SERVER, '.env.example'), 'utf8');
    for (const name of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_FALLBACK_MODEL', 'ALLOW_DEMO_SEED']) {
      expect(example).toMatch(new RegExp(`^# ${name}=`, 'm'));
    }
  });
});
