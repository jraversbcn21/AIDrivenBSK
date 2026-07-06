import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { SelectorHints } from '../explorer/types';
import type { Strategy, TestIdHint } from '../src/support/locators';
import type { JourneyInput } from './generate/Generator';

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
