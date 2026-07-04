import type { FunctionalMap, MapPage } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';
import type { SelectorHints } from '../explorer/types';
import type { Strategy } from '../src/support/locators';
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
  const candidates = map.elements.filter((e) => e.pageId === leaf.id && !e.destructive);
  const specific = candidates.filter((e) => e.component === undefined || !SHARED_COMPONENTS.has(e.component));
  const shared = candidates.filter((e) => e.component !== undefined && SHARED_COMPONENTS.has(e.component));
  for (const pass of [specific, shared]) {
    for (const key of ['testId', 'role', 'label'] as const) {
      for (const el of pass) {
        const s = toStrategy(el.selectorHints);
        if (s !== null && key in s) return s;
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
