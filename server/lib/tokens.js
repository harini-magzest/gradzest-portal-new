// One place that signs and verifies JWTs, so every check pins the algorithm (no `alg: none` / algorithm confusion)
// and the two token kinds can't stand in for each other:
//   access token  15 min, sent as `Authorization: Bearer`, accepted by the API
//   file token    15 min, sent as `?token=` on /uploads links (an <img src> can't send headers). It ends up in URLs,
//                 so it is scoped to file downloads only: the API rejects it, and /uploads rejects access tokens in URLs.
//                 The app now opens files with signed links (lib/fileLinks.js); /uploads accepts a file token only while
//                 ALLOW_LEGACY_UPLOAD_TOKENS allows it.
// Every token carries iatMs, its issue time in milliseconds: `iat` is in whole seconds, which cannot tell a token issued
// just before "sign out everywhere" from one issued just after it (lib/accountState.js tokenRevoked).
const jwt = require('jsonwebtoken');

const ALG = 'HS256';
const FILE_PURPOSE = 'file';
const MIN_SECRET_LENGTH = 32;

const claims = (user) => ({ id: user._id, role: user.role, isAppTeam: !!user.isAppTeam, iatMs: Date.now() });

function issueAccessToken(user) {
  return jwt.sign(claims(user), process.env.JWT_SECRET, { algorithm: ALG, expiresIn: '15m' });
}

function issueFileToken(user) {
  return jwt.sign({ ...claims(user), purpose: FILE_PURPOSE }, process.env.JWT_SECRET, { algorithm: ALG, expiresIn: '15m' });
}

// Throws like jwt.verify (TokenExpiredError / JsonWebTokenError) so callers keep their existing error handling.
function verifyAccessToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALG] });
  if (payload.purpose) throw new jwt.JsonWebTokenError('token not valid for this use');
  return payload;
}

function verifyFileToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALG] });
  if (payload.purpose !== FILE_PURPOSE) throw new jwt.JsonWebTokenError('token not valid for this use');
  return payload;
}

/** Why a signing secret (the value of the environment variable `name`) is unsafe to use, or null when it is fine. A
 *  short or placeholder JWT_SECRET (e.g. the .env.example text, or "secret") lets anyone who guesses it mint an admin
 *  token, so production refuses to start with one (app.js). */
function secretProblem(secret, name) {
  if (!secret) return `${name} is not set`;
  if (secret.length < MIN_SECRET_LENGTH) return `${name} is shorter than ${MIN_SECRET_LENGTH} characters`;
  if (/[<>]|generate|change.?me|your[_-]?secret|^secret$|^(.)\1+$/i.test(secret)) return `${name} looks like a placeholder`;
  return null;
}
const jwtSecretProblem = (secret) => secretProblem(secret, 'JWT_SECRET');

module.exports = { issueAccessToken, issueFileToken, verifyAccessToken, verifyFileToken, secretProblem, jwtSecretProblem };
