import type { BrowserContext } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import type { CrawlBounds } from '../config';
import { Frontier, type FrontierItem } from './frontier';
import { extractFromPage } from '../extract/fromPage';
import { normalizePath, isSameOrigin, type RouteRules } from '../url';
import { acceptConsent } from '../../src/support/consent';

export interface CrawlDeps {
  context: BrowserContext;
  baseURL: string;
  rules: RouteRules;
  bounds: CrawlBounds;
}

export async function crawlSession(deps: CrawlDeps, session: Session, seeds: string[]): Promise<PageExtraction[]> {
  const frontier = new Frontier(deps.rules, deps.bounds);
  for (const seed of seeds) {
    frontier.add({ path: normalizePath(seed, deps.baseURL), session, depth: 0, discoveredVia: 'seed' });
  }

  const results: PageExtraction[] = [];
  const page = await deps.context.newPage();

  for (let item = frontier.next(); item; item = frontier.next()) {
    try {
      await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      await acceptConsent(page);
      const extraction = await extractFromPage(page, session, item.discoveredVia, deps.baseURL);
      results.push(extraction);

      for (const href of extraction.links) {
        const path = normalizePath(href, deps.baseURL);
        // stay on-site: only enqueue same-origin paths
        if (!isSameOrigin(href, deps.baseURL)) continue;
        frontier.add({ path, session, depth: item.depth + 1, discoveredVia: item.path } satisfies FrontierItem);
      }
    } catch (err) {
      results.push(errorExtraction(item, session, String(err)));
    }
    if (deps.bounds.politenessMs > 0) await page.waitForTimeout(deps.bounds.politenessMs);
  }

  await page.close();
  return results;
}

function errorExtraction(item: FrontierItem, session: Session, message: string): PageExtraction {
  return {
    meta: { path: item.path, url: item.path, title: `ERROR: ${message}`, session, discoveredVia: item.discoveredVia },
    landmarkRoles: [], textSummary: '', links: [], elements: [], forms: [], componentKinds: [],
  };
}
