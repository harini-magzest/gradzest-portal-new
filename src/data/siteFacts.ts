// Single source of truth for the public claims shown on the home page and elsewhere.
// Only put figures here that the business can back up. Unverified numbers (student
// counts, visa / acceptance rates, program totals) were removed on purpose — add them
// back here, and only here, once confirmed.

export const BRAND = 'Gradzest';

/** Study destinations we actively support — also drives the Destinations section.
 *  NOTE: index.html's meta descriptions say "8 study destinations" (static HTML can't import
 *  this file) — update them too if this list changes. */
export const DESTINATIONS: { country: string; code: string; note?: string }[] = [
  { country: 'United States', code: 'us' },
  { country: 'United Kingdom', code: 'gb' },
  { country: 'Canada', code: 'ca' },
  { country: 'Australia', code: 'au' },
  { country: 'Germany', code: 'de', note: 'Low or no tuition at public universities' },
  { country: 'Singapore', code: 'sg' },
  { country: 'Netherlands', code: 'nl' },
  { country: 'New Zealand', code: 'nz' },
];

/** Hero sub-headline. */
export const HERO_TAGLINE =
  `Search programs at top universities across ${DESTINATIONS.length} study destinations.`;

/** The one stats strip on the page (statements, not unverifiable counts). */
export const HIGHLIGHTS: { value: string; label: string }[] = [
  { value: `${DESTINATIONS.length}`, label: 'Study destinations' },
  { value: 'Free', label: 'Initial counselling' },
  { value: '1:1', label: 'Dedicated counselor' },
  { value: 'End-to-end', label: 'Application & visa support' },
];
