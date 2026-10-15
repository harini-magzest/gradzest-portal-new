const net = require('net');
const { runChecks, hasFailures, redact, clamdPing } = require('../lib/integrationsCheck');

const SECRETS = {
  ANTHROPIC_API_KEY: 'sk-ant-test-0123456789abcdef',
  GEMINI_API_KEY: 'AIzaSyTEST0123456789abcdef',
  SMTP_PASS: 'smtp-pass-0123456789',
  WHATSAPP_TOKEN: 'EAAGwhatsapp0123456789',
  SMARTFLO_API_TOKEN: 'smartflo-token-0123456789',
  MONGODB_URI: 'mongodb://dbuser:dbpassword123@db.example.invalid/app',
};
const FULL_ENV = {
  ...SECRETS, SMTP_USER: 'mailer@example.invalid', WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  AWS_REGION: 'ap-south-1', AWS_S3_BUCKET: 'docs-bucket',
};
const by = (results, name) => results.find((r) => r.name === name);
const okFetch = () => async () => ({ ok: true, status: 200 });
const noClamd = async () => ({ ok: true, detail: 'answered PONG' });

describe('runChecks: nothing configured', () => {
  it('skips what is not set up and does not count that as a failure', async () => {
    const results = await runChecks({
      env: { MONGODB_URI: 'mongodb://x/y' }, fetchImpl: () => { throw new Error('must not be called'); },
      pingDatabase: async () => {}, pingClamd: noClamd,
    });
    expect(by(results, 'Zest AI (Anthropic)').status).toBe('skipped');
    expect(by(results, 'Email (SMTP)').status).toBe('skipped');
    expect(by(results, 'WhatsApp').status).toBe('skipped');
    expect(by(results, 'Calls (Smartflo)').status).toBe('skipped');
    expect(by(results, 'File storage (S3)').status).toBe('skipped');
    expect(hasFailures(results)).toBe(false);
  });

  it('reports a missing database setting as a failure', async () => {
    const results = await runChecks({ env: {}, fetchImpl: okFetch(), pingClamd: noClamd });
    expect(by(results, 'Database')).toMatchObject({ status: 'fail', detail: 'MONGODB_URI is not set' });
    expect(hasFailures(results)).toBe(true);
  });
});

describe('runChecks: everything configured', () => {
  it('passes when every service answers, and only ever makes GET requests', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200 }; };
    const results = await runChecks({
      env: FULL_ENV, fetchImpl, pingClamd: noClamd, now: new Date('2026-10-12T10:00:00Z'),
      pingDatabase: async () => {}, verifyMailer: async () => {}, headBucket: async () => {},
    });
    for (const name of ['Database', 'Zest AI (Anthropic)', 'Zest AI (Gemini fallback)', 'Email (SMTP)', 'WhatsApp', 'Calls (Smartflo)', 'File storage (S3)', 'Virus scanning (ClamAV)']) {
      expect(by(results, name).status, name).toBe('ok');
    }
    expect(hasFailures(results)).toBe(false);
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c.init.method).toBe('GET');
    // WhatsApp: the phone-number record, never the messages endpoint
    const wa = calls.find((c) => c.url.includes('graph.facebook.com'));
    expect(wa.url).toContain('/1234567890?fields=display_phone_number');
    expect(wa.url).not.toContain('/messages');
    // Smartflo: one record, last 24 hours, in the format the app uses
    const sf = calls.find((c) => c.url.includes('/call/records'));
    const query = new URL(sf.url).searchParams;
    expect(query.get('limit')).toBe('1');
    expect(query.get('from_date')).toBe('2026-10-11 10:00:00');
    expect(query.get('to_date')).toBe('2026-10-12 10:00:00');
  });

  it('never puts a secret in any result', async () => {
    const results = await runChecks({
      env: FULL_ENV, fetchImpl: okFetch(), pingClamd: noClamd,
      pingDatabase: async () => {}, verifyMailer: async () => {}, headBucket: async () => {},
    });
    const text = JSON.stringify(results);
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
  });
});

