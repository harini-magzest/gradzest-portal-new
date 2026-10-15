// Turns the security headers in dist/_headers (the single source of truth, used as-is by Cloudflare Pages / Netlify) into an
// nginx include file, so a self-hosted nginx sends exactly the same headers instead of a hand-copied, drifting duplicate.
//
// Usage: node scripts/headers-to-nginx.mjs [distDir] [outFile]     (outFile defaults to stdout)
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const out = process.argv[3];
const text = fs.readFileSync(path.join(dist, '_headers'), 'utf8');

// The global block is the one for "/*"; its indented lines are "Name: value".
const block = text.split(/\n(?=\S)/).find((b) => b.startsWith('/*'));
if (!block) { console.error('headers-to-nginx: no "/*" block in _headers'); process.exit(1); }

const lines = block.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
const conf = lines.map((l) => {
  const i = l.indexOf(':');
  const name = l.slice(0, i).trim();
  const value = l.slice(i + 1).trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `add_header ${name} "${value}" always;`;
}).join('\n') + '\n';

if (!/Content-Security-Policy/.test(conf)) { console.error('headers-to-nginx: no Content-Security-Policy in _headers'); process.exit(1); }
if (out) fs.writeFileSync(out, conf); else process.stdout.write(conf);
