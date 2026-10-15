import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LangCode, TranslationKey, isLangCode, translate } from './translations';

const STORAGE_KEY = 'gz_lang';

interface LanguageValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

function initialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLangCode(saved)) return saved;
  } catch { /* storage blocked: start in English */ }
  return 'en';
}

// Components work without a provider (tests, isolated renders): they just get English.
const Ctx = createContext<LanguageValue>({
  lang: 'en',
  setLang: () => {},
  t: (key, vars) => translate('en', key, vars),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(initialLang);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = useCallback((next: LangCode) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* the choice just won't be remembered */ }
  }, []);

  const value = useMemo<LanguageValue>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx);
