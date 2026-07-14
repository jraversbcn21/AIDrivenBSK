import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseAnalyzeArgs } from './args';
import { analyzeFailures, type ResultsInput } from './failures/analyze';
import { buildRiskReport } from './risk/score';
import { diffMaps, hasChanges } from '../explorer/diff/differ';
import type { FunctionalMap } from '../explorer/map/schema';
import type { FailureCategory } from './types';

const FAILURE_REPORT_PATH = 'reports/analyzer/failure-report.json';
const RISK_REPORT_PATH = 'reports/analyzer/risk-report.json';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseAnalyzeArgs(process.argv.slice(2));
  const results = await readJson<ResultsInput>(args.results, 'pnpm test');
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');

  const failureReport = analyzeFailures(results, map, {
    now: new Date().toISOString(),
    resultsPath: args.results,
  });
  await writeJson(FAILURE_REPORT_PATH, failureReport);

  const t = failureReport.totals;
  console.log(`Failures: ${t.failed} failed, ${t.flaky} flaky of ${t.tests} tests (${t.passed} passed, ${t.skipped} skipped).`);
  const nonZero = (Object.entries(failureReport.byCategory) as Array<[FailureCategory, number]>)
    .filter(([, n]) => n > 0);
  if (nonZero.length > 0) {
    console.log(`By category: ${nonZero.map(([c, n]) => `${c}=${n}`).join(' ')}`);
  }
  for (const f of failureReport.failures) {
    const flows = f.flowsAffected.length > 0 ? ` — affects flows: ${f.flowsAffected.join(', ')}` : '';
    console.log(`  [${f.category}/${f.persistence}] ${f.spec} › ${f.title}${flows}`);
  }
  console.log(`Wrote ${FAILURE_REPORT_PATH}`);

  if (args.risk !== undefined) {
    const baseline = await readJson<FunctionalMap>(args.risk, 'pnpm explore --update (or point --risk at a committed map)');
    const diff = diffMaps(baseline, map);
    if (!hasChanges(diff)) {
      console.log('Risk: no changes between the baseline and current map — nothing to score.');
      return;
    }
    const riskReport = buildRiskReport(diff, baseline, map, failureReport.affectedFlowIds, {
      now: new Date().toISOString(),
    });
    await writeJson(RISK_REPORT_PATH, riskReport);
    console.log(`Risk: ${riskReport.totals.high} high / ${riskReport.totals.med} med / ${riskReport.totals.low} low across ${riskReport.entries.length} diff entries.`);
    console.log(`Top ${Math.min(args.top, riskReport.entries.length)} (full list in ${RISK_REPORT_PATH}):`);
    for (const e of riskReport.entries.slice(0, args.top)) {
      console.log(`  [${e.band} ${e.score.toFixed(2)}] ${e.change} ${e.kind} ${e.id} — ${e.reasons.join('; ')}`);
    }
    console.log(`Wrote ${RISK_REPORT_PATH}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
