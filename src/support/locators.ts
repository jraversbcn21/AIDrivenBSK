import type { Page, Locator } from '@playwright/test';

type Role = Parameters<Page['getByRole']>[0];

export interface Strategy {
  testId?: string;
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

/** Resolve a Strategy to a Locator scoped to `scope`, honouring the priority order. */
export function locate(scope: Page | Locator, s: Strategy): Locator {
  switch (pickStrategyKey(s)) {
    case 'testId': return scope.getByTestId(s.testId!);
    case 'role': return scope.getByRole(s.role!.type, { name: s.role!.name, exact: s.role!.exact });
    case 'label': return scope.getByLabel(s.label!);
    case 'placeholder': return scope.getByPlaceholder(s.placeholder!);
  }
}
