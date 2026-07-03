import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parsePlanArgs } from './args';
import { annotateCoverage } from './coverage/annotate';
import { buildPlanReport } from './propose/propose';
import type { FunctionalMap } from '../explorer/map/schema';
import type { RouteEvidence } from './types';

const PROPOSALS_PATH = 'reports/planner/proposals.json';

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
  const args = parsePlanArgs(process.argv.slice(2));
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');
  const evidence = await readJson<RouteEvidence>(args.evidence, 'pnpm test');

  const annotated = annotateCoverage(map, evidence);
  const report = buildPlanReport(annotated, evidence.generatedAt, new Date().toISOString());
  await writeJson(PROPOSALS_PATH, report);

  const passedCount = evidence.tests.filter((t) => t.status === 'passed').length;
  console.log(`Coverage: ${report.flows.covered}/${report.flows.total} flows covered (evidence: ${passedCount} passed tests).`);
  console.log(`Uncovered by priority: high=${report.uncoveredByPriority.high} med=${report.uncoveredByPriority.med} low=${report.uncoveredByPriority.low}`);
  if (map.generatedAt > evidence.generatedAt) {
    console.warn('Warning: the map is newer than the evidence — coverage may be stale; re-run `pnpm test`.');
  }
  console.log(`Top proposals (full list in ${PROPOSALS_PATH}):`);
  for (const p of report.proposals.slice(0, args.top)) {
    console.log(`  [${p.priority}] ${p.name} — ${p.rationale}`);
  }

  if (args.update) {
    // Never strip real coveredBy data because a run produced nothing (same lesson as the
    // explorer's empty-map guard: a dropped VPN must not clobber committed knowledge).
    if (passedCount === 0) {
      console.error(`Refusing to update ${args.map}: evidence has 0 passed tests.`);
      process.exitCode = 1;
      return;
    }
    await writeJson(args.map, annotated);
    console.log(`Wrote annotated map to ${args.map}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
