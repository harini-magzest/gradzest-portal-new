import { describe, it, expect } from 'vitest';

// Guards two cheap accessibility rules across the whole UI source, so they can't quietly regress:
//  1. a button whose only content is an icon must have a name a screen reader can announce;
//  2. every dashboard layout must offer the skip link and mark its content area as the target.

// Every component source file as text (tests excluded), loaded by Vite so no Node file APIs are needed.
const sources = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const BUTTON = /<button\b([^>]*?)>(.*?)<\/button>/gs;
const ICON_ONLY = /^<(X|RefreshCw|Send|Bookmark|PenLine|Trash2|Eye|EyeOff)\b[^<>]*?(?:\{[^{}]*\}[^<>]*?)*\/>$/s;

describe('accessibility rules', () => {
  it('finds the source files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('every icon-only button has an accessible name', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(BUTTON)) {
        if (/aria-label|aria-labelledby|title=/.test(m[1])) continue;
        if (ICON_ONLY.test(m[2].trim())) offenders.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every layout has a skip link and a main-content target', () => {
    const layouts = ['student/StudentLayout', 'counselor/CounselorLayout', 'admin/AdminLayout', 'appteam/AppTeamLayout', 'board/BoardLayout', 'soc/SOCLayout', 'PublicLayout'];
    for (const l of layouts) {
      const text = sources[`../pages/${l}.tsx`];
      expect(text, l).toBeTruthy();
      expect(text, l).toContain('<SkipLink />');
      expect(text, l).toContain('id="main-content"');
    }
  });
});
