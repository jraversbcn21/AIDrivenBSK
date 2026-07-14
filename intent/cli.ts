import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseAskArgs } from './args';
import { resolveIntent, type IntentMatch } from './resolve';
import { selectJourneyByFlowId } from '../builder/select';
import { TemplateGenerator } from '../builder/generate/TemplateGenerator';
import type { FunctionalMap } from '../explorer/map/schema';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

function printMatch(m: IntentMatch, marker: string): void {
  const covered = m.coveredBy.length > 0 ? ` — ALREADY COVERED by ${m.coveredBy.join(', ')}` : '';
  console.log(`  ${marker} [${m.score}] ${m.flowId} (${m.type}, ${m.steps} step${m.steps === 1 ? '' : 's'})${covered}`);
  console.log(`      ${m.name}`);
  console.log(`      why: ${m.reasons.join('; ')}`);
}

async function main(): Promise<void> {
  const args = parseAskArgs(process.argv.slice(2));
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');

  let flowId: string;
  if (args.flow !== undefined) {
    flowId = args.flow; // the ambiguity follow-up: resolution already happened last invocation
  } else {
    const r = resolveIntent(args.query, map);
    if (r.outcome === 'no-match') {
      if (r.checkoutBlindSpot) {
        // Honest blind spot, not a bare "not found" (decision log D7): the map cannot
        // contain what the crawler cannot reach.
        console.error('No checkout flow exists in the map: the crawler never reaches checkout by link-following (backlog D15). This intent cannot be resolved until D15 closes.');
      } else {
        console.error(`No flow matches "${args.query}" (intent tokens: ${r.tokens.join(', ') || 'none'}).`);
      }
      if (r.suggestions.length > 0) {
        console.error('Nearest sub-threshold candidates:');
        for (const s of r.suggestions) printMatch(s, '·');
      }
      process.exitCode = 1;
      return;
    }
    if (r.outcome === 'ambiguous') {
      console.log(`"${args.query}" is ambiguous — ${r.matches.length} flows qualify. Top ${Math.min(args.top, r.matches.length)}:`);
      for (const m of r.matches.slice(0, args.top)) printMatch(m, '·');
      console.log('Re-run with --flow <id> to pick one, e.g.:');
      console.log(`  pnpm ask --flow ${r.matches[0].flowId}`);
      return; // exit 0: a successful conversation step (decision log D7)
    }
    const pick = r.pick as IntentMatch;
    console.log(`Resolved "${args.query}" →`);
    printMatch(pick, '✓');
    if (pick.coveredBy.length > 0) {
      console.log(`Note: this flow is already covered — the draft below is an addition, not a gap-fill.`);
    }
    flowId = pick.flowId;
  }

  const { journey, reason } = selectJourneyByFlowId(map, flowId);
  if (journey === null) {
    console.error(`Cannot build a journey for ${flowId}: ${reason}`);
    process.exitCode = 1;
    return;
  }

  // Targeted addition: no pruning here (decision log D6) — F10's prune belongs to
  // build-tests regenerations; a question must not delete the user's other drafts.
  const generator = new TemplateGenerator();
  for (const file of generator.generate(journey)) {
    const outPath = join(args.out, file.relPath);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, file.content, 'utf8');
    console.log(`Wrote ${outPath}`);
  }
  console.log(`Draft generated — review, then promote by moving into tests/<domain>/.`);

  if (args.run) {
    console.log('Running the generated drafts live (pnpm test:generated)...');
    const child = spawn('pnpm test:generated', { shell: true, stdio: 'inherit' });
    const code: number = await new Promise((resolve) => child.on('close', (c) => resolve(c ?? 1)));
    process.exitCode = code;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
