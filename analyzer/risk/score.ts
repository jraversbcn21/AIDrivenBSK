import type { DiffEntry, DiffKind, MapDiff } from '../../explorer/diff/differ';
import type { FunctionalMap, PageType, Priority } from '../../explorer/map/schema';
import type { FlowFailureAggregate } from '../../learning/aggregate';
import type { RiskBand, RiskEntry, RiskReport } from '../types';

/**
 * All scoring weights in one place (single reviewed point of change — deliberately code
 * constants, not env tunables: a score only means something if everyone computes it the
 * same way). Grounding for each value: design doc 2026-07-14 §4.2 / decision log D8.
 * The 0.70 high cut mirrors the repo's only existing confidence threshold
 * (autoThreshold, explorer/config.ts).
 */
export const WEIGHTS = {
  change: { removed: 0.5, changed: 0.35, added: 0.15 },
  kind: { flow: 0.2, interaction: 0.18, page: 0.15, element: 0.1, form: 0.08, component: 0.05 } satisfies Record<DiffKind, number>,
  pageType: {
    Checkout: 0.15, Cart: 0.12, PDP: 0.1, PLP: 0.06,
    Search: 0.05, Home: 0.05, Account: 0.05, Wishlist: 0.03, Other: 0,
  } satisfies Record<PageType, number>,
  coverageImpact: 0.15,
  flowPriority: { high: 0.1, med: 0.05, low: 0 } satisfies Record<Priority, number>,
  failureHistory: 0.15,
  destructiveElement: 0.05,
  testIdElement: 0.05,
  bands: { high: 0.7, med: 0.4 },
} as const;

type Change = 'added' | 'removed' | 'changed';

/** Pre-indexed lookup context over one map (built once per report, not per entry). */
interface MapIndex {
  pageById: Map<string, PageType>;
  flowById: Map<string, { steps: string[]; priority: Priority; covered: boolean }>;
  elementById: Map<string, { pageId: string; destructive: boolean; hasTestId: boolean }>;
  formPageById: Map<string, string>;
  interactionPageById: Map<string, string>;
  coveredPageIds: Set<string>;
}

function indexMap(map: FunctionalMap): MapIndex {
  const coveredPageIds = new Set<string>();
  const flowById = new Map<string, { steps: string[]; priority: Priority; covered: boolean }>();
  for (const f of map.flows) {
    const covered = (f.coveredBy ?? []).length > 0;
    flowById.set(f.id, { steps: f.steps, priority: f.priority, covered });
    if (covered) for (const p of f.steps) coveredPageIds.add(p);
  }
  return {
    pageById: new Map(map.pages.map((p) => [p.id, p.pageType])),
    flowById,
    elementById: new Map(map.elements.map((e) => [e.id, {
      pageId: e.pageId, destructive: e.destructive, hasTestId: e.selectorHints.testId != null,
    }])),
    formPageById: new Map(map.forms.map((f) => [f.id, f.pageId])),
    interactionPageById: new Map(map.interactions.map((i) => [i.id, i.pageId])),
    coveredPageIds,
  };
}

/** The page a diff entry ultimately lives on: page = itself; element/form/interaction = pageId;
 *  flow = leaf step. Components span pages (foundOnPages) — no single-page resolution. */
function resolvePageId(kind: DiffKind, id: string, idx: MapIndex): string | undefined {
  if (kind === 'page') return idx.pageById.has(id) ? id : undefined;
  if (kind === 'element') return idx.elementById.get(id)?.pageId;
  if (kind === 'form') return idx.formPageById.get(id);
  if (kind === 'interaction') return idx.interactionPageById.get(id);
  if (kind === 'flow') {
    const steps = idx.flowById.get(id)?.steps ?? [];
    return steps.length > 0 ? steps[steps.length - 1] : undefined;
  }
  return undefined;
}

/** Multi-run failure history (Phase 8): per-flow and per-page k-counts over the recorded window. */
interface HistoricalFailures {
  flowK: ReadonlyMap<string, number>;
  pageK: ReadonlyMap<string, number>;
  window: number;
}

