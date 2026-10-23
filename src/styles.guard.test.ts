import { describe, it, expect } from 'vitest';
// The browser tsconfig has no Node types (adding them would change other files' types), but Vitest runs this file in Node.
// @ts-expect-error TS2591: no types for node:fs
import { readFileSync } from 'node:fs';
// @ts-expect-error TS2591: no types for node:path
import { join } from 'node:path';
declare const process: { cwd(): string };

// Tailwind 4 changed a few defaults that make the app look different; src/index.css puts them back. Two of those fixes are
// plain CSS rules outside any @layer (so they beat the utilities), and that only stays correct while the classes they
// target are used in one way. This fails with the file and the class when that stops being true.

const sources = import.meta.glob(['/src/**/*.tsx', '/src/**/*.ts', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// Read from disk (tests run from the repo root): Vitest hands back an empty string for any imported .css file, even with ?raw.
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

const gradientUses = (): { file: string; token: string }[] => {
  const out: { file: string; token: string }[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/(?<![\w-])((?:[a-z0-9-]+:)*)bg-linear-to-([a-z]+)(?![\w-])/gi)) {
      out.push({ file, token: m[0] });
    }
  }
  return out;
};

describe('gradients keep Tailwind 3\'s sRGB blend', () => {
  it('every gradient direction in use has an override in index.css', () => {
    const wanted = new Set(gradientUses().map((u) => u.token));
    const missing = [...wanted].filter((t) => !new RegExp(`\\.${t}\\s*\\{[^}]*in srgb`).test(css));
    expect(missing, 'add a ".bg-linear-to-… { --tw-gradient-position: … in srgb; }" rule to src/index.css').toEqual([]);
  });

  it('is never used behind a breakpoint, hover or other variant (the unlayered rule would override it)', () => {
    const variants = gradientUses().filter((u) => u.token.includes(':'));
    expect(variants.map((u) => `${u.file}: ${u.token}`)).toEqual([]);
  });

  it('finds the gradients at all (the scan itself works)', () => {
    expect(gradientUses().length).toBeGreaterThan(50);
  });
});

describe('the base-style fixes are still in index.css', () => {
  it.each([
    ['text fields and selects keep a white background', /background-color:\s*field/],
    ['placeholders keep Tailwind 3\'s gray', /::placeholder[^}]*color:\s*var\(--color-gray-400\)/],
    ['enabled buttons keep a pointer cursor', /button:not\(:disabled\)[^}]*cursor:\s*pointer/],
    ['date and time fields keep the browser\'s own inner padding', /::-webkit-datetime-edit,[^}]*padding-block:\s*revert/],
    ['table cells keep the browser\'s 1px padding', /td,\s*th\s*\{\s*padding:\s*1px/],
    ['legends keep the browser\'s 2px side padding', /legend\s*\{\s*padding-inline:\s*2px/],
  ])('%s', (_name, pattern) => {
    expect(css).toMatch(pattern);
  });
});

describe('the Tailwind 3 theme values are still in theme-v3-compat.css', () => {
  const theme = readFileSync(join(process.cwd(), 'src', 'theme-v3-compat.css'), 'utf8');

  it.each([
    ['xs', '1rem'], ['sm', '1.25rem'], ['base', '1.5rem'], ['lg', '1.75rem'], ['xl', '1.75rem'], ['2xl', '2rem'], ['3xl', '2.25rem'], ['4xl', '2.5rem'],
  ])('text-%s has a fixed line-height of %s, so smaller text inside it inherits a length, not a ratio', (size, value) => {
    expect(theme).toContain(`--text-${size}--line-height: ${value};`);
  });

  it('has the Tailwind 3 palette (a few spot checks)', () => {
    expect(theme).toContain('--color-green-400: #4ade80;');
    expect(theme).toContain('--color-blue-600: #2563eb;');
    expect(theme).toContain('--color-gray-200: #e5e7eb;');
  });
});
