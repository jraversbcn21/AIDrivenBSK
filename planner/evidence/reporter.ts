import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { aggregateEvidence, type RawResult } from './aggregate';

const OUT_PATH = 'reports/route-evidence.json';

/**
 * Aggregates the per-test 'route-evidence' attachments (written by the routeEvidence
 * auto-fixture in src/fixtures/test.ts) into reports/route-evidence.json, the input the
 * planner CLI matches against the functional map. Retried tests contribute one entry per
 * attempt; the planner only counts status === 'passed'.
 */
export default class RouteEvidenceReporter implements Reporter {
  private readonly results: RawResult[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find((a) => a.name === 'route-evidence');
    this.results.push({
      specFile: relative(process.cwd(), test.location.file),
      title: test.title,
      status: result.status,
      attachmentBody: attachment?.body?.toString('utf8'),
    });
  }

  async onEnd(): Promise<void> {
    const evidence = aggregateEvidence(this.results, new Date().toISOString());
    await mkdir(dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  printsToStdio(): boolean {
    return false;
  }
}
