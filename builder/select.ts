import type {
  FunctionalMap, MapPage, MapFlow, MapElement,
} from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { SelectorHints } from '../explorer/types';
import type { Strategy, TestIdHint } from '../src/support/locators';
import type { JourneyInput, InteractionJourneyInput } from './generate/Generator';

// Route-based on purpose: the map's pageType 'Checkout' labels are unreliable (backlog B13),
// and the checkoutAllowed rule must never depend on them.
const CHECKOUT_ROUTE = /checkout|pago|payment|purchase/i;

export interface SkippedProposal {
  flowId: string;
  reason: string;
}

export interface Selection {
  journeys: JourneyInput[];
  skipped: SkippedProposal[];
}

function toStrategy(hints: SelectorHints): Strategy | null {
  // Legacy tolerance (the only one in the codebase, per the M7 design spec §4): schema-1.2
  // maps carried provenance-less string testIds — the untrustworthy data M7 replaced.
  // A string-shaped hint is ignored so it can never surface as an unresolvable Strategy
  // (M6b's live failure mode, findings §11); the element's role/label still apply.
  if (hints.testId !== undefined && typeof hints.testId === 'object' && hints.testId !== null) {
    return { testId: hints.testId };
  }
  if (hints.role !== undefined && hints.role.name !== '') {
    return { role: { type: hints.role.type as NonNullable<Strategy['role']>['type'], name: hints.role.name } };
  }
  if (hints.label !== undefined) return { label: hints.label };
  return null;
}

type Tier = 'testId' | 'role' | 'label';

// Tier-aware sibling of toStrategy: yields the strategy for one specific tier, so an
// element whose testId is disqualified (B16) can still contribute its role/label hint
// in a later tier — deprioritize, not exclude (B14 precedent).
function strategyForTier(hints: SelectorHints, tier: Tier): Strategy | null {
  if (tier === 'testId' && hints.testId !== undefined && typeof hints.testId === 'object' && hints.testId !== null) {
    return { testId: hints.testId };
  }
  if (tier === 'role' && hints.role !== undefined && hints.role.name !== '') {
    return { role: { type: hints.role.type as NonNullable<Strategy['role']>['type'], name: hints.role.name } };
  }
  if (tier === 'label' && hints.label !== undefined) return { label: hints.label };
  return null;
}

// Shared chrome (Header/Footer/MiniCart) proves the app shell rendered, not that the leaf
// page did — deprioritized pass-major, never excluded (design spec 2026-07-04, B14).
const SHARED_COMPONENTS = new Set<string>(['Header', 'Footer', 'MiniCart']);

/** First non-destructive element whose best hint matches the framework's selector
 *  priority (testId -> role -> label); null means the template falls back to the
 *  main landmark. Pass-major (B14): the tier order runs over page-specific candidates
 *  first, and over shared chrome only when no page-specific candidate has any hint.
 *  Deterministic: map element order within each pass. testId is trustworthy again
 *  since M7 (attribute provenance — design spec 2026-07-03-testid-attribute-fix-design.md). */
function loadedSignalFor(map: FunctionalMap, leaf: MapPage): Strategy | null {
  // Revealed elements (M8) only exist after an interaction — asserting one in isLoaded()
  // would always time out on a freshly-loaded page (the exact failure mode B14/M7 closed).
  // B16: a testId repeated among the page's elements resolves to a multi-element locator
  // live (strict-mode violation), so only page-unique testIds are eligible in the testId
  // tier; the element still competes in the role/label tiers. Counted page-wide (including
  // revealed/destructive instances) because Playwright resolves against the DOM, not
  // against our candidate filter. Note the deliberate asymmetry: interaction *triggers*
  // use .first() on a repeated testId instead ("any exemplar opens the overlay").
  const testIdCounts = new Map<string, number>();
  for (const e of map.elements) {
    if (e.pageId !== leaf.id) continue;
    const t = e.selectorHints.testId;
    if (t !== undefined && typeof t === 'object' && t !== null) {
      const k = `${t.attr}=${t.value}`;
      testIdCounts.set(k, (testIdCounts.get(k) ?? 0) + 1);
    }
  }
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive && e.revealedBy === undefined);
  const specific = candidates.filter((e) => e.component === undefined || !SHARED_COMPONENTS.has(e.component));
  const shared = candidates.filter((e) => e.component !== undefined && SHARED_COMPONENTS.has(e.component));
  for (const pass of [specific, shared]) {
    for (const tier of ['testId', 'role', 'label'] as const) {
      for (const el of pass) {
        const s = strategyForTier(el.selectorHints, tier);
        if (s === null) continue;
        if (tier === 'testId') {
          const t = s.testId as TestIdHint;
          if ((testIdCounts.get(`${t.attr}=${t.value}`) ?? 0) !== 1) continue;
        }
        return s;
      }
    }
  }
  return null;
}

// Detects a re-crawl between `pnpm plan` and `pnpm build-tests`: without this, a stale
// proposals.json surfaces only as N confusing per-proposal "page id missing from the map"
// skips instead of one clear "proposals are stale, re-run pnpm plan" error (audit finding F9).
export function mapIsStale(report: PlanReport, map: FunctionalMap): boolean {
  return report.mapGeneratedAt !== map.generatedAt;
}

