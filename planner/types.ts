export interface EvidenceTestEntry {
  spec: string;
  title: string;
  status: string;
  urls: string[];
}

export interface RouteEvidence {
  generatedAt: string;
  tests: EvidenceTestEntry[];
}