function scoreEntry(
  change: Change, entry: DiffEntry,
  current: MapIndex, baseline: MapIndex,
  affectedFlowIds: ReadonlySet<string>, affectedPageIds: ReadonlySet<string>,
  historical: HistoricalFailures,
): RiskEntry {
  // Removed entities only exist in the baseline map; everything else resolves current-first.
  const idx = change === 'removed' ? baseline : current;
  const reasons: string[] = [`${change} ${entry.kind}`];
  let score = WEIGHTS.change[change] + WEIGHTS.kind[entry.kind];

  const pageId = resolvePageId(entry.kind, entry.id, idx);
  const pageType = pageId !== undefined ? idx.pageById.get(pageId) : undefined;
  if (pageType !== undefined && WEIGHTS.pageType[pageType] > 0) {
    score += WEIGHTS.pageType[pageType];
    reasons.push(`on a ${pageType} page`);
  }

  const flow = entry.kind === 'flow' ? idx.flowById.get(entry.id) : undefined;
  const covered = flow !== undefined
    ? flow.covered
    : pageId !== undefined && idx.coveredPageIds.has(pageId);
  if (covered) {
    score += WEIGHTS.coverageImpact;
    reasons.push('covered by a passing spec (regression surface)');
  }

  if (flow !== undefined && WEIGHTS.flowPriority[flow.priority] > 0) {
    score += WEIGHTS.flowPriority[flow.priority];
    reasons.push(`${flow.priority}-priority flow`);
  }

  // The failure-history weight fires at most once — Phase 8 upgraded its DATA (multi-run
  // window instead of single-run), not its magnitude; the historical reason wins when both
  // sources apply because it carries the k-of-n evidence.
  const currentRunHit = entry.kind === 'flow'
    ? affectedFlowIds.has(entry.id)
    : pageId !== undefined && affectedPageIds.has(pageId);
  const histK = entry.kind === 'flow'
    ? historical.flowK.get(entry.id)
    : pageId !== undefined ? historical.pageK.get(pageId) : undefined;
  if (currentRunHit || histK !== undefined) {
    score += WEIGHTS.failureHistory;
    reasons.push(histK !== undefined
      ? entry.kind === 'flow'
        ? `failure history (failed in ${histK} of last ${historical.window} recorded runs)`
        : `failure history (page on a flow that failed in ${histK} of last ${historical.window} recorded runs)`
      : 'failure history (recent failed/flaky spec touches it)');
  }

  if (entry.kind === 'element') {
    const el = idx.elementById.get(entry.id);
    if (el?.destructive) { score += WEIGHTS.destructiveElement; reasons.push('destructive element'); }
    if (el?.hasTestId) { score += WEIGHTS.testIdElement; reasons.push('testId-bearing element (generated specs may assert on it)'); }
  }

  const rounded = Math.min(1, Math.round(score * 100) / 100);
  const band: RiskBand = rounded >= WEIGHTS.bands.high ? 'high' : rounded >= WEIGHTS.bands.med ? 'med' : 'low';
  return { kind: entry.kind, id: entry.id, change, score: rounded, band, reasons };
}

export function buildRiskReport(
  diff: MapDiff,
  baselineMap: FunctionalMap,
  currentMap: FunctionalMap,
  affectedFlowIds: string[],
  opts: { now: string; history?: FlowFailureAggregate },
): RiskReport {
  const baseline = indexMap(baselineMap);
  const current = indexMap(currentMap);

  // Failure history propagates from affected flows to the pages they step through,
  // in whichever map still knows the flow (a removed flow's steps live in the baseline).
  const stepsOf = (id: string): string[] =>
    current.flowById.get(id)?.steps ?? baseline.flowById.get(id)?.steps ?? [];
  const affectedFlows = new Set(affectedFlowIds);
  const affectedPages = new Set<string>();
  for (const id of affectedFlows) for (const step of stepsOf(id)) affectedPages.add(step);

  // Multi-run history (Phase 8): same propagation, carrying each flow's k-count to its pages.
  const flowK = opts.history?.byFlow ?? new Map<string, number>();
  const pageK = new Map<string, number>();
  for (const [id, k] of flowK) {
    for (const step of stepsOf(id)) pageK.set(step, Math.max(pageK.get(step) ?? 0, k));
  }
  const historical: HistoricalFailures = { flowK, pageK, window: opts.history?.window ?? 0 };

  const entries: RiskEntry[] = [
    ...diff.removed.map((e) => scoreEntry('removed', e, current, baseline, affectedFlows, affectedPages, historical)),
    ...diff.changed.map((e) => scoreEntry('changed', e, current, baseline, affectedFlows, affectedPages, historical)),
    ...diff.added.map((e) => scoreEntry('added', e, current, baseline, affectedFlows, affectedPages, historical)),
  ].sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  const totals: Record<RiskBand, number> = { high: 0, med: 0, low: 0 };
  for (const e of entries) totals[e.band]++;

  return {
    generatedAt: opts.now,
    baselineGeneratedAt: baselineMap.generatedAt,
    currentGeneratedAt: currentMap.generatedAt,
    totals, entries,
  };
}
