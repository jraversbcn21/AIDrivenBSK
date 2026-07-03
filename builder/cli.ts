import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseBuildArgs } from './args';
import { selectJourneys } from './select';
import { TemplateGenerator } from './generate/TemplateGenerator';
import type { FunctionalMap } from '../explorer/map/schema';
import type { PlanReport } from '../planner/propose/propose';

async function readJson<T>(path: string, producedBy: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    throw new Error(`Cannot read ${path} — run \`${producedBy}\` first.`);
  }
}

async function main(): Promise<void> {
  const args = parseBuildArgs(process.argv.slice(2));
  const report = await readJson<PlanReport>(args.proposals, 'pnpm plan');
  const map = await readJson<FunctionalMap>(args.map, 'pnpm explore --update');

  const { journeys, skipped } = selectJourneys(report, map, args.top);
  for (const s of skipped) console.warn(`Skipped ${s.flowId}: ${s.reason}`);

  if (journeys.length === 0) {
    console.error('No specs generated: no eligible proposals (see skips above, or re-run `pnpm plan`).');
    process.exitCode = 1;
    return;
  }

  const generator = new TemplateGenerator();
  for (const journey of journeys) {
    for (const file of generator.generate(journey)) {
      const outPath = join(args.out, file.relPath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, file.content, 'utf8');
      console.log(`Wrote ${outPath}`);
    }
    if (journey.loadedSignal === null) {
      console.warn(`Note: ${journey.flowId} has no usable leaf element — its isLoaded() only checks the main landmark.`);
    }
  }
  console.log(`Generated ${journeys.length} journey spec(s) into ${args.out}/ — review, run with \`pnpm test:generated\`, promote by moving into tests/<domain>/.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
