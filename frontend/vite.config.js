import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/predict': 'http://localhost:3000',
      '/feedback': 'http://localhost:3000',
      '/analyze-email-header': 'http://localhost:3000',
      '/bulk-predict': 'http://localhost:3000',
      '/spam-insights': 'http://localhost:3000',
      '/gmail': 'http://localhost:3000',
      '/outlook': 'http://localhost:3000',
      '/scan-emails': 'http://localhost:3000',
      '/importance': 'http://localhost:3000',
      '/analytics': 'http://localhost:3000',
    },
  },
})
