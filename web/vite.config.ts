import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // I moduli puri delle Edge Functions (../supabase/functions/_shared) importano `zod` come
      // specificatore nudo (in Deno lo risolve l'import map supabase/functions/deno.json):
      // nei test lo si risolve sul pacchetto di web.
      { find: /^zod$/, replacement: fileURLToPath(new URL('./node_modules/zod/index.js', import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
  },
  test: {
    // I test E2E (Playwright) vivono in e2e/ e girano con `npm run e2e`.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
