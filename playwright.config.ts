import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests of the chat against a REAL local Supabase stack (auth, database, RLS, Realtime, storage):
 *   npx supabase start        # applies supabase/migrations
 *   npm run test:e2e
 * Only third-party services the chat does not depend on (Open-Meteo weather / city search) are stubbed.
 * The keys below are the fixed demo keys of `supabase start` (local only, public by design); override them with
 * E2E_SUPABASE_URL / E2E_SUPABASE_PUBLISHABLE_KEY. Chromium: set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled one.
 * E2E_PORT changes the dev-server port (parallel runs from different checkouts must not share a server);
 * E2E_BASE_URL tests an app that is already being served (e.g. a production build behind deploy/Caddyfile) instead.
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PORT = Number(process.env.E2E_PORT ?? 5174)
const BASE_URL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One backend shared by every test: run serially so realtime assertions stay deterministic.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/e2e',
  use: {
    baseURL: BASE_URL ?? `http://127.0.0.1:${PORT}`,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      // The app talks to 127.0.0.1 only; never route that through a system proxy.
      args: ['--no-proxy-server'],
    },
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1366, height: 860 } } },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY },
      },
})
