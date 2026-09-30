import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import obfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig({
  plugins: [
    react(),
    // Production-only (apply: 'build') — never runs under `vite`/npm run dev, which would
    // make HMR unusable and serves unbundled source anyway regardless of this plugin.
    // This plugin runs pre-bundle (Rollup's `transform` hook), so esbuild's later minify
    // pass overwrites plain identifier renaming — only options that inject real runtime
    // logic (stringArray) survive into the shipped bundle. ignoreImports:true is required:
    // without it, stringArray also encodes the literal specifiers passed to dynamic
    // import(), which breaks Rollup's static chunk resolution for this app's 40+ lazy
    // routes ("Failed to fetch dynamically imported module"). Verified via full build +
    // browser test (public pages, real login, 8 admin pages) with 0 runtime errors.
    obfuscator({
      apply: 'build',
      options: {
        compact: true,
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false,
        selfDefending: false,
        splitStrings: false,
        ignoreImports: true,
        stringArray: true,
        stringArrayThreshold: 0.75,
        stringArrayEncoding: ['base64'],
        transformObjectKeys: false,
      },
    }),
  ],
  build: {
    // Vite's default is already false — explicit here so it can't be flipped on
    // by accident and so DevTools can never reconstruct the original source.
    sourcemap: false,
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
    testTimeout: 20000,
    hookTimeout: 90000,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
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
})
