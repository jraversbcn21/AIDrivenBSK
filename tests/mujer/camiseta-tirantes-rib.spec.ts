// Promoted from a Builder-generated draft (flow flow_aa872dbca2f4, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { CamisetaTirantesRibPage } from './pages/CamisetaTirantesRibPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> camiseta tirantes rib PDP (personalizable variant)', async ({ page }) => {
  const target = new CamisetaTirantesRibPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
