import type { Page, Locator } from '@playwright/test';

type Role = Parameters<Page['getByRole']>[0];

// The test-id-like attributes confirmed on DES, in probe order (data-testid first).
// Shared with the Explorer's extraction so producer and resolver can never disagree
// about which attributes exist (design spec 2026-07-03-testid-attribute-fix-design.md).
export const TESTID_ATTRS = ['data-testid', 'data-qa-anchor', 'data-qa'] as const;
export type TestIdAttr = (typeof TESTID_ATTRS)[number];

/** A test-id hint that remembers which attribute it came from — getByTestId() only
 *  resolves data-testid, so hints from the other attributes need a raw locator. */
export interface TestIdHint {
  attr: TestIdAttr;
  value: string;
}

export interface Strategy {
  testId?: TestIdHint;
  role?: { type: Role; name: string; exact?: boolean };
  label?: string;
  placeholder?: string;
}

const PRIORITY = ['testId', 'role', 'label', 'placeholder'] as const;
export type StrategyKey = (typeof PRIORITY)[number];

export function pickStrategyKey(s: Strategy): StrategyKey {
  const key = PRIORITY.find((k) => s[k] !== undefined);
  if (!key) throw new Error('Strategy must define at least one selector (testId | role | label | placeholder)');
  return key;
}

const cssAttrEscape = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Resolve a Strategy to a Locator scoped to `scope`, honouring the priority order. */
export function locate(scope: Page | Locator, s: Strategy): Locator {
  switch (pickStrategyKey(s)) {
    case 'testId': {
      const { attr, value } = s.testId!;
      // Playwright CSS locators pierce open shadow roots, so the raw-attribute path
      // works identically on DES's bds- web components.
      return attr === 'data-testid'
        ? scope.getByTestId(value)
        : scope.locator(`[${attr}="${cssAttrEscape(value)}"]`);
    }
    case 'role': return scope.getByRole(s.role!.type, { name: s.role!.name, exact: s.role!.exact });
    case 'label': return scope.getByLabel(s.label!);
    case 'placeholder': return scope.getByPlaceholder(s.placeholder!);
  }
}
