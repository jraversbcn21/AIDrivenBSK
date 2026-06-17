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
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  env: async ({}, use) => { await use(loadEnv()); },
  homePage: async ({ page }, use) => { await use(new HomePage(page)); },
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  searchResultsPage: async ({ page }, use) => { await use(new SearchResultsPage(page)); },
  productPage: async ({ page }, use) => { await use(new ProductPage(page)); },
});

export { expect };
