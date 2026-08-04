import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { acceptConsent, dismissOnboardingTour } from '../support/consent';

export class HomePage extends BasePage {
  readonly header: Header;
  /** Shared chrome, same as the header — exposed here because this is where the footer spec
   *  enters, and reusable from any other page object that needs it. */
  readonly footer: Footer;
  constructor(page: Page) {
    super(page);
    this.header = new Header(page);
    this.footer = new Footer(page);
  }
  async open(): Promise<void> {
    await this.goto();
    await acceptConsent(this.page);
    await dismissOnboardingTour(this.page);
  }
}
