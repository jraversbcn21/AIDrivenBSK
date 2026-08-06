// Promoted from a Builder-generated draft (flow flow_571ec8059931, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { ChaquetaCapuchaCremalleraFelpaPage } from './pages/ChaquetaCapuchaCremalleraFelpaPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> chaqueta capucha cremallera felpa PDP', async ({ page }) => {
  const target = new ChaquetaCapuchaCremalleraFelpaPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
