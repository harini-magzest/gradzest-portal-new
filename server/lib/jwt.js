// One place that signs and verifies the app's access tokens, so every check uses the same rules:
//   * the algorithm is pinned to HS256 on both sides. jsonwebtoken already refuses `alg: none` for a secret key, but
//     pinning also refuses any other algorithm a forged header might name, now and after library upgrades.
//   * the secret must be strong. A short or placeholder JWT_SECRET (e.g. the .env.example text, or "secret") lets
//     anyone who guesses it mint an admin token, so production refuses to start with one.
//   * every token carries iatMs, its issue time in milliseconds. `iat` is in whole seconds, which cannot tell a token
//     issued just before "sign out everywhere" from one issued just after it (lib/accountState.js tokenRevoked).
const jwt = require('jsonwebtoken');

const ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;

const signAccessToken = (payload, options = {}) =>
  jwt.sign({ ...payload, iatMs: Date.now() }, process.env.JWT_SECRET, { ...options, algorithm: ALGORITHM });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });

/** Why a JWT secret is unsafe to use, or null when it is fine. */
function jwtSecretProblem(secret) {
  if (!secret) return 'JWT_SECRET is not set';
  if (secret.length < MIN_SECRET_LENGTH) return `JWT_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`;
  if (/[<>]|generate|change.?me|your[_-]?secret|^secret$|^(.)\1+$/i.test(secret)) return 'JWT_SECRET looks like a placeholder';
  return null;
}

module.exports = { signAccessToken, verifyAccessToken, jwtSecretProblem, ALGORITHM };
