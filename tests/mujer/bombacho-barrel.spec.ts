// Promoted from a Builder-generated draft (flow flow_0e406081fa85, map generated 2026-07-13).
import { test, expect } from '../../src/fixtures/test';
import { BombachoBarrelPage } from './pages/BombachoBarrelPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > pantalones: navigate home -> pantalones PLP -> bombacho | barrel PDP', async ({ page }) => {
  const target = new BombachoBarrelPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
