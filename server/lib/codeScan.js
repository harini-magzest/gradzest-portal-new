// Real, at-request-time code scanning — greps the actual current server/
// source tree rather than reporting a hand-typed claim. This means it can
// never drift from the code: if a pattern's underlying code is deleted, the
// scan correctly stops finding it on the very next request.
//
// Honest scope: FLAW_PATTERNS below is a small, hand-picked set of
// well-known anti-patterns — not a full static-analysis engine (that's a
// genuinely large undertaking, the same reason server/middleware/wafRules.js
// isn't a reimplementation of OWASP's Core Rule Set). It catches a few
// specific, well-understood mistakes; it is not a guarantee of "no flaws."

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..');
const EXCLUDED_DIRS = new Set(['node_modules', 'uploads', '.git']);
// This file's own pattern/field-name definitions contain the literal text
// ("eval", "password", etc.) that the scan below looks
// for — without excluding itself, the scanner flags its own pattern
// definitions as if they were real usages. Excluded from the scan.
const SELF_PATH = __filename;

function walkJsFiles(dir, excludeTestDir = false) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (excludeTestDir && entry.name === 'test') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkJsFiles(full, excludeTestDir));
    } else if (entry.name.endsWith('.js') && full !== SELF_PATH) {
      results.push(full);
    }
  }
  return results;
}

function relative(filePath) {
  return path.relative(path.join(SERVER_ROOT, '..'), filePath).replace(/\\/g, '/');
}

// ── Code flaw patterns — small, honest, not exhaustive ──

const FLAW_PATTERNS = [
  { key: 'eval_usage', label: 'Use of eval()', severity: 'critical', pattern: /\beval\s*\(/ },
  { key: 'hardcoded_secret', label: 'Possible hardcoded secret/password literal', severity: 'high', pattern: /(password|secret|apikey|api_key)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { key: 'console_log_body', label: 'console.log of req.body (may leak sensitive fields to logs)', severity: 'medium', pattern: /console\.log\([^)]*req\.body/ },
  { key: 'insecure_random_token', label: 'Math.random() near "token" (should be crypto.randomBytes)', severity: 'medium', pattern: /Math\.random\(\)[^;]{0,40}token|token[^;]{0,40}Math\.random\(\)/i },
];

function scanCodeFlags() {
  const files = walkJsFiles(SERVER_ROOT, true); // exclude test/ — test fixtures aren't production flaws
  const findings = [];
  for (const { key, label, severity, pattern } of FLAW_PATTERNS) {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          findings.push({ key, label, severity, file: relative(file), line: i + 1, snippet: line.trim().slice(0, 120) });
        }
      });
    }
  }
  return findings;
}

let cache = null;
let cacheAt = 0;
const CACHE_MS = 60 * 1000; // code changes fast during active development — short cache

function getCodeAnalysis(forceRefresh = false) {
  if (!forceRefresh && cache && Date.now() - cacheAt < CACHE_MS) return { ...cache, cached: true };
  cache = {
    codeFlags: scanCodeFlags(),
    scannedAt: new Date().toISOString(),
  };
  cacheAt = Date.now();
  return { ...cache, cached: false };
}

module.exports = { getCodeAnalysis };
