// @vitest-environment node
// Hiding the demo panel isn't enough: the demo accounts must not be in the production bundle at all.
// This compiles each login screen the way the production build does (import.meta.env.DEV folded to false, minified),
// with VITE_DEMO_PASSWORD set as if a developer's .env.local were present during the build.
import { describe, it, expect } from 'vitest';
import { transformSync } from 'esbuild';
import loginSource from './Login.tsx?raw';
import authModalSource from '../components/AuthModal.tsx?raw';

const SENTINEL = 'sentinel-demo-password-7f3a';

describe.each([['Login.tsx', loginSource], ['AuthModal.tsx', authModalSource]])('%s in a production bundle', (_file, source) => {
  it('contains no demo account emails and no demo password', () => {
    const { code } = transformSync(source, {
      loader: 'tsx', jsx: 'automatic', minify: true,
      define: { 'import.meta.env.DEV': 'false', 'import.meta.env.VITE_DEMO_PASSWORD': JSON.stringify(SENTINEL) },
    });
    expect(code).not.toMatch(/eduabroad|@example\.com/);
    expect(code).not.toContain(SENTINEL);
  });
});
