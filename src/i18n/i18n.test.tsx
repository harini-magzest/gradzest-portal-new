import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { translate, TRANSLATIONS, LANGUAGES } from './translations';
import { LanguageProvider, useT } from './LanguageContext';
import SkipLink from '../components/SkipLink';

describe('translate', () => {
  it('returns the text for the language, and the key itself for one nobody defined', () => {
    expect(translate('en', 'nav.chat')).toBe('Chat');
    expect(translate('en', 'no.such.key' as never)).toBe('no.such.key');
  });

  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(translate('en', 'dataAccess.showAll', { n: 7 })).toBe('Show all 7');
    expect(translate('en', 'dataAccess.showAll')).toBe('Show all {n}');
  });

  it('has an entry for every English string in every language, so nothing silently stays English', () => {
    const en = Object.keys(TRANSLATIONS.en);
    for (const lang of Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]) {
      const missing = en.filter(k => !(k in TRANSLATIONS[lang]));
      expect(missing, `missing in ${lang}`).toEqual([]);
    }
  });
});

function Label() {
  const { t } = useT();
  return <p>{t('nav.dashboard')}</p>;
}

describe('LanguageProvider', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.lang = ''; });

  it('shows English and sets the page language', () => {
    render(<LanguageProvider><Label /></LanguageProvider>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores a bad saved value, including Hindi saved before it was removed, and works without a provider', () => {
    for (const saved of ['xx', 'hi']) {
      localStorage.setItem('gz_lang', saved);
      const { unmount } = render(<LanguageProvider><Label /></LanguageProvider>);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(document.documentElement.lang).toBe('en');
      unmount();
    }
    render(<Label />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});

describe('SkipLink', () => {
  it('points at the main content area', () => {
    render(<SkipLink />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  });
});
