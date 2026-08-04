// Promoted from a Builder-generated draft (flow flow_23fed0ba795d, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { HombreCamisasPage } from './pages/HombreCamisasPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('hombre > camisas: navigate home -> h-man -> camisas PLP', async ({ page }) => {
  const target = new HombreCamisasPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
