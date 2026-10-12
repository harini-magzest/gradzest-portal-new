// Static checks for the bugs a type checker can't see. The frontend is already type-checked (tsc); the server is plain
// JavaScript with no checking at all, so this is its only safety net against a misspelt variable or a duplicated key.
// Style (quotes, semicolons, spacing) is deliberately not enforced here: the rules below are about correctness.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**', '**/node_modules/**', 'server/uploads/**', 'public/**']),

  js.configs.recommended,

  // Settings that apply everywhere
  {
    rules: {
      // `catch {}` that deliberately ignores a failure (storage unavailable, best-effort cleanup) is a pattern here
      'no-empty': ['error', { allowEmptyCatch: true }],
      // An error thrown from a catch block can't carry `cause` under this project's ES2020 lib setting
      'preserve-caught-error': 'off',
      // Unused names are worth a look but not worth blocking: warned, and held at today's count by --max-warnings
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },

  // Browser app: TypeScript + React
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // About 1,500 `any`s today: tightening them is its own project, not a lint gate
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // `cond && doThing()` and `cond ? a() : b()` as statements are used throughout
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
    },
  },

  // API server: CommonJS under Node
  {
    files: ['server/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },

  // Tests (both sides) use vitest's globals
  {
    files: ['**/*.test.{js,ts,tsx}'],
    languageOptions: { globals: { ...globals.vitest } },
  },

  // Build and tooling scripts, and the configs themselves: ES modules under Node
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
]);
