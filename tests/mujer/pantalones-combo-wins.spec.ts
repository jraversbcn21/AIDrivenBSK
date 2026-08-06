// Promoted from a Builder-generated draft (flow flow_599701798fbb, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { PantalonesComboWinsPlpPage } from './pages/PantalonesComboWinsPlpPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > pantalones: navigate home -> pantalones PLP -> combo wins % PLP', async ({ page }) => {
  const target = new PantalonesComboWinsPlpPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
