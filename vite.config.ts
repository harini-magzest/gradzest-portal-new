import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // No JavaScript obfuscator. The one that used to run here (string-array encoding) made the shipped JS about 28% larger
  // gzipped and the build about twice as slow (2m24s vs 1m13s); anything a browser can run can be read, so it protected nothing. What keeps
  // the original source from being read back is below: no source maps, and Terser's multi-pass minify and mangle.
  // Secrets never belong in the bundle at all (see docs/DEPLOYMENT.md: no secret in a VITE_* variable).
  plugins: [react()],
  build: {
    // Vite's default is already false — explicit here so it can't be flipped on
    // by accident and so DevTools can never reconstruct the original source.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Rollup otherwise emits one tiny chunk per icon a page uses, and each is its own round trip. Grouping them
        // keeps only the icons actually imported.
        // The other groups are the libraries every visit needs. Left in the app's entry chunk they are downloaded
        // again whenever any line of our own code changes; as their own files the browser keeps them across deploys,
        // and no single file is over the 500 kB warning.
        manualChunks: (id) => {
          if (!id.includes('/node_modules/')) return undefined;
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/\/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return 'router';
          if (/\/node_modules\/(socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|@socket\.io)\//.test(id)) return 'socket';
          return undefined;
        },
      },
    },
    // Terser instead of esbuild's default minifier: multi-pass compress + a stronger
    // mangler produce tighter, harder-to-follow output. Deliberately NOT using
    // mangle.properties — renaming object/class property names is the one Terser
    // option that can silently break real code (API response shapes, DOM dataset
    // attrs, third-party libs reading properties by name), so it's left untouched.
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./server/test/setup.ts'],
    include: ['server/test/**/*.test.{js,ts}'],
    // Every test file starts its own in-memory MongoDB, so a busy machine (the whole suite running in parallel, or other
    // work alongside it) stretches a test far beyond what it takes alone. The slowest ones (route sweeps, the chat
    // history and pagination tests) took 20s+ under load and failed for that reason only: they pass alone. These
    // limits are about telling a hung test from a slow machine, not about how fast a test should be.
    testTimeout: 60000,
    hookTimeout: 120000,
  },
  server: {
    // Development only. Reachable from this machine alone by default: the dev server serves unbuilt source and
    // /@vite/client, so it must never be exposed to a network or a public domain. To test from a phone on the same
    // Wi-Fi run `DEV_HOST=0.0.0.0 npm run client` on purpose. Production is the built `dist/`, never this server.
    host: process.env.DEV_HOST || 'localhost',
    port: 5173,
    strictPort: true,
    // Dev-only: the full-screen error overlay on an unhandled exception. Never ships
    // to production — server.hmr config doesn't exist in a `vite build` output at all.
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // `npm run preview` serves the BUILT dist/ (no source, no /@vite/client) for checking a build locally. It is not a
  // production server; deploy dist/ behind nginx or a static host (see docs/DEPLOYMENT.md).
  preview: {
    host: process.env.PREVIEW_HOST || 'localhost',
    port: 4173,
    strictPort: true,
  },
})
