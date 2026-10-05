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
  'nav.shortlist': 'Shortlist',
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

  'shortlist.title': 'My shortlist',
  'shortlist.intro': 'Save courses from the Courses page, then compare them here.',
  'shortlist.emptyTitle': 'Nothing saved yet',
  'shortlist.emptyHint': 'Use “Save to compare” on any course to build your shortlist.',
  'shortlist.browse': 'Browse courses',
  'shortlist.remove': 'Remove',
  'shortlist.lowestFee': 'Lowest fee',
  'shortlist.bestRanked': 'Best ranked',
  'shortlist.row.location': 'Location',
  'shortlist.row.ranking': 'University ranking',
  'shortlist.row.level': 'Level',
  'shortlist.row.duration': 'Duration',
  'shortlist.row.tuition': 'Tuition fee',
  'shortlist.row.applicationFee': 'Application fee',
  'shortlist.row.intakes': 'Intakes',
  'shortlist.row.scholarship': 'Scholarship',
  'shortlist.row.minGpa': 'Minimum GPA',
  'shortlist.row.english': 'English requirement',

  'courses.save': 'Save to compare',
  'courses.saved': 'Saved',
  'courses.compare': 'Compare shortlist',
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
  'nav.shortlist': 'शॉर्टलिस्ट',
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

  'shortlist.title': 'मेरी शॉर्टलिस्ट',
  'shortlist.intro': 'पाठ्यक्रम पृष्ठ से पाठ्यक्रम सहेजें, फिर उनकी यहाँ तुलना करें।',
  'shortlist.emptyTitle': 'अभी कुछ सहेजा नहीं गया',
  'shortlist.emptyHint': 'अपनी शॉर्टलिस्ट बनाने के लिए किसी भी पाठ्यक्रम पर “तुलना के लिए सहेजें” चुनें।',
  'shortlist.browse': 'पाठ्यक्रम देखें',
  'shortlist.remove': 'हटाएँ',
  'shortlist.lowestFee': 'सबसे कम शुल्क',
  'shortlist.bestRanked': 'सर्वोच्च रैंक',
  'shortlist.row.location': 'स्थान',
  'shortlist.row.ranking': 'विश्वविद्यालय रैंकिंग',
  'shortlist.row.level': 'स्तर',
  'shortlist.row.duration': 'अवधि',
  'shortlist.row.tuition': 'ट्यूशन शुल्क',
  'shortlist.row.applicationFee': 'आवेदन शुल्क',
  'shortlist.row.intakes': 'प्रवेश सत्र',
  'shortlist.row.scholarship': 'छात्रवृत्ति',
  'shortlist.row.minGpa': 'न्यूनतम GPA',
  'shortlist.row.english': 'अंग्रेज़ी की आवश्यकता',

  'courses.save': 'तुलना के लिए सहेजें',
  'courses.saved': 'सहेजा गया',
  'courses.compare': 'शॉर्टलिस्ट की तुलना करें',
};

export const TRANSLATIONS: Record<LangCode, Partial<Record<TranslationKey, string>>> = { en, hi };

/** Looks a key up in a language, falling back to English. `{name}` placeholders are filled from `vars`. */
export function translate(lang: LangCode, key: TranslationKey, vars?: Record<string, string | number>): string {
  const text = TRANSLATIONS[lang]?.[key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : text;
}

export const isLangCode = (v: unknown): v is LangCode => typeof v === 'string' && v in LANGUAGES;