export function selectJourneys(report: PlanReport, map: FunctionalMap, top: number): Selection {
  const pageById = new Map(map.pages.map((p) => [p.id, p]));
  const journeys: JourneyInput[] = [];
  const skipped: SkippedProposal[] = [];

  for (const proposal of report.proposals) {
    if (journeys.length >= top) break;
    const pages = proposal.steps.map((id) => pageById.get(id));
    if (pages.length === 0) {
      skipped.push({ flowId: proposal.flowId, reason: 'proposal has an empty steps array — nothing to walk' });
      continue;
    }
    if (pages.some((p) => p === undefined)) {
      skipped.push({ flowId: proposal.flowId, reason: 'references a page id missing from the map (stale proposals? re-run pnpm plan)' });
      continue;
    }
    const chain = (pages as MapPage[]).map((p) => ({ path: p.path, routePattern: p.routePattern, title: p.title }));
    if (chain.some((s) => CHECKOUT_ROUTE.test(s.path))) {
      skipped.push({ flowId: proposal.flowId, reason: 'checkout-looking route, skipped by path guard' });
      continue;
    }
    const leaf = (pages as MapPage[])[pages.length - 1];
    journeys.push({
      flowId: proposal.flowId,
      journeyName: proposal.name,
      session: proposal.session,
      chain,
      loadedSignal: loadedSignalFor(map, leaf),
      mapGeneratedAt: map.generatedAt,
    });
  }

  return { journeys, skipped };
}

export interface InteractionSelection {
  journeys: InteractionJourneyInput[];
  // flowId carries the interaction id here — the skip list predates interactions.
  skipped: SkippedProposal[];
}

/** Must-capture patterns with no satisfying overlay capture anywhere in the map —
 *  the CLI's non-fatal staleness warning ("re-crawl with pnpm explore --update"). */
export function unsatisfiedMustCapture(map: FunctionalMap, mustCapture: RegExp[]): string[] {
  return mustCapture
    .filter((r) => !map.interactions.some((i) => {
      if (i.outcome !== 'overlay') return false;
      const trigger = map.elements.find((e) => e.id === i.triggerElementId);
      return trigger !== undefined && r.test(trigger.label);
    }))
    .map((r) => r.source);
}

/** One interaction spec per must-capture overlay capture in the map (M9 design §3).
 *  Selection is map-only — no PlanReport: the navigation chain is inherited from the
 *  flow whose leaf is the interaction's page (pages are per-session, so this fixes
 *  the session too). */
export function selectInteractionJourneys(map: FunctionalMap, mustCapture: RegExp[]): InteractionSelection {
  const journeys: InteractionJourneyInput[] = [];
  const skipped: SkippedProposal[] = [];
  const pageById = new Map(map.pages.map((p) => [p.id, p]));
  const flowByLeaf = new Map<string, MapFlow>();
  for (const f of map.flows) {
    const leafId = f.steps[f.steps.length - 1];
    if (leafId !== undefined && !flowByLeaf.has(leafId)) flowByLeaf.set(leafId, f);
  }

  for (const interaction of map.interactions) {
    if (interaction.outcome !== 'overlay') continue;
    // .find() = first match on purpose: the canonical map has duplicate element ids
    // (label+page-derived ids collide; observed 2026-07-06, recorded as a finding).
    const trigger = map.elements.find((e) => e.id === interaction.triggerElementId);
    if (trigger === undefined) {
      skipped.push({ flowId: interaction.id, reason: 'trigger element missing from the map' });
      continue;
    }
    if (!mustCapture.some((r) => r.test(trigger.label))) continue; // out of M9 scope, not a defect
    const flow = flowByLeaf.get(interaction.pageId);
    if (flow === undefined) {
      skipped.push({ flowId: interaction.id, reason: 'no flow ends at the interaction page (stale map?)' });
      continue;
    }
    const pages = flow.steps.map((id) => pageById.get(id));
    if (pages.some((p) => p === undefined)) {
      skipped.push({ flowId: interaction.id, reason: 'flow references a page id missing from the map' });
      continue;
    }
    const chain = (pages as MapPage[]).map((p) => ({ path: p.path, routePattern: p.routePattern, title: p.title }));
    if (chain.some((s) => CHECKOUT_ROUTE.test(s.path))) {
      skipped.push({ flowId: interaction.id, reason: 'checkout-looking route, skipped by path guard' });
      continue;
    }
    const triggerStrategy = toStrategy(trigger.selectorHints);
    if (triggerStrategy === null) {
      skipped.push({ flowId: interaction.id, reason: 'trigger has no usable selector hint' });
      continue;
    }
    const revealed = interaction.revealedElementIds
      .map((id) => map.elements.find((e) => e.id === id))
      .filter((e): e is MapElement => e !== undefined);
    const overlayIsDialog = revealed.some((e) => e.selectorHints.role?.type === 'dialog');
    let overlayElementSignal: Strategy | null = null;
    if (!overlayIsDialog) {
      for (const e of revealed) {
        const s = toStrategy(e.selectorHints);
        if (s !== null) { overlayElementSignal = s; break; }
      }
      if (overlayElementSignal === null) {
        skipped.push({ flowId: interaction.id, reason: 'no verifiable overlay open-signal (no dialog role, no usable revealed hint)' });
        continue;
      }
    }
    const leaf = (pages as MapPage[])[pages.length - 1];
    journeys.push({
      flowId: flow.id,
      interactionId: interaction.id,
      journeyName: `${flow.name} => overlay "${trigger.label}"`,
      session: flow.session,
      chain,
      loadedSignal: loadedSignalFor(map, leaf),
      mapGeneratedAt: map.generatedAt,
      trigger: triggerStrategy,
      triggerLabel: trigger.label,
      overlayIsDialog,
      overlayElementSignal,
    });
  }
  return { journeys, skipped };
}
