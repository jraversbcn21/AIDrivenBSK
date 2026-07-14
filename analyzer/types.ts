import type { DiffKind } from '../explorer/diff/differ';

/**
 * Failure taxonomy, deterministic and grounded in this project's real, live-observed
 * failure families (design 2026-07-14 §3.2): each category maps to diagnostic strings
 * the framework's own page objects throw, or documented Playwright failure shapes.
 */
export type FailureCategory =
  | 'infrastructure'      // VPN/DNS/connection — DES unreachable (findings §21)
  | 'catalog-drift'       // A5 family: the catalog changed under the spec (findings §18)
  | 'environment-noise'   // documented DES pre-prod noise the test-level retry exists for (§7/§14/§16)
  | 'selector-drift'      // strict-mode violations / awaited element gone (A6, B16 families)
  | 'assertion'           // page loaded but observed state ≠ expected
  | 'timeout'             // generic test timeout, undiagnosable from the message alone
  | 'unknown';

export interface FailureAttempt {
  retry: number;
  status: string;
  durationMs: number;
  category: FailureCategory;
  /** First line of the ANSI-stripped error message (diagnostic identity, not the full dump). */
  message?: string;
}

export interface FailureRecord {
  spec: string;
  title: string;
  projectName: string;
  /** flaky = failed then passed on retry (transient); failed = failed all attempts (persistent). */
  outcome: 'failed' | 'flaky';
  persistence: 'persistent' | 'transient';
  /** The last failing attempt's category — the one that exhausted retries is the most informative. */
  category: FailureCategory;
  attempts: FailureAttempt[];
  /** MapFlow ids whose coveredBy names this spec — the Knowledge Graph linkage (F18, consumed). */
  flowsAffected: string[];
}

export interface FailureReport {
  generatedAt: string;
  resultsPath: string;
  mapGeneratedAt: string;
  totals: { tests: number; passed: number; failed: number; flaky: number; skipped: number };
  byCategory: Record<FailureCategory, number>;
  failures: FailureRecord[];
  /** Union of all failures' flowsAffected — the risk engine's failure-history input. */
  affectedFlowIds: string[];
}

export type RiskBand = 'high' | 'med' | 'low';

export interface RiskEntry {
  kind: DiffKind;
  id: string;
  change: 'added' | 'removed' | 'changed';
  score: number;
  band: RiskBand;
  /** Every signal that fired, by name — a score is explainable or it is worthless. */
  reasons: string[];
}

export interface RiskReport {
  generatedAt: string;
  baselineGeneratedAt: string;
  currentGeneratedAt: string;
  totals: Record<RiskBand, number>;
  entries: RiskEntry[];
}
