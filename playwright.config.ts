import { defineConfig, devices } from '@playwright/test';

// End-to-end journeys for the four product paths.
//
// baseURL points at the dev server, which Playwright starts on 4173 with
// --strictPort so a stray listener fails loudly instead of silently hitting
// another checkout. Traces land in test-results/ (gitignored) and only on a
// retry; no screenshots are taken or committed.
//
// One worker: the journeys share a dev server and assert on the app's own
// state, so parallel workers add flakiness without shortening the run.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
