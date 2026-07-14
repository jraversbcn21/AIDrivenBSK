import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseCycleArgs } from './args';
import { buildSteps, runPipeline, type Exec } from './pipeline';
import { consolidate, type QaCycleArtifacts, type QaCycleReport } from './report';
import type { FailureReport, RiskReport } from '../analyzer/types';
import type { HealingReport } from '../healer/types';
import type { RunHistory } from '../learning/types';
import type { PlanReport } from '../planner/propose/propose';

const REPORT_PATH = 'reports/orchestrator/qa-cycle-report.json';

/** Child processes stream their own output (stdio: inherit) — the cycle is watchable live;
 *  the orchestrator only records exit codes and durations (agents stay black boxes, D1). */
const exec: Exec = (command) => new Promise((resolve) => {
  const started = Date.now();
  const child = spawn(command, { shell: true, stdio: 'inherit' });
  child.on('close', (code) => resolve({ exitCode: code ?? 1, durationMs: Date.now() - started }));
});

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function printSummary(report: QaCycleReport): void {
  console.log('\n================ QA CYCLE SUMMARY ================');
  for (const s of report.steps) {
    const time = s.status === 'skipped' ? '' : ` (${(s.durationMs / 1000).toFixed(1)}s)`;
    console.log(`  ${s.status === 'ok' ? '✓' : s.status === 'failed' ? '✗' : '·'} ${s.name}${time}${s.status === 'skipped' ? ' — skipped (pipeline aborted)' : ''}`);
  }
  if (report.suite !== undefined && report.suite !== 'stale') {
    const t = report.suite;
    console.log(`  Suite: ${t.passed}/${t.tests} passed, ${t.failed} failed, ${t.flaky} flaky`);
  }
  if (report.risk !== undefined && report.risk !== 'not-run' && report.risk !== 'stale') {
    console.log(`  Risk: ${report.risk.high} high / ${report.risk.med} med / ${report.risk.low} low`);
  }
  if (report.learning !== undefined && report.learning !== 'stale') {
    console.log(`  Learning: ${report.learning.recordedRuns} recorded run(s), last at ${report.learning.lastEntryRecordedAt}`);
  }
  if (report.healing === 'nothing-to-heal') console.log('  Healing: nothing to heal (no selector-drift failures)');
  else if (report.healing !== undefined && report.healing !== 'stale') {
    console.log(`  Healing: ${report.healing.confirmed} confirmed / ${report.healing.unconfirmed} unconfirmed proposals`);
  }
  if (report.proposals !== undefined && report.proposals !== 'stale') {
    console.log(`  Proposals: ${report.proposals.total} uncovered flows ranked; top: ${report.proposals.top.map((p) => `[${p.priority}${p.driftEvents !== undefined && p.driftEvents > 0 ? ` drift:${p.driftEvents}` : ''}] ${p.name}`).join(' | ') || '(none)'}`);
  }
  console.log(`  Full report: ${REPORT_PATH}`);
  console.log('==================================================');
}

async function main(): Promise<void> {
  const args = parseCycleArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  console.log(`QA cycle started at ${startedAt} — steps: test → analyze → learn → heal → plan`);

  const steps = buildSteps(args);
  const results = await runPipeline(steps, exec);

  const artifacts: QaCycleArtifacts = {
    failureReport: await readOptionalJson<FailureReport>('reports/analyzer/failure-report.json'),
    riskReport: await readOptionalJson<RiskReport>('reports/analyzer/risk-report.json'),
    runHistory: await readOptionalJson<RunHistory>('coverage/run-history.json'),
    healingReport: await readOptionalJson<HealingReport>('reports/healer/healing-report.json'),
    planReport: await readOptionalJson<PlanReport>('reports/planner/proposals.json'),
  };

  const report = consolidate(artifacts, startedAt, new Date().toISOString(), results, {
    riskRequested: args.risk !== undefined,
    top: args.top ?? 3,
  });
  await writeJson(REPORT_PATH, report);
  printSummary(report);

  // Exit code = PIPELINE health, not suite health (D3): a red suite is the report's
  // content; a non-zero exit here means the cycle itself could not complete.
  const pipelineBroken = results.some((r) => r.status === 'skipped');
  if (pipelineBroken) {
    console.error('QA cycle INCOMPLETE: a required step failed and the rest were skipped — see the step list above.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
