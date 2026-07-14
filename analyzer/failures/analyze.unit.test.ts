import { describe, it, expect } from 'vitest';
import type { JSONReportSuite, JSONReportTest, JSONReportTestResult } from '@playwright/test/reporter';
import type { FunctionalMap } from '../../explorer/map/schema';
import { analyzeFailures } from './analyze';

// --- fixture factories (full Playwright JSON-report shapes, minimal real values) ---

function makeResult(overrides: Partial<JSONReportTestResult> = {}): JSONReportTestResult {
  return {
    workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 1000,
    error: undefined, errors: [], stdout: [], stderr: [], retry: 0,
    startTime: '2026-07-14T10:00:00.000Z', attachments: [], annotations: [],
    ...overrides,
  };
}

function makeTest(overrides: Partial<JSONReportTest> = {}): JSONReportTest {
  return {
    timeout: 120000, annotations: [], expectedStatus: 'passed',
    projectName: 'chromium', projectId: 'chromium',
    results: [makeResult()], status: 'expected',
    ...overrides,
  };
}

function makeSuite(file: string, specs: Array<{ title: string; tests: JSONReportTest[] }>, suites?: JSONReportSuite[]): JSONReportSuite {
  return {
    title: file, file, column: 0, line: 0,
    specs: specs.map((s, i) => ({
      tags: [], title: s.title, ok: true, tests: s.tests, id: `spec-${i}`, file, line: 1, column: 1,
    })),
    ...(suites ? { suites } : {}),
  };
}

function makeMap(flows: Array<{ id: string; coveredBy?: string[] }>): FunctionalMap {
  return {
    schemaVersion: '1.7', generatedAt: '2026-07-13T00:00:00.000Z', environment: 'des',
    pages: [], components: [], elements: [], forms: [],
    flows: flows.map((f) => ({
      id: f.id, name: f.id, type: 'Other', session: 'auth', priority: 'med', steps: [],
      ...(f.coveredBy ? { coveredBy: f.coveredBy } : {}),
    })),
    interactions: [],
  };
}

const OPTS = { now: '2026-07-14T12:00:00.000Z', resultsPath: 'reports/results.json' };

