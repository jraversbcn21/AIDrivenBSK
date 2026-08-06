// Promoted from a Builder-generated draft (flow flow_ad9480462ea2, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { PantalonCapriFelpaBandaLateralPage } from './pages/PantalonCapriFelpaBandaLateralPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> pantalón capri felpa banda lateral PDP', async ({ page }) => {
  const target = new PantalonCapriFelpaBandaLateralPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
