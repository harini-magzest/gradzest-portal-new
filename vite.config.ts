import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's default is already false — explicit here so it can't be flipped on
    // by accident and so DevTools can never reconstruct the original source.
    sourcemap: false,
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
