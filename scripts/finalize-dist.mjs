// Runs automatically after `npm run build` (npm "postbuild" hook). Two jobs:
//
//  1. Fill the API address into dist/_headers. The Content-Security-Policy has to name the one origin the app may talk to
//     (connect-src / frame-src), and that is only known at build time from VITE_API_URL. Same-origin deployments (the API
//     behind the same host) leave VITE_API_URL unset and get 'self' only.
//  2. Refuse to finish if the build is not safe to publish: development tooling, source maps, inline scripts, third-party
//     font hosts, secrets-looking files, or a weakened header policy. A failing check fails the build, so the deploy
//     never goes out.
//
// Usage: node scripts/finalize-dist.mjs [distDir]
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';
import { parse } from 'acorn';

const dist = path.resolve(process.argv[2] || 'dist');
const problems = [];
const fail = (msg) => problems.push(msg);

const listFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? [p, ...listFiles(p)] : [p];
  });
const rel = (p) => path.relative(dist, p).replace(/\\/g, '/');

// Real calls to eval() / Function() / new Function(), found by parsing the code (not by searching the text: the bundle contains
// UI sentences that merely mention eval(), and those are harmless). Returns null if the file could not be parsed.
function dynamicCodeCalls(code) {
  let ast;
  try { ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); } catch { return null; }
  const hits = [];
  const stack = [ast];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) { for (const c of n) stack.push(c); continue; }
    if ((n.type === 'CallExpression' || n.type === 'NewExpression') && n.callee?.type === 'Identifier' && (n.callee.name === 'eval' || n.callee.name === 'Function')) {
      // Allowed: the global-object fallback `Function("return this")()` that bundled libraries (lodash, core-js, recharts, jsPDF)
      // keep as the very last resort. It is only reached where `self`, `window` and `globalThis` all do not exist, which is never
      // the case in a browser, so it never runs and never needs 'unsafe-eval'. Every other eval()/Function() call is reported.
      const a = n.arguments;
      const globalLookup = n.callee.name === 'Function' && a.length === 1 && a[0].type === 'Literal' && /^return this;?$/.test(String(a[0].value));
      if (!globalLookup) hits.push(n.callee.name);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (v && typeof v === 'object' && k !== 'loc') stack.push(v);
    }
  }
  return hits;
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`finalize-dist: ${dist}/index.html not found. Run the build first.`);
  process.exit(1);
}

// ── 1. API origin → headers ──────────────────────────────────────────────────────────────
const env = loadEnv('production', process.cwd(), 'VITE_');
const apiUrl = (process.env.VITE_API_URL || env.VITE_API_URL || '').trim();
let connect = '';
let frame = '';
if (apiUrl) {
  let u;
  try { u = new URL(apiUrl); } catch { fail(`VITE_API_URL is not a valid URL: ${apiUrl}`); }
  if (u) {
    const local = ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol !== 'https:' && !local) fail(`VITE_API_URL must be https:// in production (got ${u.protocol}//${u.host})`);
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    connect = `${u.origin} ${ws}//${u.host}`;
    frame = u.origin;
  }
}

const headersPath = path.join(dist, '_headers');
let headers = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
headers = headers.replace(/ ?__API_CONNECT__/g, connect ? ` ${connect}` : '').replace(/ ?__API_FRAME__/g, frame ? ` ${frame}` : '');
if (headers) fs.writeFileSync(headersPath, headers);

// ── 2. Safety checks ─────────────────────────────────────────────────────────────────────
const files = listFiles(dist);
const names = files.filter((f) => fs.statSync(f).isFile());

// Nothing that is not a built asset may ship
for (const f of files) {
  const r = rel(f);
  const base = path.basename(f);
  if (base.startsWith('.')) fail(`hidden file in the build: ${r}`);
  if (/\.map$/i.test(base)) fail(`source map in the build: ${r}`);
  if (/^(package(-lock)?\.json|vite\.config\.|tsconfig|\.env)/i.test(base)) fail(`config file in the build: ${r}`);
  if (/^(src|node_modules|server|\.git)$/.test(base) && fs.statSync(f).isDirectory()) fail(`source directory in the build: ${r}`);
  if (/\.(pem|key|p12|pfx)$/i.test(base)) fail(`key material in the build: ${r}`);
}

const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (/\/src\/|@vite|@react-refresh/.test(index)) fail('index.html points at development files (/src, @vite, @react-refresh)');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(index)) fail('index.html contains an inline <script> (the CSP forbids it)');
if (/fonts\.(googleapis|gstatic)\.com/.test(index)) fail('index.html loads Google Fonts (fonts are self-hosted)');
if (/<style[\s>]|\sstyle=/i.test(index)) fail('index.html has inline styles (the CSP forbids them)');
if (/\bhttp:\/\/(?!localhost|127\.0\.0\.1|www\.w3\.org)/.test(index)) fail('index.html references an http:// (non-TLS) resource');

for (const f of names.filter((n) => /\.(js|mjs|css)$/.test(n))) {
  const text = fs.readFileSync(f, 'utf8');
  const r = rel(f);
  if (/sourceMappingURL/.test(text)) fail(`${r} references a source map`);
  if (/@vite\/client|@react-refresh|react-refresh\/runtime/.test(text)) fail(`${r} contains Vite / React Fast Refresh development code`);
  if (/\.css$/.test(f) && /fonts\.(googleapis|gstatic)\.com/.test(text)) fail(`${r} loads fonts from Google`);
  if (/\.(js|mjs)$/.test(f)) {
    const calls = dynamicCodeCalls(text);
    if (calls === null) fail(`${r} could not be parsed, so it could not be checked for eval()/new Function()`);
    else if (calls.length) fail(`${r} calls ${[...new Set(calls)].join('/')}(), which the CSP does not allow`);
  }
}

// The header policy must stay strict
if (!headers) {
  fail('dist/_headers is missing (copy of public/_headers): the site would ship without security headers');
} else {
  const need = ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'];
  for (const h of need) if (!new RegExp(`^\\s+${h}:`, 'mi').test(headers)) fail(`dist/_headers is missing ${h}`);
  const csp = (headers.match(/^\s+Content-Security-Policy:\s*(.+)$/mi) || [])[1] || '';
  const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
  if (/unsafe-eval/.test(csp)) fail("CSP allows 'unsafe-eval'");
  if (/unsafe-inline/.test(scriptSrc)) fail("CSP script-src allows 'unsafe-inline'");
  const styleSrc = (csp.match(/style-src([^;]*)/) || [])[1] || '';
  if (/unsafe-inline/.test(styleSrc)) fail("CSP style-src allows 'unsafe-inline'");
  if (!/frame-ancestors\s+'none'/.test(csp)) fail("CSP is missing frame-ancestors 'none'");
  if (!/object-src\s+'none'/.test(csp)) fail("CSP is missing object-src 'none'");
  if (/__API_/.test(headers)) fail('dist/_headers still has an unfilled __API_ placeholder');
}

if (problems.length) {
  console.error('\nfinalize-dist: the build is NOT safe to publish:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
  process.exit(1);
}
console.log(`finalize-dist: ok — ${names.length} files, no dev tooling, no source maps, no inline scripts. API origin in CSP: ${frame || "'self' only"}.`);
