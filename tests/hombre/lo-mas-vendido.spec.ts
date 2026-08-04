// Promoted from a Builder-generated draft (flow flow_c7db424e3c9f, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { HombreLoMasVendidoPage } from './pages/HombreLoMasVendidoPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('hombre > lo más vendido: navigate home -> h-man -> lo más vendido PLP', async ({ page }) => {
  const target = new HombreLoMasVendidoPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
