import type { Page } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import { analyzePage } from './analyze';
import { normalizePath } from '../url';
import type { ExtractionMode } from '../config';
import { parseAriaSnapshot } from './aria';
import { analyzeAriaNodes } from './analyzeAria';
import { enrichTestIds } from './enrichTestIds';

export async function extractFromPage(
  page: Page,
  session: Session,
  discoveredVia: string,
  baseURL: string,
): Promise<PageExtraction> {
  const url = page.url();
  const html = await page.content();
  const title = await page.title();
  return analyzePage(html, {
    path: normalizePath(url, baseURL),
    url,
    title,
    session,
    discoveredVia,
  });
}

/**
 * Shadow-DOM-safe extraction: DES renders through bds- web components, so page.content()
 * (light DOM) misses most interactive content (findings §8). The accessibility tree pierces
 * shadow roots; one ariaSnapshot per page is the backbone, plus a bounded testId probe.
 */
export async function extractFromPageAria(
  page: Page,
  session: Session,
  discoveredVia: string,
  baseURL: string,
): Promise<PageExtraction> {
  const url = page.url();
  const title = await page.title();
  const snapshot = await page.locator('body').ariaSnapshot();
  const extraction = analyzeAriaNodes(parseAriaSnapshot(snapshot), {
    path: normalizePath(url, baseURL),
    url,
    title,
    session,
    discoveredVia,
  });
  await enrichTestIds(page, extraction);
  return extraction;
}

export function extractorFor(mode: ExtractionMode): typeof extractFromPage {
  return mode === 'aria' ? extractFromPageAria : extractFromPage;
}
