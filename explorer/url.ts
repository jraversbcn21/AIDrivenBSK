export function normalizePath(rawUrl: string, baseURL: string): string {
  const u = new URL(rawUrl, baseURL);
  let p = u.pathname;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p.toLowerCase();
}

// Confirmed live against DES: PDP URLs end in `-c0p<numericId>.html` (e.g. `-c0p229723098.html`).
export function routePattern(path: string): string {
  return path
    .replace(/-c0p\d+\.html$/i, '-c0p{id}.html') // product detail pattern
    .replace(/\/\d+(?=\/|$)/g, '/{id}');          // generic numeric id segments
}

export interface RouteRules {
  allow: RegExp[];
  deny: RegExp[];
}

export const DEFAULT_ROUTE_RULES: RouteRules = {
  allow: [],
  deny: [
    /(?:^|\/)campaign(?:\/|$)/i,
    /(?:^|\/)landing(?:\/|$)/i,
    /(?:^|\/)promo(?:\/|$)/i,
    /(?:^|\/)marketing(?:\/|$)/i,
    /(?:^|\/)newsletter(?:\/|$)/i,
  ],
};

export function isDenied(path: string, rules: RouteRules): boolean {
  return rules.deny.some((r) => r.test(path));
}

export function isAllowed(path: string, rules: RouteRules): boolean {
  if (isDenied(path, rules)) return false;
  return rules.allow.length === 0 || rules.allow.some((r) => r.test(path));
}

export function isSameOrigin(href: string, baseURL: string): boolean {
  try {
    return new URL(href, baseURL).host === new URL(baseURL).host;
  } catch {
    return false;
  }
}
