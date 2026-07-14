import { TESTID_ATTRS, type TestIdAttr } from '../src/support/locators';
import { stripAnsi } from '../analyzer/failures/classify';

/**
 * The broken locator reconstructed from a Playwright error message — the only place it
 * exists (the failure report deliberately doesn't restructure Phase 6's contract for
 * this; decision log D4). Every recognized shape is one this project has really seen:
 * action timeouts ("waiting for …", A6 §19), strict-mode violations (M9 §17, F18 §20),
 * wait timeouts on raw CSS testId locators (M8b §16).
 */
export interface BrokenLocator {
  method: 'getByRole' | 'getByTestId' | 'getByLabel' | 'getByPlaceholder' | 'locator';
  role?: string;
  /** getByRole name option as written: a quoted string's content, or a regex literal ("/…/i"). */
  name?: string;
  /** getByTestId/getByLabel/getByPlaceholder argument, or the testId value / raw CSS for locator(). */
  value?: string;
  /** Set when a raw locator() is one of the known [data-*] testId attribute selectors. */
  testIdAttr?: TestIdAttr;
  failureMode: 'not-found' | 'strict-mode';
  raw: string;
}

// getByRole('button', { name: 'X' | /x/i, exact: true }) — the options block has no nested parens.
const GET_BY_ROLE = /getByRole\('([^']+)'(?:,\s*\{\s*name:\s*(?:'([^']*)'|(\/(?:[^/\\]|\\.)*\/[a-z]*))\s*(?:,\s*exact:\s*(?:true|false))?\s*\})?\)/;
const GET_BY_SIMPLE = /(getByTestId|getByLabel|getByPlaceholder)\('([^']*)'\)/;
const RAW_LOCATOR = /locator\('((?:[^'\\]|\\.)*)'\)/;
const TESTID_CSS = new RegExp(`^\\[(${TESTID_ATTRS.join('|')})="([^"]+)"\\]$`);

export function parseBrokenLocator(message: string | undefined): BrokenLocator | null {
  if (!message) return null;
  const clean = stripAnsi(message);
  const failureMode: BrokenLocator['failureMode'] =
    /strict mode violation/i.test(clean) ? 'strict-mode' : 'not-found';

  const role = GET_BY_ROLE.exec(clean);
  if (role) {
    const name = role[2] ?? role[3]; // quoted-string content, or the regex literal verbatim
    return {
      method: 'getByRole',
      role: role[1],
      ...(name !== undefined ? { name } : {}),
      failureMode,
      raw: role[0],
    };
  }

  const simple = GET_BY_SIMPLE.exec(clean);
  if (simple) {
    return {
      method: simple[1] as 'getByTestId' | 'getByLabel' | 'getByPlaceholder',
      value: simple[2],
      ...(simple[1] === 'getByTestId' ? { testIdAttr: 'data-testid' as const } : {}),
      failureMode,
      raw: simple[0],
    };
  }

  const rawLoc = RAW_LOCATOR.exec(clean);
  if (rawLoc) {
    const css = rawLoc[1];
    const testId = TESTID_CSS.exec(css);
    return {
      method: 'locator',
      value: testId ? testId[2] : css,
      ...(testId ? { testIdAttr: testId[1] as TestIdAttr } : {}),
      failureMode,
      raw: rawLoc[0],
    };
  }

  return null;
}
