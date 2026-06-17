import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { HomePage } from '../src/pages/HomePage';
import { primaryUser } from '../src/data/users';

const STATE_PATH = '.auth/state.json';

setup('authenticate', async ({ page }) => {
  // The full MMBRS login (cookie + gender gates -> SSO form -> member-hub redirect) is the
  // heaviest flow in the suite; give it more headroom than the per-test default.
  setup.setTimeout(120_000);
  const login = new LoginPage(page);
  await login.open();
  await login.login(primaryUser());

  const home = new HomePage(page);
  await expect.poll(() => home.header.isUserLoggedIn()).toBe(true);

  await page.context().storageState({ path: STATE_PATH });
});
