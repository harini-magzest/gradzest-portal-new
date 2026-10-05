import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { translate, TRANSLATIONS, LANGUAGES } from './translations';
import { LanguageProvider, LanguageSwitcher, useT } from './LanguageContext';
import SkipLink from '../components/SkipLink';

describe('translate', () => {
  it('returns the text for the language, falling back to English for a missing key', () => {
    expect(translate('en', 'nav.chat')).toBe('Chat');
    expect(translate('hi', 'nav.chat')).toBe('चैट');
    const hi = TRANSLATIONS.hi as Record<string, string>;
    const saved = hi['nav.chat'];
    delete hi['nav.chat'];
    expect(translate('hi', 'nav.chat')).toBe('Chat');
    hi['nav.chat'] = saved;
  });

  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(translate('en', 'dataAccess.showAll', { n: 7 })).toBe('Show all 7');
    expect(translate('hi', 'dataAccess.showAll', { n: 7 })).toContain('7');
    expect(translate('en', 'dataAccess.showAll')).toBe('Show all {n}');
  });

  it('has a Hindi entry for every English string, so nothing silently stays English', () => {
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
  beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'en'; });

  it('switches the text, remembers the choice and sets the page language', async () => {
    const { unmount } = render(<LanguageProvider><LanguageSwitcher /><Label /></LanguageProvider>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'hi');
    expect(screen.getByText('डैशबोर्ड')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('hi');
    expect(localStorage.getItem('gz_lang')).toBe('hi');

    unmount();
    render(<LanguageProvider><Label /></LanguageProvider>); // a fresh visit starts in the saved language
    expect(screen.getByText('डैशबोर्ड')).toBeInTheDocument();
  });

  it('ignores a bad saved value and works without a provider', () => {
    localStorage.setItem('gz_lang', 'xx');
    render(<LanguageProvider><Label /></LanguageProvider>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    render(<Label />);
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(1);
  });
});

describe('SkipLink', () => {
  it('points at the main content area', () => {
    render(<SkipLink />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  });
});
