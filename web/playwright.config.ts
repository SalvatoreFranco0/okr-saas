import { defineConfig, devices } from '@playwright/test';

// I test E2E girano contro un Supabase effimero (CI: supabase start + db reset con il seed) e la
// build di produzione servita da `vite preview`. Le variabili arrivano dall'ambiente:
//   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY  (chiave publishable/anon locale)
//   E2E_PASSWORD (default: la costante di test del seed)
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? '',
    },
  },
});
