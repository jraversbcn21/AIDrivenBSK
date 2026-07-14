import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as dotenv from 'dotenv';
import { loadEnv } from '../src/config/env';
import { parseHealArgs } from './args';
import { parseBrokenLocator } from './parse';
import { findCandidates } from './candidates';
import { probeCandidates, type ProbeResult } from './validate';
import type { FunctionalMap } from '../explorer/map/schema';
import type { FailureReport } from '../analyzer/types';
import type { HealingCandidate, HealingProposal, HealingReport } from './types';
import type { RankedCandidate } from './candidates';

const HEALING_REPORT_PATH = 'reports/healer/healing-report.json';

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
  const args = parseHealArgs(process.argv.slice(2));
  const failureReport = await readJson<FailureReport>(args.failures, 'pnpm analyze');
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');

  // Reactive scope: only selector-drift failures (headline or any attempt) — the other
  // categories are not selector problems; Phase 6's taxonomy exists to keep them out.
  const driftFailures = failureReport.failures.filter(
    (f) => f.category === 'selector-drift' || f.attempts.some((a) => a.category === 'selector-drift'),
  );
  if (driftFailures.length === 0) {
    // Never clobber a previous healing session's report with an empty one (the
    // explorer's empty-map / planner's empty-evidence guard precedent).
    console.log('Nothing to heal: the failure report contains no selector-drift failures.');
    return;
  }

  // Parse + rank offline first; probe live afterwards, batched per page.
  const prepared = driftFailures.map((failure) => {
    const message = [...failure.attempts].reverse().find((a) => a.message !== undefined)?.message;
    const broken = parseBrokenLocator(message);
    const search = broken !== null
      ? findCandidates(broken, failure.flowsAffected, map, args.top)
      : { scope: 'flows' as const, candidates: [] };
    return { failure, broken, search };
  });

  let probeResults = new Map<RankedCandidate, ProbeResult>();
  const allCandidates = prepared.flatMap((p) => p.search.candidates);
  if (args.probe && allCandidates.length > 0) {
    dotenv.config();
    const env = loadEnv();
    console.log(`Probing ${allCandidates.length} candidate(s) live against ${env.baseURL} ...`);
    probeResults = await probeCandidates(allCandidates, env.baseURL);
  }

  const proposals: HealingProposal[] = prepared.map(({ failure, broken, search }) => {
    const candidates: HealingCandidate[] = search.candidates.map((c) => {
      const probe = probeResults.get(c);
      return {
        elementId: c.elementId, pageId: c.pageId, pagePath: c.pagePath, pageSession: c.pageSession,
        strategy: c.strategy, matchEvidence: c.matchEvidence, rankScore: c.rankScore,
        verdict: probe?.verdict ?? 'not-probed',
        ...(probe?.observed !== undefined ? { observed: probe.observed } : {}),
        ...(probe?.error !== undefined ? { error: probe.error } : {}),
      };
    });
    const status: HealingProposal['status'] = broken === null
      ? 'unparseable'
      : candidates.length === 0
        ? 'no-candidates'
        : candidates.some((c) => c.verdict === 'validated') ? 'confirmed' : 'unconfirmed';
    return { spec: failure.spec, title: failure.title, broken, status, scope: search.scope, candidates };
  });

  const report: HealingReport = {
    generatedAt: new Date().toISOString(),
    failureReportGeneratedAt: failureReport.generatedAt,
    mapGeneratedAt: map.generatedAt,
    totals: {
      selectorDriftFailures: driftFailures.length,
      confirmed: proposals.filter((p) => p.status === 'confirmed').length,
      unconfirmed: proposals.filter((p) => p.status === 'unconfirmed').length,
      unparseable: proposals.filter((p) => p.status === 'unparseable').length,
      noCandidates: proposals.filter((p) => p.status === 'no-candidates').length,
    },
    proposals,
  };
  await writeJson(HEALING_REPORT_PATH, report);

  const t = report.totals;
  console.log(`Healing: ${t.confirmed} confirmed / ${t.unconfirmed} unconfirmed / ${t.unparseable} unparseable / ${t.noCandidates} no-candidates (${t.selectorDriftFailures} selector-drift failures).`);
  for (const p of proposals) {
    console.log(`  [${p.status}] ${p.spec} › ${p.title} — broken: ${p.broken?.raw ?? '(unparseable)'}`);
    for (const c of p.candidates) {
      console.log(`    [${c.verdict}] ${JSON.stringify(c.strategy)} @ ${c.pagePath} (score ${c.rankScore}) — ${c.matchEvidence[0]}`);
    }
  }
  console.log(`Wrote ${HEALING_REPORT_PATH} — proposals are suggestions for a HUMAN to apply; nothing was modified.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
