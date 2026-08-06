// Promoted from a Builder-generated draft (flow flow_6eba98046c4e, map generated 2026-07-30).
import { test, expect } from '../../src/fixtures/test';
import { CamisetaMangaLargaCuelloRedondoPage } from './pages/CamisetaMangaLargaCuelloRedondoPage';

const HYDRATION_TIMEOUT_MS = 20_000;

test('mujer > combo wins: navigate home -> combo wins PLP -> camiseta manga larga cuello redondo PDP', async ({ page }) => {
  const target = new CamisetaMangaLargaCuelloRedondoPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
});
