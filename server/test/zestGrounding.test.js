// Zest's prompt is hand-written text describing the real portal. These tests stop it drifting into fiction: a page,
// tool or tab it names must exist, and every tool it can call must be explained to it.

const fs = require('fs');
const path = require('path');
const { buildSystemPrompt } = require('../lib/zestPrompt');
const { getToolsForRole } = require('../lib/zestTools');

const ROLES = ['guest', 'student', 'counselor', 'admin'];

// Full route paths declared in src/App.tsx. Child routes are relative to the nearest enclosing route that has a path.
function appRoutes() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'App.tsx'), 'utf8');
  const routes = new Set();
  let parent = '';
  for (const line of src.split('\n')) {
    const m = /<Route\b[^>]*?\bpath="([^"]+)"/.exec(line);
    if (!m) continue;
    const p = m[1].replace(/\/\*$/, '');
    if (p.startsWith('/')) {
      routes.add(p);
      if (!/\/>\s*$/.test(line)) parent = p; // a route that opens children (not self-closing) becomes the parent
    } else if (p !== '*') {
      routes.add(`${parent}/${p}`);
    }
  }
  return routes;
}

describe('Zest prompt only describes pages and tools that exist', () => {
  it('every portal path the prompt mentions is a real route in App.tsx', () => {
    const routes = appRoutes();
    expect(routes.has('/student/chat')).toBe(true); // the parser itself works

    const mentioned = new Set();
    for (const role of ROLES) {
      const prompt = buildSystemPrompt(role, {});
      for (const m of prompt.matchAll(/(?<![\w.:])\/(?:student|counselor|admin|appteam|board|soc|universities|resources|search|login)(?:\/[a-z][a-z-]*)*/g)) {
        mentioned.add(m[0]);
      }
    }
    expect([...mentioned].length).toBeGreaterThan(10);
    const unknown = [...mentioned].filter(p => !routes.has(p));
    expect(unknown).toEqual([]);
  });

  it('every tool the prompt lists exists, and every tool a role can call is explained to that role', () => {
    const registry = new Set(ROLES.flatMap(r => getToolsForRole(r).map(t => t.name)));
    for (const role of ROLES) {
      const prompt = buildSystemPrompt(role, {});
      // "- tool_name:" / "- tool_name (counselors):" list items in the tool guides.
      const listed = [...prompt.matchAll(/^\s*- ([a-z]+(?:_[a-z]+)+)(?=[\s(:])/gm)].map(m => m[1]);
      expect(listed.filter(n => !registry.has(n))).toEqual([]);

      const offered = getToolsForRole(role).map(t => t.name);
      expect(offered.filter(n => !prompt.includes(n))).toEqual([]);
    }
  });

  it('never lets the model answer facts from its own general knowledge', () => {
    for (const role of ROLES) {
      const prompt = buildSystemPrompt(role, {});
      expect(prompt).toMatch(/ONLY from Gradzest's own data/);
      expect(prompt).not.toMatch(/you may answer from your own training knowledge/i);
      expect(prompt).not.toMatch(/Prefer it (to|over) general knowledge/i);
    }
  });
});
