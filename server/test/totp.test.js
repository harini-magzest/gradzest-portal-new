const { base32Encode, base32Decode, generateSecret, totp, verifyTotp, otpauthUri, STEP_SECONDS } = require('../lib/totp');

// RFC 6238 appendix B: SHA-1, the ASCII secret "12345678901234567890", 8-digit codes.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('totp', () => {
  it.each(RFC_VECTORS)('matches the RFC 6238 vector at t=%i', (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
  });

  it('makes the 6-digit code the last six digits of the 8-digit one', () => {
    expect(totp(RFC_SECRET, 59 * 1000)).toBe('287082');
  });

  it('round-trips base32 and tolerates spaces, dashes and lower case', () => {
    const raw = Buffer.from('hello world, this is a secret!');
    const enc = base32Encode(raw);
    expect(base32Decode(enc).equals(raw)).toBe(true);
    const spaced = enc.toLowerCase().replace(/(.{4})/g, '$1 ');
    expect(base32Decode(spaced).equals(raw)).toBe(true);
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('generates a 160-bit secret that is different every time', () => {
    const a = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateSecret()).not.toBe(a);
  });

  describe('verifyTotp', () => {
    const t0 = 1700000000000;
    const stepOf = (ms) => Math.floor(ms / 1000 / STEP_SECONDS);

    it('accepts the current code and returns its step', () => {
      expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t0), { timeMs: t0 })).toBe(stepOf(t0));
    });

    it('accepts one step of clock drift either way, but not two', () => {
      const prev = totp(RFC_SECRET, t0 - STEP_SECONDS * 1000);
      const next = totp(RFC_SECRET, t0 + STEP_SECONDS * 1000);
      const old = totp(RFC_SECRET, t0 - 2 * STEP_SECONDS * 1000);
      expect(verifyTotp(RFC_SECRET, prev, { timeMs: t0 })).toBe(stepOf(t0) - 1);
      expect(verifyTotp(RFC_SECRET, next, { timeMs: t0 })).toBe(stepOf(t0) + 1);
      expect(verifyTotp(RFC_SECRET, old, { timeMs: t0 })).toBeNull();
    });

    it('refuses a code from a step that was already used (replay)', () => {
      const code = totp(RFC_SECRET, t0);
      const step = verifyTotp(RFC_SECRET, code, { timeMs: t0 });
      expect(verifyTotp(RFC_SECRET, code, { timeMs: t0, afterStep: step })).toBeNull();
      // ...but the next step's code is still fine
      const later = totp(RFC_SECRET, t0 + STEP_SECONDS * 1000);
      expect(verifyTotp(RFC_SECRET, later, { timeMs: t0 + STEP_SECONDS * 1000, afterStep: step })).toBe(step + 1);
    });

    it('accepts a code typed with a space in the middle', () => {
      const code = totp(RFC_SECRET, t0);
      expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { timeMs: t0 })).toBe(stepOf(t0));
    });

    it('rejects wrong, short, long, empty and non-numeric input without throwing', () => {
      const code = totp(RFC_SECRET, t0);
      const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
      for (const bad of [wrong, '12345', '1234567', '', undefined, null, 'abcdef', '12 34 5x']) {
        expect(verifyTotp(RFC_SECRET, bad, { timeMs: t0 })).toBeNull();
      }
      expect(verifyTotp('not*base32', code, { timeMs: t0 })).toBeNull();
    });
  });

  it('builds the otpauth URI an authenticator app expects', () => {
    const uri = otpauthUri({ secret: 'JBSWY3DPEHPK3PXP', account: 'a.b+c@example.com', issuer: 'Gradzest' });
    expect(uri.startsWith('otpauth://totp/Gradzest:a.b%2Bc%40example.com?')).toBe(true);
    const q = new URL(uri).searchParams;
    expect(q.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(q.get('issuer')).toBe('Gradzest');
    expect(q.get('digits')).toBe('6');
    expect(q.get('period')).toBe('30');
  });
});
