import type { ExtractedElement } from '../types';
import type { AriaNode } from '../extract/aria';
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

/** Overlay nodes (role dialog|menu, keyed role+name) present in `after` but not `before`.
 *  DES overlays are dialogs (Tallas, filter drawer, mobile-nav — findings §5/§7); menu
 *  covers plain dropdowns. Deliberately NOT a generic tree diff (spec §3). */
export function newOverlayNodes(before: AriaNode[], after: AriaNode[]): AriaNode[] {
  const OVERLAY_ROLES = new Set(['dialog', 'menu']);
  const overlaySig = (n: AriaNode): string => `${n.role}|${n.name ?? ''}`;

  const seen = new Set<string>();
  const collectBefore = (n: AriaNode): void => {
    if (OVERLAY_ROLES.has(n.role)) seen.add(overlaySig(n));
    n.children.forEach(collectBefore);
  };
  before.forEach(collectBefore);

  const found: AriaNode[] = [];
  const collectAfter = (n: AriaNode): void => {
    if (OVERLAY_ROLES.has(n.role) && !seen.has(overlaySig(n))) {
      found.push(n);
      return; // the whole subtree belongs to this overlay
    }
    n.children.forEach(collectAfter);
  };
  after.forEach(collectAfter);
  return found;
}
