import { TESTID_ATTRS } from '../../src/support/locators';
import type { SelectorHints } from '../types';

const ROLE_BY_TAG: Record<string, string> = {
  a: 'link', button: 'button', nav: 'navigation', header: 'banner',
  footer: 'contentinfo', main: 'main', form: 'form', dialog: 'dialog',
};

export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const t = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (t === 'search') return 'searchbox';
    if (t === 'submit' || t === 'button') return 'button';
    if (t === 'checkbox') return 'checkbox';
    return 'textbox';
  }
  return ROLE_BY_TAG[tag] ?? tag;
}

export function hintsFor(el: Element): SelectorHints {
  const hints: SelectorHints = {};
  for (const attr of TESTID_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) {
      hints.testId = { attr, value };
      break;
    }
  }
  const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (name) hints.role = { type: roleOf(el), name };
  const label = el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? undefined;
  if (label) hints.label = label;
  return hints;
}
