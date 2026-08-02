import type { Page } from '@playwright/test';
import { primaryUser } from '../data/users';

/**
 * Completes DES's in-dialog login gate if it is currently on screen, one step per call.
 *
 * Discovered live 2026-08-02 (task 6 round 2 of the desktop-layout-interceptor plan): the
 * DESKTOP checkout entry gates on a LIVE session — DES single-sessions the shared test
 * account, so login.spec's mid-suite re-auth invalidates the setup-minted storageState
 * session, and the cart's "Tramitar pedido" then opens `dialog "Inicia sesión o crea tu
 * cuenta"` instead of navigating. (The mobile layout never gated here, which is why the
 * suite passed for months without hitting this.) The login flow is the single most
 * drift-prone surface on DES (findings §19/§23 — the method-choice interstitial comes and
 * goes server-side), so both known variants are tolerated, and this lives in ONE place so
 * the next variant flip is a one-file fix.
 *
 * Designed to be called from inside an actUntil act: it performs at most one gate step per
 * call (interstitial click OR form fill+submit) and relies on the caller's retry loop for
 * progression and on the caller's verify for the truth. Every interaction is bounded at 5s
 * with a swallow-catch — the dialog can detach mid-step once the login lands, and an
 * unbounded fill on a detached locator hangs to the test timeout (root-caused live).
 *
 * @returns true if the gate was on screen and a step was attempted (the caller should not
 *          also click its own trigger in the same act iteration); false if no gate is up.
 */
export async function completeLoginGateIfPresent(page: Page): Promise<boolean> {
  const gate = page.getByRole('dialog', { name: /inicia sesión o crea tu cuenta/i });
  if (!(await gate.isVisible().catch(() => false))) return false;

  const interstitial = gate.getByRole('button', { name: /continuar con e-?mail/i });
  if (await interstitial.isVisible().catch(() => false)) {
    await interstitial.click({ timeout: 5_000 }).catch(() => undefined);
    return true; // next act iteration fills the revealed form
  }

  const { username, password } = primaryUser();
  await gate.getByRole('textbox', { name: /e-mail/i }).fill(username, { timeout: 5_000 }).catch(() => undefined);
  await gate.getByRole('textbox', { name: /contraseña/i }).fill(password, { timeout: 5_000 }).catch(() => undefined);
  await gate.getByRole('button', { name: 'Iniciar sesión' }).click({ timeout: 5_000 }).catch(() => undefined);
  return true;
}
