// Real, at-request-time code scanning — greps the actual current server/
// source tree rather than reporting a hand-typed claim. This means it can
// never drift the way the old hardcoded HARDENING_CHECKLIST could: if a
// pattern's underlying code is deleted, the scan correctly stops finding it
// on the very next request.
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
// ("eval", "passportNumber", "skyload", etc.) that the scans below look
// for — without excluding itself, the scanner flags its own pattern
// definitions as if they were real usages. Excluded from every scan.
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

// ── Feature file usage — which files actually reference each security feature ──

const FEATURE_PATTERNS = [
  { key: 'rate_limit', label: 'Rate limiting (express-rate-limit)', pattern: /rateLimit\(|authLimiter|generalLimiter/ },
  { key: 'helmet', label: 'Helmet security headers', pattern: /helmet\(/ },
  { key: 'nosql_sanitize', label: 'NoSQL sanitization (express-mongo-sanitize)', pattern: /mongoSanitize/ },
  { key: 'oauth_csrf', label: 'OAuth CSRF state parameter', pattern: /github_oauth_state|oauth_state/ },
  { key: 'account_lockout', label: 'Account lockout (lockedUntil)', pattern: /lockedUntil/ },
  { key: 'password_reset_invalidation', label: 'Password reset session invalidation', pattern: /resetPasswordToken/ },
  { key: 'password_strength', label: 'Password strength validation', pattern: /validatePasswordStrength/ },
  { key: 'httponly_cookie', label: 'httpOnly refresh-token cookie', pattern: /httpOnly:\s*true/ },
  { key: 'waf', label: 'WAF signature filter', pattern: /wafQueryCheck|wafBodyCheck|wafRules/ },
  { key: 'skyload', label: 'Skyload (bot detection / throttle / reputation)', pattern: /skyload/i },
  { key: 'pii_logging', label: 'PII access logging', pattern: /logPiiAccess/ },
  { key: 'malware_scan', label: 'Malware scanning (ClamAV)', pattern: /scanUploadedFile|clamd/i },
  { key: 'analyst_audit', label: 'Analyst action audit trail', pattern: /logAnalystAction/ },
  { key: 'ip_block', label: 'IP blocking', pattern: /ipBlockMiddleware|BlockedIp/ },
  { key: 'critical_alert', label: 'Critical incident email alerts', pattern: /sendCriticalIncidentAlert|criticalAlert/ },
  { key: 'ip_intel', label: 'IP geolocation/threat context', pattern: /getIpIntel|ipIntel/ },
];

function scanFeatureFileUsage() {
  const files = walkJsFiles(SERVER_ROOT);
  return FEATURE_PATTERNS.map(({ key, label, pattern }) => {
    const matchingFiles = [];
    let totalOccurrences = 0;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        matchingFiles.push({ file: relative(file), occurrences: matches.length });
        totalOccurrences += matches.length;
      }
    }
    return { key, label, fileCount: matchingFiles.length, totalOccurrences, files: matchingFiles };
  });
}

// ── PII field usage — which files reference known sensitive personal-data fields ──

// Matches server/lib/logPiiAccess.js's SENSITIVE_FIELDS list — kept in sync
// deliberately, since that list IS the app's definition of "sensitive."
const PII_FIELDS = [
  'passportNumber', 'passport', 'dateOfBirth', 'address', 'documents',
  'fundingSource', 'sponsorName', 'phone', 'gpa', 'nationality',
];

function scanPiiFileUsage() {
  const files = walkJsFiles(SERVER_ROOT, true); // exclude test/ — fixtures aren't real PII handling
  const results = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const fieldsFound = PII_FIELDS.filter((f) => new RegExp(`\\b${f}\\b`).test(content));
    if (fieldsFound.length > 0) {
      results.push({ file: relative(file), fields: fieldsFound });
    }
  }
  return results.sort((a, b) => b.fields.length - a.fields.length);
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
    featureFileUsage: scanFeatureFileUsage(),
    piiFileUsage: scanPiiFileUsage(),
    codeFlags: scanCodeFlags(),
    scannedAt: new Date().toISOString(),
  };
  cacheAt = Date.now();
  return { ...cache, cached: false };
}

module.exports = { getCodeAnalysis };
