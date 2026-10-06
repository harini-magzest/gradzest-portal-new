import { describe, expect, it } from 'vitest';
import { stripForSpeech, SPEECH_LANGS } from './useSpeech';

describe('stripForSpeech', () => {
  it('removes markdown marks and bullets', () => {
    expect(stripForSpeech('**Next step:** upload your `passport`.\n- Item one\n- Item two')).toBe('Next step: upload your passport. Item one Item two');
  });
  it('drops links instead of reading them out', () => {
    expect(stripForSpeech('See https://example.com/visa?x=1 for details')).toBe('See for details');
  });
  it('returns an empty string for text with nothing to say', () => {
    expect(stripForSpeech('  ***  ')).toBe('');
  });
});

describe('SPEECH_LANGS', () => {
  it('lists English first, each language once', () => {
    expect(SPEECH_LANGS[0].code).toBe('en-IN');
    expect(new Set(SPEECH_LANGS.map(l => l.code)).size).toBe(SPEECH_LANGS.length);
  });
});
