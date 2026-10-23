import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts's `test` block (which runs the backend suite under
// Node against an in-memory Mongo). Frontend component tests need a DOM, so they
// get their own jsdom-environment config instead of sharing that setup.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The default 5s fails tests that pass alone whenever the machine is busy (the whole suite in parallel, CI runners,
    // other work alongside): the first test in a file pays for its imports. This tells a hung test from a slow machine.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
