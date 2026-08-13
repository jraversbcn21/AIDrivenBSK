import { test as base, expect } from '@playwright/test';
import { loadEnv, type AppEnv } from '../config/env';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';
import { forceDesktopLayout, assertDesktopLayout } from '../support/layout';
import { ensureEmptyCart } from '../support/cartCleanup';

interface Fixtures {
  env: AppEnv;
  homePage: HomePage;
  loginPage: LoginPage;
  searchResultsPage: SearchResultsPage;
  productPage: ProductPage;
  cartPage: CartPage;
  routeEvidence: void;
  desktopLayout: void;
  cleanCart: void;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => { await use(loadEnv()); },
  homePage: async ({ page }, use) => { await use(new HomePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  searchResultsPage: async ({ page }, use) => { await use(new SearchResultsPage(page)); },
  productPage: async ({ page }, use) => { await use(new ProductPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
  // Explicit (NOT auto): only cart specs pay its cost. Depends on desktopLayout so the
  // device=desktop interceptor is active before this fixture's own navigation — cleanup
  // must see the same layout (and selectors) the test will.
  cleanCart: async ({ cartPage, desktopLayout }, use) => {
    void desktopLayout;
    await ensureEmptyCart(cartPage);
    await use();
  },
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
  // Rewrites every same-origin document load to carry device=desktop (the SPA keeps the
  // server-decided layout across client-side routing, so one uncovered document load flips
  // the whole test to mobile — findings §24 + design spec 2026-08-01). The teardown guard
  // only runs on passing tests: a real failure's diagnosis must never be polluted by a
  // secondary layout error.
  desktopLayout: [async ({ page }, use, testInfo) => {
    await forceDesktopLayout(page.context());
    await use();
    if (testInfo.status === 'passed') await assertDesktopLayout(page);
  }, { auto: true }],
});

export { expect };
