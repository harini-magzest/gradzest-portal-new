// A real, self-hosted WAF-style layer: pattern-matches incoming requests
// against known attack signatures (XSS, SQL/NoSQL injection, path traversal,
// command injection, XXE, SSRF probing, CRLF injection) and blocks matches —
// the same concept a CDN-edge WAF uses, running in-process instead of at the
// network edge. This does NOT replace a real edge WAF for volumetric/DDoS
// protection — a single Node process can't provide that, it needs
// network-edge infrastructure. It also isn't a full ruleset like OWASP's
// Core Rule Set (thousands of rules, years of tuning) — this is a real but
// deliberately smaller hand-picked set, chosen for the attack categories
// most relevant to this app and to keep false-positive risk low against
// legitimate user content (chat messages, notes, form text).

const { logSecurityEvent } = require('./logSecurityEvent');
const { bump: bumpSkyloadRisk } = require('../lib/skyload/riskRegistry');

const SIGNATURES = [
  // XSS
  { category: 'xss', severity: 'high', pattern: /<script[\s>]/i },
  { category: 'xss', severity: 'high', pattern: /javascript:/i },
  { category: 'xss', severity: 'high', pattern: /vbscript:/i },
  { category: 'xss', severity: 'medium', pattern: /on(error|load|click|mouseover|focus|mouseenter|animationstart|pointerdown)\s*=/i },
  { category: 'xss', severity: 'medium', pattern: /<iframe[\s>]/i },
  { category: 'xss', severity: 'medium', pattern: /<svg[^>]*onload/i },
  { category: 'xss', severity: 'medium', pattern: /data:text\/html/i },
  { category: 'xss', severity: 'low', pattern: /expression\s*\(/i },

  // SQL injection (defense-in-depth; this app is MongoDB, but scanners/bots
  // frequently probe with SQLi payloads regardless of backend)
  { category: 'sql_injection', severity: 'high', pattern: /union\s+select/i },
  { category: 'sql_injection', severity: 'high', pattern: /\bor\s+1\s*=\s*1\b/i },
  { category: 'sql_injection', severity: 'high', pattern: /;\s*drop\s+table/i },
  { category: 'sql_injection', severity: 'medium', pattern: /xp_cmdshell/i },
  { category: 'sql_injection', severity: 'medium', pattern: /information_schema/i },
  { category: 'sql_injection', severity: 'medium', pattern: /sleep\s*\(\s*\d+\s*\)/i },
  { category: 'sql_injection', severity: 'medium', pattern: /benchmark\s*\(/i },
  { category: 'sql_injection', severity: 'medium', pattern: /waitfor\s+delay/i },

  // NoSQL injection — defense-in-depth beyond express-mongo-sanitize, which
  // strips $-prefixed keys but not operators embedded in raw string values.
  { category: 'nosql_injection', severity: 'medium', pattern: /\$where\s*:/i },
  { category: 'nosql_injection', severity: 'low', pattern: /\$(ne|gt|lt|gte|lte)\s*:\s*(null|['"]?\s*['"]?)/i },

  // Path traversal
  { category: 'path_traversal', severity: 'high', pattern: /\.\.[/\\]{1,2}\.\.[/\\]/ },
  { category: 'path_traversal', severity: 'high', pattern: /\/etc\/passwd/i },
  { category: 'path_traversal', severity: 'medium', pattern: /win\.ini/i },
  { category: 'path_traversal', severity: 'medium', pattern: /\/proc\/self\/environ/i },
  { category: 'path_traversal', severity: 'medium', pattern: /\.\.%2f/i },

  // Command injection
  { category: 'command_injection', severity: 'critical', pattern: /;\s*(rm|cat|wget|curl|nc|bash)\s/i },
  { category: 'command_injection', severity: 'critical', pattern: /\$\([^)]+\)/ },
  { category: 'command_injection', severity: 'critical', pattern: /(\|\||&&)\s*(rm|cat|nc|wget|curl)\s/i },
  { category: 'command_injection', severity: 'critical', pattern: /\bnc\s+-e\s/i },

  // XXE
  { category: 'xxe', severity: 'high', pattern: /<!ENTITY/i },
  { category: 'xxe', severity: 'high', pattern: /<!DOCTYPE[^>]*SYSTEM/i },

  // SSRF probing (cloud metadata endpoints, local file scheme)
  { category: 'ssrf', severity: 'high', pattern: /169\.254\.169\.254/ },
  { category: 'ssrf', severity: 'medium', pattern: /file:\/\/\//i },

  // CRLF / HTTP header injection
  { category: 'crlf_injection', severity: 'medium', pattern: /%0d%0a/i },
];

function scanText(text) {
  for (const sig of SIGNATURES) {
    if (sig.pattern.test(text)) return sig;
  }
  return null;
}

function flattenValues(obj, depth = 0) {
  if (depth > 5 || obj == null) return [];
  if (typeof obj === 'string') return [obj];
  if (typeof obj !== 'object') return [];
  return Object.values(obj).flatMap((v) => flattenValues(v, depth + 1));
}

function makeWafMiddleware(getTexts) {
  return function wafCheck(req, res, next) {
    // The SOC dashboard is itself where analysts document attack payloads in
    // free text (incident notes, etc.) — exempt it so the WAF doesn't block
    // the tool meant for describing the very patterns it looks for. It's
    // already authenticated + admin-only, so it isn't the untrusted surface
    // this layer exists to protect.
    if (req.path.startsWith('/api/soc')) return next();
    try {
      for (const text of getTexts(req)) {
        if (!text) continue;
        const sig = scanText(text);
        if (sig) {
          logSecurityEvent('waf_block', {
            severity: sig.severity,
            ip: req.ip,
            userAgent: req.headers['user-agent'] || '',
            message: `Blocked ${sig.category} pattern on ${req.method} ${req.originalUrl}`,
            meta: { category: sig.category },
          }).catch(() => {});
          // Feed Skyload's reputation registry — this IP now gets stricter
          // connection/rate treatment on subsequent requests too, not just this one.
          bumpSkyloadRisk(req.ip, sig.severity === 'critical' ? 8 : 5);
          return res.status(403).json({ message: 'Request blocked by security filter.' });
        }
      }
      next();
    } catch (err) {
      // The WAF layer must never be the reason a legitimate request fails.
      console.error('[wafRules] Failed:', err.message);
      next();
    }
  };
}

// Checks the URL + query string — mountable before body parsing.
const wafQueryCheck = makeWafMiddleware((req) => [req.originalUrl, ...flattenValues(req.query)]);
// Checks the parsed request body — mount after express.json()/urlencoded().
const wafBodyCheck = makeWafMiddleware((req) => flattenValues(req.body));

module.exports = { wafQueryCheck, wafBodyCheck, SIGNATURE_COUNT: SIGNATURES.length };
