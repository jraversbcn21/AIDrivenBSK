import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Runs ONLY the generated drafts in tests/generated/ (pnpm test:generated), which the base
 * config deliberately testIgnores. Everything else (workers: 1, retries, budgets, baseURL)
 * is inherited from the base config — same DES constraints apply to generated specs.
 */
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'generated',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/state.json' },
      testMatch: /generated[\\/].*\.spec\.ts$/,
      dependencies: ['setup'],
    },
  ],
});
