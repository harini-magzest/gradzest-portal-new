import { useT } from '../i18n/LanguageContext';

// First thing a keyboard or screen-reader user reaches on a page: jumps past the navigation straight to the content.
// Invisible until it has focus. Every layout renders this and marks its content area with id="main-content".
export default function SkipLink() {
  const { t } = useT();
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-10000 focus:bg-white focus:text-[#0d1b4b] focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-medium"
    >
      {t('a11y.skipToContent')}
    </a>
  );
}
