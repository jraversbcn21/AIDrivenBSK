import type { Page } from '@playwright/test';
import type { PageExtraction, Session } from '../types';
import { analyzePage } from './analyze';
import { normalizePath } from '../url';

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
