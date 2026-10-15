// Interface text for each supported language. English is the source of truth and the fallback: a key missing from
// another language shows the English text, never a blank or the raw key. English is the only language at the moment.
// Add a language by adding a block here and an entry in LANGUAGES (and a language switcher); add a string by adding it
// to `en` first.

export const LANGUAGES = { en: 'English' } as const;
export type LangCode = keyof typeof LANGUAGES;

const en = {
  'session.idleTitle': 'Are you still there?',
  'session.idleBody': 'For your security you will be signed out in {time} because there has been no activity.',
  'session.stay': 'Stay signed in',
  'session.signOut': 'Sign out now',
  'session.endingBody': 'Your sign-in ends in {time}. Save your work: you will need to sign in again to continue.',
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

export const TRANSLATIONS: Record<LangCode, Partial<Record<TranslationKey, string>>> = { en };

/** Looks a key up in a language, falling back to English. `{name}` placeholders are filled from `vars`. */
export function translate(lang: LangCode, key: TranslationKey, vars?: Record<string, string | number>): string {
  const text = TRANSLATIONS[lang]?.[key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : text;
}

export const isLangCode = (v: unknown): v is LangCode => typeof v === 'string' && v in LANGUAGES;
