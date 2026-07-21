import { BasePage } from './BasePage';
import { acceptConsent } from '../support/consent';
import { actUntil } from '../support/retry';
import type { TestUser } from '../data/users';

/**
 * DES login is the "BERSHKA MMBRS" flow:
 *   home -> entry gates -> /es/logon.html -> e-mail+password form.
 * Reaching /es/logon.html requires the entry gates (cookie + gender) to have been passed,
 * otherwise it redirects back to the locale home.
 *
 * VARIANT HISTORY — do NOT "simplify" this back to a single variant (findings §4/§19/§23):
 * /es/logon.html is SERVER-SIDE VARIANT-SWITCHED between two shapes, confirmed live:
 *   - §4 (2026-06-17, original recipe): a "Continuar con e-mail" method-choice interstitial
 *     must be clicked before the e-mail+password form exists (variant A).
 *   - §19 (2026-07-12, backlog A6): the interstitial vanished — the e-mail+password form
 *     rendered directly, 2/2 fresh sessions; the interstitial click was removed (variant B).
 *   - §23 (2026-07-18, D15-f2 Task 1): the interstitial is BACK — variant-B-only login()
 *     failed 2/2. login() now detects and handles BOTH variants at runtime.
 * §23's live evidence on the interstitial click: rapid force:true clicks were ALL silently
 * lost (57 clicks/60s, form never opened); one plain actionability-waiting click() after the
 * element settled worked. Hence the patient plain-click cadence below — never force here.
 */
export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto();                 // locale home (/es/)
    await acceptConsent(this.page);    // cookie + gender entry gates
    await this.goto('logon.html');     // members login page
    // No waitForLoadState('networkidle'): the site's constant third-party beacons mean the
    // network never goes idle. The cookie banner is handled by the auto-dismiss handler
    // installed in acceptConsent; login() relies on Playwright auto-waiting for the form.
  }

  async login(user: TestUser): Promise<void> {
    const email = this.page.getByRole('textbox', { name: /e-?mail/i });
    const interstitial = this.page.getByRole('button', { name: /continuar con e-?mail/i });

    // Variant detection: poll until the server-chosen shape reveals itself — EITHER the
    // e-mail textbox (variant B, direct form) OR the "Continuar con e-mail" interstitial
    // (variant A). Both hydrate late (findings §4: "textbox E-mail — hydrates late").
    await actUntil({
      verify: async () => (await email.isVisible()) || (await interstitial.isVisible()),
      deadlineMs: 30_000,
      sleepMs: 500,
      sleep: (ms) => this.page.waitForTimeout(ms),
      immediateFirstCheck: true,
      onTimeout: () => {
        throw new Error(
          'LoginPage: neither the e-mail form (variant B) nor the "Continuar con e-mail" ' +
          'interstitial (variant A) rendered on logon.html within the deadline — ' +
          'a THIRD variant or a degraded shell (findings §7)?',
        );
      },
    });

    // Variant A: click the interstitial until the e-mail form appears. PLAIN click, patient
    // cadence — §23's live evidence: rapid force:true clicks were all silently lost; the
    // plain actionability-waiting click on a settled element is what worked. Do not force.
    if (!(await email.isVisible())) {
      await actUntil({
        act: () => interstitial.click({ timeout: 5_000 }),
        verify: () => email.isVisible(),
        deadlineMs: 45_000,
        sleepMs: 5_000,
        sleep: (ms) => this.page.waitForTimeout(ms),
        onTimeout: () => {
          throw new Error(
            'LoginPage: the "Continuar con e-mail" interstitial never yielded the e-mail ' +
            'form despite repeated plain clicks (variant A path, findings §23)',
          );
        },
      });
    }

    await email.waitFor({ state: 'visible' });
    await email.fill(user.username);
    await this.page.getByRole('textbox', { name: /contraseña|password/i }).fill(user.password);
    // On the logon page the only "Iniciar sesión" button is the form submit; .last() stays
    // correct even if the header affordance is also present.
    await this.page.getByRole('button', { name: /iniciar sesión/i }).last().click();
    // Wait for the post-login redirect (member hub) by URL, NOT networkidle — the member
    // hub streams third-party beacons indefinitely, so the network never goes idle.
    await this.page.waitForURL(/member-hub|\/account/i, { timeout: 30_000 }).catch(() => undefined);
  }
}
