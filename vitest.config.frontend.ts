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
  },
});
