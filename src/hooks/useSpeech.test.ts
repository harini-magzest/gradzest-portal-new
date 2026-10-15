import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { stripForSpeech, SPEECH_LANGS, useSpeech } from './useSpeech';

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

  it('no longer offers Hindi', () => {
    expect(SPEECH_LANGS.some(l => l.code === 'hi-IN')).toBe(false);
  });
});

describe('useSpeech saved language', () => {
  beforeEach(() => { localStorage.clear(); });

  it('falls back to English when the saved language is no longer offered (Hindi, saved before it was removed)', () => {
    localStorage.setItem('gz_zest_lang', 'hi-IN');
    expect(renderHook(() => useSpeech()).result.current.lang).toBe('en-IN');
  });

  it('keeps a saved language that is still offered', () => {
    localStorage.setItem('gz_zest_lang', 'ta-IN');
    expect(renderHook(() => useSpeech()).result.current.lang).toBe('ta-IN');
  });
});
