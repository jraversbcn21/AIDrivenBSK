import type { FunctionalMap, MapFlow, Priority } from '../../explorer/map/schema';
import type { Session } from '../../explorer/types';

export interface TestProposal {
  flowId: string;
  name: string;
  priority: Priority;
  session: Session;
  steps: string[];
  rationale: string;
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

function toProposal(flow: MapFlow): TestProposal {
  const stepsWord = flow.steps.length === 1 ? 'page' : `${flow.steps.length}-step journey`;
  return {
    flowId: flow.id,
    name: flow.name,
    priority: flow.priority,
    session: flow.session,
    steps: flow.steps,
    rationale: `${flow.priority}-priority ${stepsWord}, no spec exercises it`,
  };
}

export function buildPlanReport(map: FunctionalMap, evidenceGeneratedAt: string, now: string): PlanReport {
  const uncovered = map.flows.filter((f) => (f.coveredBy ?? []).length === 0);
  const covered = map.flows.length - uncovered.length;

  const uncoveredByPriority: Record<Priority, number> = { high: 0, med: 0, low: 0 };
  for (const f of uncovered) uncoveredByPriority[f.priority]++;

  const proposals = [...uncovered]
    .sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      || b.steps.length - a.steps.length
      || a.name.localeCompare(b.name))
    .map(toProposal);

  return {
    generatedAt: now,
    mapGeneratedAt: map.generatedAt,
    evidenceGeneratedAt,
    flows: { total: map.flows.length, covered, uncovered: uncovered.length },
    uncoveredByPriority,
    proposals,
  };
}
