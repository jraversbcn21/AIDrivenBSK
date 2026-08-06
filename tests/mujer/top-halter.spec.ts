// Promoted from a Builder-generated draft (flow flow_8cafc56f4bbc, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { TopHalterPage } from './pages/TopHalterPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> top halter PDP', async ({ page }) => {
  const target = new TopHalterPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
