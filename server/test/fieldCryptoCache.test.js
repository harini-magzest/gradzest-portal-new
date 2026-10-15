// lib/fieldCrypto.js remembers recent encrypt/decrypt results. It must be invisible: same output as without it, bounded
// in size, and never turning a failure into a remembered success.
const { encrypt, decrypt, isEncrypted, PREFIX } = require('../lib/fieldCrypto');

describe('fieldCrypto result cache', () => {
  it('gives the same ciphertext every time for the same value, and decrypt inverts it', () => {
    const first = encrypt('counselor@example.com');
    expect(isEncrypted(first)).toBe(true);
    for (let i = 0; i < 5; i++) expect(encrypt('counselor@example.com')).toBe(first);
    for (let i = 0; i < 5; i++) expect(decrypt(first)).toBe('counselor@example.com');
  });

  it('stays correct when far more distinct values pass through than the cache holds', () => {
    const values = Array.from({ length: 6000 }, (_, i) => `person-${i}@example.com`);
    const cipher = values.map((v) => encrypt(v));
    expect(new Set(cipher).size).toBe(values.length);          // different plaintext, different ciphertext
    for (let i = 0; i < values.length; i += 97) {
      expect(decrypt(cipher[i])).toBe(values[i]);
      expect(encrypt(values[i])).toBe(cipher[i]);               // an evicted value is simply recomputed, identically
    }
  });

  it('passes empty and non-string values through untouched', () => {
    expect(encrypt('')).toBe('');
    expect(encrypt(null)).toBeNull();
    expect(encrypt(42)).toBe(42);
    expect(decrypt('plain text')).toBe('plain text');
    expect(decrypt(undefined)).toBeUndefined();
  });

  it('does not re-encrypt a value that is already a valid ciphertext', () => {
    const once = encrypt('10.1.2.3');
    expect(encrypt(once)).toBe(once);
  });

  it('never caches a failure: a tampered ciphertext reads as empty every time, and the real one still decrypts', () => {
    const good = encrypt('secret value');
    const flipped = good.slice(0, -2) + (good.endsWith('A') ? 'B' : 'A') + good.slice(-1);
    expect(flipped.startsWith(PREFIX)).toBe(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(decrypt(flipped)).toBe('');
    expect(decrypt(flipped)).toBe('');
    err.mockRestore();
    expect(decrypt(good)).toBe('secret value');
  });

  it('encrypts a user-supplied string that merely starts with the prefix, as before', () => {
    const lookalike = `${PREFIX}not-really-ciphertext`;
    const stored = encrypt(lookalike);
    expect(stored).not.toBe(lookalike);
    expect(decrypt(stored)).toBe(lookalike);
  });
});
