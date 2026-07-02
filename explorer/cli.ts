import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loadEnv } from '../src/config/env';
import { assertCrawlableEnv, loadExplorerConfig } from './config';
import { parseArgs } from './args';
import { DEFAULT_ROUTE_RULES } from './url';
import { crawlSession, type CrawlError } from './crawl/crawler';
import { buildPageContext } from './classify/context';
import { makeClassifier } from './classify/factory';
import { buildMap, type ClassifiedPage } from './map/builder';
import { diffMaps, formatDiff, hasChanges } from './diff/differ';
import type { FunctionalMap } from './map/schema';
import type { Session } from './types';

const SEEDS = ['/', '/es/', '/es/search'];

async function main(): Promise<void> {
  dotenv.config();
  const env = loadEnv();
  assertCrawlableEnv(env.name);
  const cfg = loadExplorerConfig();
  const args = parseArgs(process.argv.slice(2));

  const sessions: Session[] = args.session === 'both' ? ['anon', 'auth'] : [args.session];
  const classifier = makeClassifier(cfg);

  const browser = await chromium.launch();
  const classified: ClassifiedPage[] = [];
  const errors: CrawlError[] = [];
  try {
    for (const session of sessions) {
      const context = await browser.newContext(session === 'auth' ? { storageState: '.auth/state.json' } : {});
      const result = await crawlSession(
        { context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction },
        session,
        SEEDS,
      );
      errors.push(...result.errors);
      for (const ex of result.extractions) {
        classified.push({ extraction: ex, classification: await classifier.classifyPage(buildPageContext(ex)) });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const map = buildMap({ classified, environment: env.name });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeJson(`reports/explorer/${stamp}.json`, { map, errors });

  if (args.diff || args.failOnNew) {
    const prev = await readMap(args.out);
    if (prev) {
      const diff = diffMaps(prev, map);
      console.log(formatDiff(diff));
      if (args.failOnNew && hasChanges(diff) && diff.added.length > 0) process.exitCode = 1;
    } else {
      console.log('No existing canonical map to diff against.');
    }
  }

  if (args.update) {
    await writeJson(args.out, map);
    console.log(`Wrote canonical map to ${args.out}`);
  } else if (!args.diff) {
    console.log(`Explored ${map.pages.length} pages, ${errors.length} errors (run with --update to write ${args.out}).`);
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readMap(path: string): Promise<FunctionalMap | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as FunctionalMap;
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
