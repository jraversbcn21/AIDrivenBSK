const stripDiacritics = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function words(raw: string): string[] {
  return stripDiacritics(raw)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function nonLocaleSegments(routePattern: string): string[] {
  return decodeURIComponent(routePattern)
    .split('/')
    .filter(Boolean)
    .filter((seg, i) => !(i === 0 && /^[a-z]{2}$/i.test(seg)))
    .map((seg) => seg.replace(/\.html?$/i, '').replace(/\{id\}/g, ''));
}

export function classNameFor(routePattern: string): string {
  const ws = words(nonLocaleSegments(routePattern).join('-'));
  const base = ws.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return `${base || 'Home'}Page`;
}

export function specFileNameFor(routePattern: string, flowId: string): string {
  const segments = nonLocaleSegments(routePattern);
  const slug = words(segments[segments.length - 1] ?? '').join('-') || 'home';
  return `${slug}-${flowId.replace(/^flow_/, '').slice(0, 8)}.spec.ts`;
}

export function pageFileNameFor(routePattern: string): string {
  return `${classNameFor(routePattern)}.ts`;
}
