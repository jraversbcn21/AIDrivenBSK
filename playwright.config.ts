import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loadEnv } from './src/config/env';

dotenv.config();
const env = loadEnv();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Serial on purpose: concurrent flows share one DES account/session (login.spec re-authenticates
  // it mid-run) and DES pre-prod degrades visibly under two simultaneous search flows (stuck /q/
  // loads, untranslated shells) — measured live: parallel full-suite runs failed 6/6, isolation
  // always green (findings doc §7). With 4 tests, parallelism buys ~1 minute; not worth it.
  workers: 1,
  forbidOnly: !!process.env.CI,
  // DES pre-prod degrades in many distinct ways under sustained automated use (dead /q/ loads,
  // untranslated/broken app shells, stuck nav dialogs — all confirmed live, findings doc §7).
  // The page objects already act->verify->retry every state-changing interaction; a test-level
  // retry is the standard mitigation for whole-flow environment noise, and trace-on-first-retry
  // captures the evidence when it happens.
  retries: 1,
  // Generated drafts (pnpm build-tests) never run in the default suite — they are reviewed
  // and promoted by a human first; run them explicitly with pnpm test:generated.
  testIgnore: ['**/tests/generated/**'],
  reporter: [
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['list'],
    ['./planner/evidence/reporter.ts'],
  ],
  timeout: env.defaultTimeoutMs,
  use: {
    baseURL: env.baseURL,
    locale: env.locale,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/state.json' },
      dependencies: ['setup'],
    },
  ],
});
