// One place that signs and verifies JWTs, so every check pins the algorithm (no `alg: none` / algorithm confusion)
// and the two token kinds can't stand in for each other:
//   access token  15 min, sent as `Authorization: Bearer`, accepted by the API
//   file token    15 min, sent as `?token=` on /uploads links (an <img src> can't send headers). It ends up in URLs,
//                 so it is scoped to file downloads only: the API rejects it, and /uploads rejects access tokens in URLs.
const jwt = require('jsonwebtoken');

const ALG = 'HS256';
const FILE_PURPOSE = 'file';

function issueAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role, isAppTeam: !!user.isAppTeam }, process.env.JWT_SECRET, { algorithm: ALG, expiresIn: '15m' });
}

function issueFileToken(user) {
  return jwt.sign({ id: user._id, role: user.role, isAppTeam: !!user.isAppTeam, purpose: FILE_PURPOSE }, process.env.JWT_SECRET, { algorithm: ALG, expiresIn: '15m' });
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

module.exports = { issueAccessToken, issueFileToken, verifyAccessToken, verifyFileToken };
