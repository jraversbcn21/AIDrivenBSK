// Promoted from a Builder-generated draft (flow flow_02bc901d3ab6, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { PantalonFelpaBandaLateralPage } from './pages/PantalonFelpaBandaLateralPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> pantalón felpa banda lateral PDP', async ({ page }) => {
  const target = new PantalonFelpaBandaLateralPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
