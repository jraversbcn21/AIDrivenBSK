import type { Page } from '@playwright/test';
import type { PageExtraction } from '../types';

// DES carries test-id-like attributes on at least some elements (data-qa-anchor="filterButton"
// confirmed live — findings §7). The a11y tree does not expose attributes, so probe the DOM via
// role locators (they pierce shadow DOM). Best-effort by design: strict-mode ambiguity or a
// timeout simply leaves the hint unset — absence is itself signal (foundation Risk #1).
const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;

type RoleType = Parameters<Page['getByRole']>[0];

export async function enrichTestIds(page: Page, extraction: PageExtraction, cap = 40): Promise<void> {
  const targets = extraction.elements.filter((e) => e.selectorHints.role?.name).slice(0, cap);
  for (const el of targets) {
    const role = el.selectorHints.role;
    if (!role) continue;
    try {
      const loc = page.getByRole(role.type as RoleType, { name: role.name, exact: true }).first();
      for (const attr of TESTID_ATTRS) {
        const value = await loc.getAttribute(attr, { timeout: 250 });
        if (value) {
          el.selectorHints.testId = value;
          break;
        }
      }
    } catch {
      // best-effort: leave hints as-is
    }
  }
}
