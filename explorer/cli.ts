import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loadEnv } from '../src/config/env';
import { assertCrawlableEnv, loadExplorerConfig } from './config';
import { parseArgs } from './args';
import { DEFAULT_ROUTE_RULES } from './url';
import { crawlSession, type CrawlError } from './crawl/crawler';
import { InteractionLedger } from './crawl/interact';
import { primeCart, playwrightPrimeCartDriver } from './crawl/primeCart';
import type { SettleOptions } from './crawl/settle';
import { buildPageContext } from './classify/context';
import { makeClassifier } from './classify/factory';
import { buildMap, type ClassifiedPage } from './map/builder';
import { diffMaps, formatDiff, hasChanges } from './diff/differ';
import type { FunctionalMap } from './map/schema';
import type { Session } from './types';

// `/` dropped (F18): the bare, non-localized home is an artifact no spec or real ES user
// enters through, and rooting flows there broke coverage matching against the `/es/`-rooted
// suite. `/es/` server-resolves (gender gate) to the real localized entry `/es/h-woman.html`.
const SEEDS = ['/es/', '/es/search'];

// D15-f2 branch C: checkout is server-routable with a non-empty cart + auth session
// (findings §23) — prime the cart, then crawl checkout as an ordinary auth-session seed.
const CHECKOUT_SEED = '/es/checkout.html';
// Findings §23: checkout hydrates far slower than the PLP-grid default — its shell holds a
// false-plateau at ~+5s and the aria tree first stabilizes at ~+12s, past DEFAULT_SETTLE's
// ceiling. Floor past the plateau; ceiling doubled proportionally.
const CHECKOUT_SETTLE: SettleOptions = { minWaitMs: 13_000, pollIntervalMs: 500, maxWaitMs: 26_000 };

async function main(): Promise<void> {
  dotenv.config();
  const env = loadEnv();
  assertCrawlableEnv(env.name);
  const cfg = loadExplorerConfig();
  const args = parseArgs(process.argv.slice(2));

  let map: FunctionalMap;
  let errors: CrawlError[];

  if (args.fromReport) {
    // Skip crawling; reuse a previously-written report instead of hand-copying its .map into
    // the canonical map path (audit F12 — the report shape { map, errors } differs from the
    // canonical map's bare shape, and that mismatch has already caused a real mistake once).
    ({ map, errors } = await readReport(args.fromReport));
  } else {
    const sessions: Session[] = args.session === 'both' ? ['anon', 'auth'] : [args.session];
    const classifier = makeClassifier(cfg);
    const ledger = new InteractionLedger(cfg.interactions.mustCapture);

    const browser = await chromium.launch();
    const classified: ClassifiedPage[] = [];
    errors = [];
    try {
      for (const session of sessions) {
        const context = await browser.newContext({
          baseURL: env.baseURL,
          ...(session === 'auth' ? { storageState: '.auth/state.json' } : {}),
        });
        let seeds = SEEDS;
        if (session === 'auth' && cfg.seedCheckout) {
          const primePage = await context.newPage();
          const primed = await primeCart(playwrightPrimeCartDriver(primePage));
          await primePage.close();
          if (primed === 'failed') {
            console.warn('primeCart failed — skipping the checkout seed this crawl (non-fatal, M8b precedent).');
          } else {
            seeds = [...SEEDS, CHECKOUT_SEED];
          }
        }
        const result = await crawlSession(
          {
            context, baseURL: env.baseURL, rules: DEFAULT_ROUTE_RULES, bounds: cfg.bounds, extraction: cfg.extraction, interactions: cfg.interactions, ledger,
            // Passed unconditionally: the override only fires on checkout paths, which only
            // exist in the frontier when the seed was actually added above.
            settleOverrides: [{ pattern: /\/checkout\.html$/i, opts: CHECKOUT_SETTLE }],
          },
          session,
          seeds,
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

    if (cfg.extraction === 'aria' && cfg.interactions.enabled) {
      for (const src of ledger.unsatisfiedPatterns()) {
        console.warn(`Must-capture pattern /${src}/i never produced an overlay this crawl — the map may lack its interaction (M8b design §3.2).`);
      }
    }

    map = buildMap({ classified, environment: env.name });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeJson(`reports/explorer/${stamp}.json`, { map, errors });
  }

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
    // Never clobber the canonical map with an empty crawl: a dropped VPN / unreachable DES
    // yields 0 pages + per-seed errors, and silently writing that over a good committed map
    // destroys the diff baseline (happened live 2026-07-02 — VPN dropped mid-session).
    if (map.pages.length === 0) {
      console.error(`Refusing to update ${args.out}: crawl produced 0 pages (${errors.length} errors — is DES reachable?).`);
      process.exitCode = 1;
      return;
    }
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

async function readReport(path: string): Promise<{ map: FunctionalMap; errors: CrawlError[] }> {
  return JSON.parse(await readFile(path, 'utf8')) as { map: FunctionalMap; errors: CrawlError[] };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
