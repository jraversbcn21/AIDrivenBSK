import { BasePage } from './BasePage';
import { acceptConsent } from '../support/consent';
import type { TestUser } from '../data/users';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto('logon'); // CONFIRM the login route on DES
    await acceptConsent(this.page);
  }

  async login(user: TestUser): Promise<void> {
    await this.page.getByLabel(/email|correo/i).fill(user.username);
    await this.page.getByLabel(/contraseña|password/i).fill(user.password);
    await this.page.getByRole('button', { name: /iniciar sesión|entrar|log ?in/i }).click();
  }
}
