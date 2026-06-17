import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../src/pages/LoginPage';
import { HomePage } from '../src/pages/HomePage';
import { primaryUser } from '../src/data/users';

const STATE_PATH = '.auth/state.json';

setup('authenticate', async ({ page }) => {
  const login = new LoginPage(page);
  await login.open();
  await login.login(primaryUser());

  const home = new HomePage(page);
  await expect.poll(() => home.header.isUserLoggedIn()).toBe(true);

  await page.context().storageState({ path: STATE_PATH });
});