describe('runChecks: failures', () => {
  it('says a rejected key was rejected, without echoing it', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401 });
    const results = await runChecks({ env: FULL_ENV, fetchImpl, pingClamd: noClamd, pingDatabase: async () => {} });
    const r = by(results, 'Zest AI (Anthropic)');
    expect(r.status).toBe('fail');
    expect(r.detail).toMatch(/rejected/);
    expect(JSON.stringify(results)).not.toContain(SECRETS.ANTHROPIC_API_KEY);
    expect(hasFailures(results)).toBe(true);
  });

  it('redacts a secret that a library put inside its own error message', async () => {
    const fetchImpl = async (url) => { throw new Error(`connect failed for ${url} using ${SECRETS.ANTHROPIC_API_KEY}`); };
    const verifyMailer = async () => { throw new Error(`535 auth failed for ${SECRETS.SMTP_PASS}`); };
    const pingDatabase = async () => { throw new Error(`could not reach ${SECRETS.MONGODB_URI}`); };
    const results = await runChecks({ env: FULL_ENV, fetchImpl, verifyMailer, pingDatabase, pingClamd: noClamd });
    expect(by(results, 'Zest AI (Anthropic)').status).toBe('fail');
    expect(by(results, 'Email (SMTP)').status).toBe('fail');
    expect(by(results, 'Database').status).toBe('fail');
    const text = JSON.stringify(results);
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
    expect(text).toContain('***');
  });

  it('reports a timeout in plain words', async () => {
    const fetchImpl = async () => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; };
    const results = await runChecks({ env: FULL_ENV, fetchImpl, pingClamd: noClamd, pingDatabase: async () => {} });
    expect(by(results, 'WhatsApp').detail).toMatch(/no answer within 8s/);
  });

  it('flags a bucket or a virus scanner that is not reachable', async () => {
    const results = await runChecks({
      env: FULL_ENV, fetchImpl: okFetch(), pingDatabase: async () => {}, verifyMailer: async () => {},
      headBucket: async () => { throw new Error('AccessDenied'); },
      pingClamd: async () => ({ ok: false, detail: 'ECONNREFUSED' }),
    });
    expect(by(results, 'File storage (S3)').status).toBe('fail');
    const av = by(results, 'Virus scanning (ClamAV)');
    expect(av.status).toBe('fail');
    expect(av.detail).toMatch(/uploads are refused/);
  });

  it('flags alert channels that are only partly set', async () => {
    const results = await runChecks({
      env: { MONGODB_URI: 'mongodb://x/y', SOC_TELEGRAM_BOT_TOKEN: 'bot-token-0123456789' },
      fetchImpl: okFetch(), pingDatabase: async () => {}, pingClamd: noClamd,
    });
    expect(by(results, 'SOC Telegram alerts')).toMatchObject({ status: 'fail' });
    expect(by(results, 'SOC Telegram alerts').detail).toMatch(/SOC_TELEGRAM_CHAT_ID/);
  });
});

describe('redact', () => {
  it('replaces known secret values and leaves other text alone', () => {
    expect(redact('token abc-secret-value used', { JWT_SECRET: 'abc-secret-value' })).toBe('token *** used');
    expect(redact('nothing here', { JWT_SECRET: 'abc-secret-value' })).toBe('nothing here');
    expect(redact(undefined, {})).toBe('');
  });
  it('ignores very short values so it never mangles ordinary text', () => {
    expect(redact('the a b', { JWT_SECRET: 'a' })).toBe('the a b');
  });
});

describe('clamdPing', () => {
  const listen = (onConnection) => new Promise((resolve) => {
    const server = net.createServer(onConnection);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

  it('succeeds when clamd answers PONG to PING', async () => {
    let received = '';
    const server = await listen((s) => { s.on('data', (d) => { received += d.toString(); s.write('PONG\0'); }); });
    const r = await clamdPing({ host: '127.0.0.1', port: server.address().port, timeoutMs: 2000 });
    server.close();
    expect(r.ok).toBe(true);
    expect(received).toContain('PING');
  });

  it('fails cleanly when nothing is listening', async () => {
    const server = await listen(() => {});
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    const r = await clamdPing({ host: '127.0.0.1', port, timeoutMs: 2000 });
    expect(r.ok).toBe(false);
  });

  it('fails when the server never answers', async () => {
    const server = await listen(() => { /* accept and stay silent */ });
    const r = await clamdPing({ host: '127.0.0.1', port: server.address().port, timeoutMs: 300 });
    server.close();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/no answer/);
  });
});
