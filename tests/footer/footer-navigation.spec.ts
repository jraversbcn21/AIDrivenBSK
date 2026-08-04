import { test, expect } from '../../src/fixtures/test';

const HYDRATION_TIMEOUT_MS = 20_000;

test('footer: renders on home and navigates to the store locator', async ({ page, homePage }) => {
  await homePage.open();

  await expect.poll(() => homePage.footer.isVisible(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);

  await homePage.footer.goToStoreLocator();

  await expect(page).toHaveURL(/store-locator/);
});
