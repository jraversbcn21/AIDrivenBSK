import type { JSONReport, JSONReportSuite, JSONReportTest } from '@playwright/test/reporter';
import type { FunctionalMap } from '../../explorer/map/schema';
import type { FailureAttempt, FailureCategory, FailureRecord, FailureReport } from '../types';
import { classifyFailureMessage, stripAnsi } from './classify';

/** Only the slice of the JSON report the analyzer consumes (full JSONReport also accepted). */
export type ResultsInput = Pick<JSONReport, 'suites'>;

interface FlatTest { file: string; title: string; test: JSONReportTest }

// Suites nest (describe blocks); flatten to (file, specTitle, test) triples.
function flattenSuites(suites: JSONReportSuite[] | undefined, acc: FlatTest[] = []): FlatTest[] {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) acc.push({ file: spec.file || suite.file, title: spec.title, test });
    }
    flattenSuites(suite.suites, acc);
  }
  return acc;
}

const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * The JSON report's file is testDir-relative ("auth/login.spec.ts"); coveredBy entries are
 * cwd-relative posix ("tests/auth/login.spec.ts", per planner/evidence/reporter.ts). Match by
 * suffix with a '/' boundary so "x-add-to-cart.spec.ts" never matches "add-to-cart.spec.ts"
 * (decision log D7).
 */
function flowsAffectedBy(specFile: string, map: FunctionalMap): string[] {
  const file = toPosix(specFile);
  return map.flows
    .filter((f) => (f.coveredBy ?? []).some((c) => c === file || c.endsWith(`/${file}`)))
    .map((f) => f.id);
}

function emptyByCategory(): Record<FailureCategory, number> {
  return {
    infrastructure: 0, 'catalog-drift': 0, 'environment-noise': 0,
    'selector-drift': 0, assertion: 0, timeout: 0, unknown: 0,
  };
}

function firstLine(message: string): string {
  return stripAnsi(message).split('\n')[0].trim();
}

export function analyzeFailures(
  results: ResultsInput,
  map: FunctionalMap,
  opts: { now: string; resultsPath: string },
): FailureReport {
  const flat = flattenSuites(results.suites);
  if (flat.length === 0) {
    throw new Error(`${opts.resultsPath} contains 0 tests — refusing to analyze (was the suite interrupted?).`);
  }

  const totals = { tests: flat.length, passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const byCategory = emptyByCategory();
  const failures: FailureRecord[] = [];
  const affected = new Set<string>();

  for (const { file, title, test } of flat) {
    if (test.status === 'expected') { totals.passed++; continue; }
    if (test.status === 'skipped') { totals.skipped++; continue; }
    // 'unexpected' (failed every attempt) or 'flaky' (failed, then passed on retry).
    const outcome = test.status === 'flaky' ? 'flaky' : 'failed';
    if (outcome === 'flaky') totals.flaky++; else totals.failed++;

    const attempts: FailureAttempt[] = test.results
      .filter((r) => r.status !== 'passed' && r.status !== 'skipped')
      .map((r) => {
        const raw = r.error?.message ?? r.errors[0]?.message;
        return {
          retry: r.retry,
          status: r.status ?? 'unknown',
          durationMs: r.duration,
          category: classifyFailureMessage(raw),
          ...(raw !== undefined ? { message: firstLine(raw) } : {}),
        };
      });

    // The attempt that exhausted the retry budget is the most informative one.
    const category = attempts.length > 0 ? attempts[attempts.length - 1].category : 'unknown';
    byCategory[category]++;
    const flowsAffected = flowsAffectedBy(file, map);
    for (const id of flowsAffected) affected.add(id);

    failures.push({
      spec: toPosix(file), title, projectName: test.projectName,
      outcome, persistence: outcome === 'flaky' ? 'transient' : 'persistent',
      category, attempts, flowsAffected,
    });
  }

  return {
    generatedAt: opts.now,
    resultsPath: opts.resultsPath,
    mapGeneratedAt: map.generatedAt,
    totals, byCategory, failures,
    affectedFlowIds: [...affected],
  };
}
