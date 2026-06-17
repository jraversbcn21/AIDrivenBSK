import { BaseComponent } from './BaseComponent';

export class SearchBar extends BaseComponent {
  async search(term: string): Promise<void> {
    const input = this.root.getByRole('searchbox');
    await input.click();
    await input.fill(term);
    await input.press('Enter');
  }
}
