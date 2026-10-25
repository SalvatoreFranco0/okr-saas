import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    // I test E2E (Playwright) vivono in e2e/ e girano con `npm run e2e`.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
