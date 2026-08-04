// Promoted from a Builder-generated draft (interaction inter_e04838ecc799 /
// flow flow_960ceaa6b799, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { VestidosTallasOverlayPage } from './pages/VestidosTallasOverlayPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > vestidos: open and close the Tallas overlay from a PLP card', async ({ page }) => {
  const target = new VestidosTallasOverlayPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.openOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.closeOverlay();
  await expect.poll(() => target.isOverlayOpen(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(false);
});
