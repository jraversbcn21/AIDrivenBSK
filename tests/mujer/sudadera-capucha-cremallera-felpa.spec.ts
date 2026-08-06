// Promoted from a Builder-generated draft (flow flow_f03ba360f315, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { SudaderaCapuchaCremalleraFelpaPage } from './pages/SudaderaCapuchaCremalleraFelpaPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> sudadera capucha cremallera felpa PDP', async ({ page }) => {
  const target = new SudaderaCapuchaCremalleraFelpaPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
