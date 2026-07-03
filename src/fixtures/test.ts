import { test as base, expect } from '@playwright/test';
import { loadEnv, type AppEnv } from '../config/env';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { ProductPage } from '../pages/ProductPage';

interface Fixtures {
  env: AppEnv;
  homePage: HomePage;
  loginPage: LoginPage;
  searchResultsPage: SearchResultsPage;
  productPage: ProductPage;
  routeEvidence: void;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => { await use(loadEnv()); },
  homePage: async ({ page }, use) => { await use(new HomePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  searchResultsPage: async ({ page }, use) => { await use(new SearchResultsPage(page)); },
  productPage: async ({ page }, use) => { await use(new ProductPage(page)); },
  // Records every main-frame navigation and attaches the ordered URL list to the test
  // result; planner/evidence/reporter.ts aggregates the attachments into
  // reports/route-evidence.json for journey-coverage matching (design spec
  // 2026-07-02-coverage-planner-design.md).
  routeEvidence: [async ({ page }, use, testInfo) => {
    const urls: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });
    await use();
    await testInfo.attach('route-evidence', { body: JSON.stringify(urls), contentType: 'application/json' });
  }, { auto: true }],
});

export { expect };
