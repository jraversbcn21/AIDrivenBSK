import type { FunctionalMap, MapFlow, Priority } from '../../explorer/map/schema';
import type { Session } from '../../explorer/types';

export interface TestProposal {
  flowId: string;
  name: string;
  priority: Priority;
  session: Session;
  steps: string[];
  rationale: string;
  /** Historical churn events (changed/removed) touching this flow's pages or the flow
   *  itself, over the recorded run-history window (Phase 8). Absent without history. */
  driftEvents?: number;
}

export interface PlanReport {
  generatedAt: string;
  mapGeneratedAt: string;
  evidenceGeneratedAt: string;
  flows: { total: number; covered: number; uncovered: number };
  uncoveredByPriority: Record<Priority, number>;
  proposals: TestProposal[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 };

function toProposal(flow: MapFlow, driftEvents?: number): TestProposal {
  const stepsWord = flow.steps.length === 1 ? 'page' : `${flow.steps.length}-step journey`;
  const driftWord = driftEvents !== undefined && driftEvents > 0
    ? `, ${driftEvents} drift event(s) in recorded history`
    : '';
  return {
    flowId: flow.id,
    name: flow.name,
    priority: flow.priority,
    session: flow.session,
    steps: flow.steps,
    rationale: `${flow.priority}-priority ${stepsWord}, no spec exercises it${driftWord}`,
    ...(driftEvents !== undefined ? { driftEvents } : {}),
  };
}

/** Historical churn touching the flow: its step pages plus the flow id itself (Phase 8). */
function driftEventsFor(flow: MapFlow, driftById: ReadonlyMap<string, number>): number {
  let total = driftById.get(flow.id) ?? 0;
  for (const step of flow.steps) total += driftById.get(step) ?? 0;
  return total;
}

export function buildPlanReport(
  map: FunctionalMap,
  evidenceGeneratedAt: string,
  now: string,
  driftById?: ReadonlyMap<string, number>,
): PlanReport {
  const uncovered = map.flows.filter((f) => (f.coveredBy ?? []).length === 0);
  const covered = map.flows.length - uncovered.length;

  const uncoveredByPriority: Record<Priority, number> = { high: 0, med: 0, low: 0 };
  for (const f of uncovered) uncoveredByPriority[f.priority]++;

  // Drift ranks after priority, before chain depth (decision log D7): among equals,
  // drift-prone territory earns coverage first — without history, ordering is unchanged.
  const drift = (f: MapFlow): number => (driftById !== undefined ? driftEventsFor(f, driftById) : 0);
  const proposals = [...uncovered]
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      || drift(b) - drift(a)
      || b.steps.length - a.steps.length
      || a.name.localeCompare(b.name))
    .map((f) => toProposal(f, driftById !== undefined ? driftEventsFor(f, driftById) : undefined));

  return {
    generatedAt: now,
    mapGeneratedAt: map.generatedAt,
    evidenceGeneratedAt,
    flows: { total: map.flows.length, covered, uncovered: uncovered.length },
    uncoveredByPriority,
    proposals,
  };
}
