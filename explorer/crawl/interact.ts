import type { ExtractedElement, ExtractedInteraction, PageMeta } from '../types';
import { type AriaNode, parseAriaSnapshot } from '../extract/aria';
import { routePattern } from '../url';
import { waitForSettle, type SettleOptions } from './settle';
import { analyzeAriaNodes } from '../extract/analyzeAria';

const CLICKABLE_TYPES = new Set(['button', 'filter', 'sort']);
const CHROME = new Set(['Header', 'Footer', 'MiniCart']);

/** Canonical equivalence class for a label: the source of the first matching pattern,
 *  or the label itself. "Añadir a la cesta Short denim mini" and "Añadir a la cesta
 *  Vestido corsé" collapse into one class (design 2026-07-05-m8b §3.1). */
export function labelClass(label: string, patterns: RegExp[]): string {
  const p = patterns.find((r) => r.test(label));
  return p !== undefined ? p.source : label;
}

/** Ledger-only scope: routePattern plus all category PLPs (`...-n{digits}.html`)
 *  collapsed into one shared scope. Deliberately NOT routePattern itself — that
 *  feeds the map schema and the differ (design §3.3). */
export function interactionScope(path: string): string {
  const p = routePattern(path);
  return /-n\d+\.html$/i.test(p) ? '-n{id}.html' : p;
}

export class InteractionLedger {
  private readonly claimed = new Set<string>();
  private readonly satisfied = new Set<string>();

  constructor(private readonly mustCapture: RegExp[] = []) {}

  /** The pattern class for a must-capture label, or null if no pattern matches. */
  mustCaptureClass(label: string): string | null {
    const p = this.mustCapture.find((r) => r.test(label));
    return p !== undefined ? p.source : null;
  }

  isSatisfied(cls: string): boolean {
    return this.satisfied.has(cls);
  }

  /** Call with an interaction trigger's label when its outcome was `overlay`. */
  markSatisfied(label: string): void {
    const cls = this.mustCaptureClass(label);
    if (cls !== null) this.satisfied.add(cls);
  }

  unsatisfiedPatterns(): string[] {
    return this.mustCapture.filter((r) => !this.satisfied.has(r.source)).map((r) => r.source);
  }

  tryClaim(el: ExtractedElement, path: string): boolean {
    const scope = el.component !== undefined && CHROME.has(el.component) ? 'chrome' : interactionScope(path);
    const key = `${scope}|${el.role}|${labelClass(el.label, this.mustCapture)}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}

function eligible(el: ExtractedElement): boolean {
  if (!CLICKABLE_TYPES.has(el.type) || el.destructive) return false;
  const name = el.selectorHints.role?.name;
  return name !== undefined && name !== '';
}

export function selectCandidates(
  elements: ExtractedElement[], path: string, ledger: InteractionLedger, maxPerPage: number,
): ExtractedElement[] {
  const picked: ExtractedElement[] = [];

  // Pass 1: unsatisfied must-capture classes, one per class per page, ahead of the
  // extraction-order race. No ordinary claim: the class is retried on later pages
  // until it yields an overlay — a hydration-lost click must not burn it (design §3.2).
  const pickedClasses = new Set<string>();
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!eligible(el)) continue;
    const cls = ledger.mustCaptureClass(el.label);
    if (cls === null || ledger.isSatisfied(cls) || pickedClasses.has(cls)) continue;
    pickedClasses.add(cls);
    picked.push(el);
  }

  // Pass 2: ordinary candidates. Must-capture-classed elements never claim here —
  // unsatisfied ones are pass 1's job, satisfied ones are done for the crawl.
  for (const el of elements) {
    if (picked.length >= maxPerPage) break;
    if (!eligible(el)) continue;
    if (ledger.mustCaptureClass(el.label) !== null) continue;
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
