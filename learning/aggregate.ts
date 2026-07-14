import type { RunHistory } from './types';

/**
 * How many of the newest recorded runs consumers read (decision log D5). A code constant,
 * not an env tunable — a signal only means something if everyone computes it the same way.
 */
export const HISTORY_WINDOW = 10;

export interface FlowFailureAggregate {
  /** flowId → number of window runs in which a failure touched it. */
  byFlow: Map<string, number>;
  /** How many recorded runs the window actually covered (≤ HISTORY_WINDOW). */
  window: number;
}

export function historicalFlowFailures(history: RunHistory | null): FlowFailureAggregate {
  const byFlow = new Map<string, number>();
  const entries = (history?.entries ?? []).slice(-HISTORY_WINDOW);
  for (const entry of entries) {
    // Count each flow once per run, however many specs hit it that run.
    const flowsThisRun = new Set(entry.failures.flatMap((f) => f.flowsAffected));
    for (const id of flowsThisRun) byFlow.set(id, (byFlow.get(id) ?? 0) + 1);
  }
  return { byFlow, window: entries.length };
}

export interface DriftAggregate {
  /** entity id (page/flow/element/…) → churn events (changed/removed) across the window. */
  byId: Map<string, number>;
}

export function historicalDriftEvents(history: RunHistory | null): DriftAggregate {
  const byId = new Map<string, number>();
  const entries = (history?.entries ?? []).slice(-HISTORY_WINDOW);
  for (const entry of entries) {
    for (const d of entry.drift?.entries ?? []) {
      // Additions are news, not churn — drift-proneness is about instability of what exists.
      if (d.change === 'added') continue;
      byId.set(d.id, (byId.get(d.id) ?? 0) + 1);
    }
  }
  return { byId };
}
