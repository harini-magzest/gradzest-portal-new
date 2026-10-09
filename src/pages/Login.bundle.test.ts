// @vitest-environment node
// Hiding the demo panel isn't enough: the passwords must not be in the production bundle at all.
// This compiles Login.tsx the way the production build does (import.meta.env.DEV folded to false, minified).
import { describe, it, expect } from 'vitest';
import { transformSync } from 'esbuild';
import source from './Login.tsx?raw';

describe('Login production bundle', () => {
  it('contains no demo account emails or passwords', () => {
    const { code } = transformSync(source, {
      loader: 'tsx', jsx: 'automatic', minify: true,
      define: { 'import.meta.env.DEV': 'false' },
    });
    expect(code).not.toMatch(/admin123|eduabroad|@example\.com/);
  });
});
