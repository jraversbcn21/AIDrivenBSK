import { BasePage } from './BasePage';
import { acceptConsent } from '../support/consent';
import type { TestUser } from '../data/users';

/**
 * DES login is the multi-step "BERSHKA MMBRS" flow:
 *   home -> entry gates -> /es/logon.html -> "Continuar con e-mail" -> e-mail+password form.
 * Reaching /es/logon.html requires the entry gates (cookie + gender) to have been passed,
 * otherwise it redirects back to the locale home.
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
    await this.page.getByRole('button', { name: /continuar con e-?mail/i }).click();
    const email = this.page.getByRole('textbox', { name: /e-?mail/i });
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
