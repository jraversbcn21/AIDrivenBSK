import { test, expect } from '../../src/fixtures/test';
import { dismissOnboardingTour } from '../../src/support/consent';

// Temporary, read-only probe for Task 6 fix-round-2 (desktop-layout-interceptor).
// Bypasses SearchBar.search()'s own retry loop to isolate whether the /q/camiseta -> home
// bounce is caused by our retry logic re-firing, or is a genuine single-shot DES desktop
// behavior. Manual single click + single fill + single Enter, then tight URL polling.
test('probe: desktop /q/ single-shot submit + tight URL polling', async ({ homePage, page }) => {
  await homePage.open();
  console.log('URL before search:', page.url());

  const trigger = page.getByRole('button', { name: /^buscar( aquí)?$/i }).first();
  await dismissOnboardingTour(page);
  await trigger.click({ force: true });

  const input = page.getByRole('searchbox', { name: 'Buscar' }).first();
  await input.waitFor({ state: 'visible', timeout: 10_000 }).catch((e) => console.log('input never visible:', String(e)));
  console.log('input visible, url now:', page.url());

  await input.fill('camiseta');
  console.log('after fill, url:', page.url());
  await input.press('Enter');
  console.log('immediately after Enter press, url:', page.url());

  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(250);
    console.log(`+${(i + 1) * 250}ms url=${page.url()}`);
  }

  const snapshot = await page.getByRole('main').ariaSnapshot();
  console.log('=== FINAL MAIN SNAPSHOT, url:', page.url(), '===');
  console.log(snapshot);
  console.log('=== END SNAPSHOT ===');

  expect(true).toBe(true);
});
