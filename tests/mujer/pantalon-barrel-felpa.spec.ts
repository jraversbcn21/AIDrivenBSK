// Promoted from a Builder-generated draft (flow flow_3897e29f7d4d, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { PantalonBarrelFelpaPage } from './pages/PantalonBarrelFelpaPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> pantalón barrel felpa PDP', async ({ page }) => {
  const target = new PantalonBarrelFelpaPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
