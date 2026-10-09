// Removes credentials from a URL before it is logged or stored (request log, security events, alerts): an access token
// in ?token= (old /uploads links, the email-verification link), a signed link's ?sig=, an OAuth ?code=, and the like.
// The parameter stays, so the log still shows that one was sent; only its value is replaced.
const SECRET_PARAMS = new Set(['token', 'access_token', 'refresh_token', 'id_token', 'sig', 'signature', 'code', 'password', 'secret']);

function redactUrl(url) {
  const text = String(url ?? '');
  const q = text.indexOf('?');
  if (q === -1) return text;
  const query = text.slice(q + 1).split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    let key = pair.slice(0, eq);
    try { key = decodeURIComponent(key); } catch { /* keep it as sent */ }
    return SECRET_PARAMS.has(key.toLowerCase()) ? `${pair.slice(0, eq)}=[redacted]` : pair;
  });
  return `${text.slice(0, q)}?${query.join('&')}`;
}

module.exports = { redactUrl };