describe('analyzeFailures', () => {
  it('counts totals across passed/failed/flaky/skipped and reports no failures on a green run', () => {
    const suites = [makeSuite('auth/login.spec.ts', [
      { title: 'logs in', tests: [makeTest()] },
      { title: 'skipped one', tests: [makeTest({ status: 'skipped', results: [] })] },
    ])];
    const report = analyzeFailures({ suites }, makeMap([]), OPTS);
    expect(report.totals).toEqual({ tests: 2, passed: 1, failed: 0, flaky: 0, skipped: 1 });
    expect(report.failures).toEqual([]);
    expect(report.affectedFlowIds).toEqual([]);
    expect(report.generatedAt).toBe(OPTS.now);
    expect(report.mapGeneratedAt).toBe('2026-07-13T00:00:00.000Z');
  });

  it('walks nested suites (describe blocks nest in the JSON report)', () => {
    const inner = makeSuite('cart/add-to-cart.spec.ts', [{ title: 'adds', tests: [makeTest()] }]);
    const outer = makeSuite('cart/add-to-cart.spec.ts', [], [inner]);
    const report = analyzeFailures({ suites: [outer] }, makeMap([]), OPTS);
    expect(report.totals.tests).toBe(1);
  });

  it('records a persistent failure with per-attempt categories and headline = last failing attempt', () => {
    const test = makeTest({
      status: 'unexpected',
      results: [
        makeResult({ status: 'failed', retry: 0, duration: 30000, error: { message: 'Error: ProductPage: the size dialog did not close after selecting a size (add not confirmed)' } }),
        makeResult({ status: 'failed', retry: 1, duration: 31000, error: { message: 'Error: strict mode violation: getByRole(\'dialog\') resolved to 2 elements' } }),
      ],
    });
    const report = analyzeFailures({ suites: [makeSuite('cart/add-to-cart.spec.ts', [{ title: 'adds to cart', tests: [test] }])] }, makeMap([]), OPTS);
    expect(report.totals.failed).toBe(1);
    const rec = report.failures[0];
    expect(rec.outcome).toBe('failed');
    expect(rec.persistence).toBe('persistent');
    expect(rec.attempts.map((a) => a.category)).toEqual(['environment-noise', 'selector-drift']);
    expect(rec.category).toBe('selector-drift'); // last failing attempt wins
    expect(rec.attempts[0].message).toBe('Error: ProductPage: the size dialog did not close after selecting a size (add not confirmed)');
  });

  it('records a flaky test as transient, keeping only failing attempts', () => {
    const test = makeTest({
      status: 'flaky',
      results: [
        makeResult({ status: 'failed', retry: 0, error: { message: 'Error: SearchBar: search for "camiseta" did not reach the /q/ results URL within the deadline' } }),
        makeResult({ status: 'passed', retry: 1 }),
      ],
    });
    const report = analyzeFailures({ suites: [makeSuite('search/search-plp-pdp.spec.ts', [{ title: 'searches', tests: [test] }])] }, makeMap([]), OPTS);
    expect(report.totals.flaky).toBe(1);
    const rec = report.failures[0];
    expect(rec.outcome).toBe('flaky');
    expect(rec.persistence).toBe('transient');
    expect(rec.attempts).toHaveLength(1);
    expect(rec.category).toBe('environment-noise');
  });

  it('links failures to map flows via coveredBy suffix-boundary matching', () => {
    // JSON-report file is testDir-relative; coveredBy entries are cwd-relative posix.
    const map = makeMap([
      { id: 'flow-1', coveredBy: ['tests/cart/add-to-cart.spec.ts'] },
      { id: 'flow-2', coveredBy: ['tests/auth/login.spec.ts'] },
      { id: 'flow-3', coveredBy: [] },
      // boundary guard: must NOT match a different spec sharing the filename suffix
      { id: 'flow-4', coveredBy: ['tests/cart/x-add-to-cart.spec.ts'] },
    ]);
    const test = makeTest({ status: 'unexpected', results: [makeResult({ status: 'failed', error: { message: 'Test timeout of 120000ms exceeded.' } })] });
    const report = analyzeFailures({ suites: [makeSuite('cart\\add-to-cart.spec.ts', [{ title: 'adds', tests: [test] }])] }, map, OPTS);
    expect(report.failures[0].flowsAffected).toEqual(['flow-1']);
    expect(report.affectedFlowIds).toEqual(['flow-1']);
  });

  it('zero-fills byCategory and counts headline categories', () => {
    const test = makeTest({ status: 'unexpected', results: [makeResult({ status: 'failed', error: { message: 'page.goto: net::ERR_NAME_NOT_RESOLVED' } })] });
    const report = analyzeFailures({ suites: [makeSuite('auth/login.spec.ts', [{ title: 'logs in', tests: [test] }])] }, makeMap([]), OPTS);
    expect(report.byCategory.infrastructure).toBe(1);
    expect(report.byCategory['selector-drift']).toBe(0);
    expect(report.byCategory.unknown).toBe(0);
  });

  it('takes only the first line of a multi-line error message', () => {
    const test = makeTest({
      status: 'unexpected',
      results: [makeResult({ status: 'failed', error: { message: 'locator.click: Test timeout of 120000ms exceeded.\nCall log:\n  - waiting for getByRole(\'button\')' } })],
    });
    const report = analyzeFailures({ suites: [makeSuite('auth/login.spec.ts', [{ title: 'logs in', tests: [test] }])] }, makeMap([]), OPTS);
    expect(report.failures[0].attempts[0].message).toBe('locator.click: Test timeout of 120000ms exceeded.');
    // classification still sees the full message: "waiting for getBy" => selector-drift
    expect(report.failures[0].category).toBe('selector-drift');
  });

  it('falls back to errors[] when error is undefined, and to unknown with no message at all', () => {
    const viaErrors = makeTest({ status: 'unexpected', results: [makeResult({ status: 'failed', errors: [{ message: 'Error: strict mode violation: x resolved to 2 elements' }] })] });
    const noMessage = makeTest({ status: 'unexpected', results: [makeResult({ status: 'failed' })] });
    const report = analyzeFailures({
      suites: [makeSuite('a.spec.ts', [{ title: 'a', tests: [viaErrors] }, { title: 'b', tests: [noMessage] }])],
    }, makeMap([]), OPTS);
    expect(report.failures[0].category).toBe('selector-drift');
    expect(report.failures[1].category).toBe('unknown');
    expect(report.failures[1].attempts[0].message).toBeUndefined();
  });

  it('refuses a report with 0 tests (empty-input guard precedent)', () => {
    expect(() => analyzeFailures({ suites: [] }, makeMap([]), OPTS))
      .toThrow(/0 tests/);
  });
});
