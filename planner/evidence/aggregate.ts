import type { RouteEvidence, EvidenceTestEntry } from '../types';

export interface RawResult {
  specFile: string;
  title: string;
  status: string;
  attachmentBody?: string;
}

export function aggregateEvidence(results: RawResult[], now: string): RouteEvidence {
  const tests: EvidenceTestEntry[] = [];
  for (const r of results) {
    if (r.attachmentBody === undefined) continue;
    let urls: string[];
    try {
      const parsed: unknown = JSON.parse(r.attachmentBody);
      if (!Array.isArray(parsed) || !parsed.every((u) => typeof u === 'string')) continue;
      urls = parsed;
    } catch {
      continue;
    }
    tests.push({ spec: r.specFile.replace(/\\/g, '/'), title: r.title, status: r.status, urls });
  }
  return { generatedAt: now, tests };
}
