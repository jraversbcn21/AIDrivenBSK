import type { Page } from '@playwright/test';

/**
 * Dismiss the cookie/consent banner if present. Tolerant by design: the banner
 * may not appear (already accepted via storageState), so a miss is not a failure.
 * CONFIRM the accept-button locator against DES with `playwright codegen`.
 */
export async function acceptConsent(page: Page): Promise<void> {
  const accept = page.getByRole('button', { name: /aceptar|accept/i });
  if (await accept.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await accept.first().click();
  }
}
