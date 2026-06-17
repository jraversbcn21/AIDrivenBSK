import { test, expect } from '../../src/fixtures/test';
import { primaryUser } from '../../src/data/users';

// Validate the login path itself, independent of the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test('user can log in with valid credentials', async ({ loginPage, homePage }) => {
  await loginPage.open();
  await loginPage.login(primaryUser());
  await expect.poll(() => homePage.header.isUserLoggedIn()).toBe(true);
});
