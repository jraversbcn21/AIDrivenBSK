import type { FailureCategory } from '../types';

// The JSON reporter embeds ANSI color codes in error messages; strip before matching.
// eslint-disable-next-line no-control-regex -- ESC () is exactly the byte being stripped
const ANSI_PATTERN = new RegExp('\\u001b\\[[0-9;]*m', 'g');

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Deterministic first-match signature rules, most specific first (the B13 lesson:
 * deterministic/specific signals before loose text signals). Every pattern is anchored
 * to a real, observed failure signature — the exact diagnostics this framework's page
 * objects throw (src/pages, src/components) or documented Playwright failure shapes.
 * Order matters and is locked by unit tests:
 * - selector-drift before timeout: the A6-family shape ("locator.click: Test timeout of
 *   Nms exceeded ... waiting for getByRole(...)") contains both signatures.
 * - assertion's "waiting for expect(locator)" must not be eaten by selector-drift, so the
 *   selector rule requires "waiting for locator/getBy" adjacency (no "expect(" between).
 */
const RULES: ReadonlyArray<{ category: FailureCategory; pattern: RegExp }> = [
  { category: 'infrastructure', pattern: /net::ERR_|ENOTFOUND|ECONNREFUSED|Cannot navigate to invalid URL/i },
  { category: 'catalog-drift', pattern: /no standard-add-to-cart product found/i },
  {
    category: 'environment-noise',
    pattern: /dead \/q\/ load|did not reach the \/q\/ results URL|size-selection dialog did not open|size dialog did not close|did not navigate to a product detail page/i,
  },
  { category: 'selector-drift', pattern: /strict mode violation|waiting for (locator|getBy)/i },
  { category: 'assertion', pattern: /expect\(|expect\.poll/ },
  { category: 'timeout', pattern: /(Test timeout of|Timeout) \d+ms exceeded/i },
];

export function classifyFailureMessage(message: string | undefined): FailureCategory {
  if (!message) return 'unknown';
  const clean = stripAnsi(message);
  for (const rule of RULES) {
    if (rule.pattern.test(clean)) return rule.category;
  }
  return 'unknown';
}
