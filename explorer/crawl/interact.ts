import type { ExtractedElement } from '../types';
import { routePattern } from '../url';

const CLICKABLE_TYPES = new Set(['button', 'filter', 'sort']);
const CHROME = new Set(['Header', 'Footer', 'MiniCart']);

export class InteractionLedger {
  private readonly claimed = new Set<string>();

  tryClaim(el: ExtractedElement, path: string): boolean {
    const scope = el.component !== undefined && CHROME.has(el.component) ? 'chrome' : routePattern(path);
    const key = `${scope}|${el.role}|${el.label}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}

export function selectCandidates(
  elements: ExtractedElement[], path: string, ledger: InteractionLedger, maxPerPage: number,
): ExtractedElement[] {
  const picked: ExtractedElement[] = [];
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!CLICKABLE_TYPES.has(el.type) || el.destructive) continue;
    const name = el.selectorHints.role?.name;
    if (name === undefined || name === '') continue;
    if (!ledger.tryClaim(el, path)) continue;
    picked.push(el);
  }
  return picked;
}
