import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseLearnArgs } from './args';
import { appendRun } from './record';
import type { FailureReport, RiskReport } from '../analyzer/types';
import type { RunHistory } from './types';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The history is the one artifact that cannot be regenerated — a file that exists but
 *  doesn't parse must abort loudly, never be overwritten (the VPN-drop/empty-map lesson). */
async function readHistory(path: string): Promise<RunHistory | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null; // genuinely absent: first run ever
  }
  try {
    const parsed = JSON.parse(raw) as RunHistory;
    if (!Array.isArray(parsed.entries)) throw new Error('missing entries[]');
    return parsed;
  } catch (err) {
    throw new Error(
      `${path} exists but cannot be parsed (${String(err)}) — refusing to overwrite accumulated knowledge; inspect or restore it from git first.`,
    );
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseLearnArgs(process.argv.slice(2));
  const failureReport = await readJson<FailureReport>(args.failures, 'pnpm analyze');
  const riskReport = await readOptionalJson<RiskReport>(args.risk);
  const existing = await readHistory(args.history);

  const { history, compacted } = appendRun(existing, failureReport, riskReport, {
    now: new Date().toISOString(),
    maxEntries: args.maxEntries,
  });
  await writeJson(args.history, history);

  const entry = history.entries[history.entries.length - 1];
  const driftNote = entry.drift !== undefined
    ? `, drift: ${entry.drift.entries.length} entries (${entry.drift.totals.high} high)`
    : ', no fresh drift report';
  console.log(
    `Recorded run ${entry.failureReportGeneratedAt} (${entry.totals.passed}/${entry.totals.tests} passed, ` +
    `${entry.failures.length} failure event(s)${driftNote}).`,
  );
  if (compacted > 0) console.log(`Compacted: dropped the ${compacted} oldest entr${compacted === 1 ? 'y' : 'ies'} (keeping newest ${args.maxEntries}).`);
  console.log(`History: ${history.entries.length} recorded run(s) in ${args.history}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
