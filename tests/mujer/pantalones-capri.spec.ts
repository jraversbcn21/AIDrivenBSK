// Promoted from a Builder-generated draft (flow flow_2ad0f792ba8d, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { PantalonesCapriPlpPage } from './pages/PantalonesCapriPlpPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > pantalones: navigate home -> pantalones PLP -> capri PLP', async ({ page }) => {
  const target = new PantalonesCapriPlpPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
