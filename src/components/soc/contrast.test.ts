import { describe, it, expect } from 'vitest';

// The SOC's content sits in white cards on a near-black page. Two greys decide whether secondary text is readable:
//   - text-gray-400 on white is 2.5:1 (WCAG AA wants 4.5:1), so inside a card the lightest grey allowed is gray-500;
//   - text-gray-500 on the near-black page is only about 4.2:1, so text sitting directly on the page needs gray-400.
// Measured with the dashboard open in a browser (computed colour against the effective background); this guards the
// result from the source so a later edit cannot quietly bring it back.
const sources = import.meta.glob(['./*.tsx', '!./*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Text that sits directly on the dark page (not in a card), where gray-400 is the right grey. Anything else with
// text-gray-400 is a mistake. Matched as a substring of the line.
const ON_DARK = [
  'text-xs text-gray-400 max-w-2xl',            // ActivityTab: the explanation above the trail
  '<p className="text-xs text-gray-400">{data.totals', // FeatureUsage: the totals beside the period pills
  '<p className="text-sm text-gray-400">',      // PostureTab: "Showing cached results"
  'text-[11px] text-gray-400 self-center',      // OverviewTab: "Updated 11:26 am"
  "onDark ? 'text-gray-400'",                   // SavedFilters, on the dark page
];

const GRAY_400 = /(?<![\w:-])text-gray-400\b/;

describe('SOC text contrast', () => {
  it('finds the SOC component sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15);
  });

  it('uses text-gray-400 only for text that sits directly on the dark page', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      text.split('\n').forEach((line, i) => {
        if (GRAY_400.test(line) && !ON_DARK.some(ok => line.includes(ok))) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('does not put gray-500 text on a gray-100 chip or pill (4.4:1, just under AA)', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      text.split('\n').forEach((line, i) => {
        if (/bg-gray-100 text-gray-500|text-gray-500 hover:text-gray-800/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
