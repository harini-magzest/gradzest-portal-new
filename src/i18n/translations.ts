// Interface text for each supported language. English is the source of truth and the fallback: a key missing from
// another language shows the English text, never a blank or the raw key. Add a language by adding a block here and an
// entry in LANGUAGES; add a string by adding it to `en` first.

export const LANGUAGES = { en: 'English', hi: 'हिन्दी' } as const;
export type LangCode = keyof typeof LANGUAGES;

const en = {
  'lang.label': 'Language',
  'a11y.skipToContent': 'Skip to main content',

  'nav.dashboard': 'Dashboard',
  'nav.applications': 'Applications',
  'nav.countries': 'Countries',
  'nav.universities': 'Universities',
  'nav.courses': 'Courses',
  'nav.activities': 'Activities',
  'nav.meetings': 'Meetings',
  'nav.events': 'Events',
  'nav.learning': 'Learning Hub',
  'nav.chat': 'Chat',
  'nav.profile': 'My Profile',

  'nextStep.label': 'Your next step',

  'dataAccess.title': 'Who has viewed my details',
  'dataAccess.intro': 'Every time a member of the team opens your personal details (such as your passport or contact information), it is recorded here.',
  'dataAccess.empty': 'Nobody has viewed your details yet.',
  'dataAccess.loading': 'Loading…',
  'dataAccess.showAll': 'Show all {n}',
  'dataAccess.showFewer': 'Show fewer',

};

export type TranslationKey = keyof typeof en;

const hi: Partial<Record<TranslationKey, string>> = {
  'lang.label': 'भाषा',
  'a11y.skipToContent': 'मुख्य सामग्री पर जाएँ',

  'nav.dashboard': 'डैशबोर्ड',
  'nav.applications': 'आवेदन',
  'nav.countries': 'देश',
  'nav.universities': 'विश्वविद्यालय',
  'nav.courses': 'पाठ्यक्रम',
  'nav.activities': 'गतिविधियाँ',
  'nav.meetings': 'बैठकें',
  'nav.events': 'कार्यक्रम',
  'nav.learning': 'लर्निंग हब',
  'nav.chat': 'चैट',
  'nav.profile': 'मेरी प्रोफ़ाइल',

  'nextStep.label': 'आपका अगला कदम',

  'dataAccess.title': 'मेरी जानकारी किसने देखी',
  'dataAccess.intro': 'जब भी टीम का कोई सदस्य आपकी व्यक्तिगत जानकारी (जैसे पासपोर्ट या संपर्क विवरण) खोलता है, तो वह यहाँ दर्ज होता है।',
  'dataAccess.empty': 'अभी तक किसी ने आपकी जानकारी नहीं देखी है।',
  'dataAccess.loading': 'लोड हो रहा है…',
  'dataAccess.showAll': 'सभी {n} देखें',
  'dataAccess.showFewer': 'कम दिखाएँ',

};

export const TRANSLATIONS: Record<LangCode, Partial<Record<TranslationKey, string>>> = { en, hi };

/** Looks a key up in a language, falling back to English. `{name}` placeholders are filled from `vars`. */
export function translate(lang: LangCode, key: TranslationKey, vars?: Record<string, string | number>): string {
  const text = TRANSLATIONS[lang]?.[key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : text;
}

export const isLangCode = (v: unknown): v is LangCode => typeof v === 'string' && v in LANGUAGES;
