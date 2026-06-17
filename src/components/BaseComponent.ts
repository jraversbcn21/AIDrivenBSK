import type { Locator } from '@playwright/test';

/** A component is always scoped to a root Locator, never the whole page. */
export abstract class BaseComponent {
  protected readonly root: Locator;
  constructor(root: Locator) {
    this.root = root;
  }
}
