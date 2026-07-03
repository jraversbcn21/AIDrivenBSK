import { normalizePath, routePattern } from '../../explorer/url';

/** Absolute evidence URLs -> route patterns (the same normalization that built the map),
 *  collapsing consecutive duplicates (query-string changes, in-page re-navigations). */
export function urlsToPatterns(urls: string[]): string[] {
  const patterns: string[] = [];
  for (const url of urls) {
    const p = routePattern(normalizePath(url, url));
    if (patterns[patterns.length - 1] !== p) patterns.push(p);
  }
  return patterns;
}

export function isOrderedSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (i < needle.length && item === needle[i]) i++;
  }
  return i === needle.length;
}
