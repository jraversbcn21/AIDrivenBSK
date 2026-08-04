// Promoted from a Builder-generated draft (flow flow_53dba444a25e, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { HombreComboWinsPage } from './pages/HombreComboWinsPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('hombre > combo wins: navigate home -> h-man -> combo wins PLP', async ({ page }) => {
  const target = new HombreComboWinsPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
