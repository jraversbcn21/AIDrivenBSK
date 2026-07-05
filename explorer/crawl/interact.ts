import type { ExtractedElement, ExtractedInteraction, PageMeta } from '../types';
import { type AriaNode, parseAriaSnapshot } from '../extract/aria';
import { routePattern } from '../url';
import { waitForSettle, type SettleOptions } from './settle';
import { analyzeAriaNodes } from '../extract/analyzeAria';

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

/** Abstraction over Playwright so `discoverInteractions` is unit-testable with a scripted fake. */
export interface InteractionDriver {
  snapshot(): Promise<string>; // body ariaSnapshot
  click(role: string, name: string): Promise<void>;
  pressEscape(): Promise<void>;
  currentPath(): string; // normalized
  /** Recover the original page: goto(originalPath) + consent + settle. */
  recover(): Promise<void>;
  wait(ms: number): Promise<void>;
}

export const INTERACT_SETTLE: SettleOptions = { minWaitMs: 1000, pollIntervalMs: 500, maxWaitMs: 5000 };
export const MAX_CLICK_ATTEMPTS = 3;
export const MAX_CLOSE_ATTEMPTS = 3;

/**
 * The act->verify->retry interaction-discovery protocol (CLAUDE.md's "Interaction reliability"
 * rule, applied to crawling): click a candidate, settle, and classify what happened —
 * `overlay` (a new dialog/menu appeared; extract its contents, then close it with Escape,
 * falling back to a full page `recover()` if it won't close), `navigated` (the click left the
 * page; record where and recover, aborting remaining candidates if recovery itself fails —
 * there's no safe page left to keep clicking on), or `none` (no observable change after
 * `MAX_CLICK_ATTEMPTS` clicks — a lost hydration click and a genuine no-op look identical from
 * outside, so this is a bounded give-up, not a claim the element does nothing).
 *
 * A driver exception on one candidate (e.g. the click throws, or `snapshot()` throws mid-protocol
 * with a navigation in flight) skips just that candidate — logged via `console.warn` — so one bad
 * element doesn't abort discovery for the rest of the page. Before moving on, the page state is
 * recovered if the exception left it on a foreign path: if recovery succeeds, the next candidate
 * proceeds normally; if recovery fails (or itself throws), remaining candidates for this page are
 * aborted, mirroring the `navigated`-outcome recovery-failure semantics above.
 */
export async function discoverInteractions(
  driver: InteractionDriver,
  candidates: ExtractedElement[],
  meta: PageMeta,
): Promise<ExtractedInteraction[]> {
  const results: ExtractedInteraction[] = [];
  for (const el of candidates) {
    const role = el.selectorHints.role;
    if (role === undefined) continue;
    try {
      const before = await driver.snapshot();
      let outcome: ExtractedInteraction | null = null;
      for (let attempt = 0; attempt < MAX_CLICK_ATTEMPTS && outcome === null; attempt++) {
        await driver.click(role.type, role.name);
        await waitForSettle(() => driver.snapshot(), (ms) => driver.wait(ms), INTERACT_SETTLE);

        if (driver.currentPath() !== meta.path) {
          const navigatedTo = driver.currentPath();
          await driver.recover();
          outcome = {
            trigger: { role: el.role, label: el.label, type: el.type },
            outcome: 'navigated',
            revealedElements: [],
            revealedLinks: [],
            navigatedTo,
          };
          results.push(outcome);
          if (driver.currentPath() !== meta.path) return results; // recovery failed — abort page
          break;
        }

        const after = await driver.snapshot();
        const overlays = newOverlayNodes(parseAriaSnapshot(before), parseAriaSnapshot(after));
        if (overlays.length > 0) {
          const revealed = analyzeAriaNodes(overlays, meta);
          outcome = {
            trigger: { role: el.role, label: el.label, type: el.type },
            outcome: 'overlay',
            revealedElements: revealed.elements,
            revealedLinks: revealed.links,
          };
          results.push(outcome);
          // Close: Escape until the overlay is gone, else recover the page wholesale.
          let closed = false;
          for (let c = 0; c < MAX_CLOSE_ATTEMPTS && !closed; c++) {
            await driver.pressEscape();
            const now = await driver.snapshot();
            closed = newOverlayNodes(parseAriaSnapshot(before), parseAriaSnapshot(now)).length === 0;
          }
          if (!closed) await driver.recover();
        }
      }
      if (outcome === null) {
        results.push({
          trigger: { role: el.role, label: el.label, type: el.type },
          outcome: 'none',
          revealedElements: [],
          revealedLinks: [],
        });
      }
    } catch (err) {
      console.warn(`interaction skipped on ${meta.path} ("${el.label}"): ${String(err)}`);
      // Recover page state so the next candidate starts from the original page —
      // an exception mid-protocol can leave the page navigated away or with an
      // overlay still open (final-review finding; design spec §9.4's stray-overlay lead).
      try {
        if (driver.currentPath() !== meta.path) await driver.recover();
        if (driver.currentPath() !== meta.path) return results; // recovery failed — abort page
      } catch {
        return results; // recovery itself threw — abort remaining candidates for this page
      }
    }
  }
  return results;
}
