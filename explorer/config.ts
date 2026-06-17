export type ClassifierMode = 'rules' | 'llm' | 'auto';

export interface CrawlBounds {
  maxPages: number;
  maxDepth: number;
  politenessMs: number;
}

export interface LlmConfig {
  model: string;
  apiKeyEnv: string;
}

export interface ExplorerConfig {
  mode: ClassifierMode;
  bounds: CrawlBounds;
  llm: LlmConfig;
  autoThreshold: number;
}

const MODES: ClassifierMode[] = ['rules', 'llm', 'auto'];

const DEFAULTS: ExplorerConfig = {
  mode: 'rules',
  bounds: { maxPages: 200, maxDepth: 4, politenessMs: 300 },
  llm: { model: 'claude-haiku-4-5-20251001', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  autoThreshold: 0.7,
};

function envMode(): ClassifierMode | undefined {
  const m = process.env.EXPLORER_MODE;
  if (m === undefined) return undefined;
  if (!MODES.includes(m as ClassifierMode)) {
    throw new Error(`EXPLORER_MODE must be one of: ${MODES.join(' | ')}`);
  }
  return m as ClassifierMode;
}

export function assertCrawlableEnv(
  envName: string,
  allowProd: boolean = process.env.EXPLORER_ALLOW_PROD === 'true',
): void {
  if (envName === 'prod' && !allowProd) {
    throw new Error('Explorer refuses to crawl prod by default. Set EXPLORER_ALLOW_PROD=true to override.');
  }
}

export function loadExplorerConfig(overrides: Partial<ExplorerConfig> = {}): ExplorerConfig {
  let maxPages = DEFAULTS.bounds.maxPages;
  if (process.env.EXPLORER_MAX_PAGES !== undefined) {
    const n = Number(process.env.EXPLORER_MAX_PAGES);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('EXPLORER_MAX_PAGES must be a positive number');
    }
    maxPages = n;
  }
  const base: ExplorerConfig = {
    ...DEFAULTS,
    mode: envMode() ?? DEFAULTS.mode,
    bounds: { ...DEFAULTS.bounds, maxPages },
  };
  return {
    ...base,
    ...overrides,
    bounds: { ...base.bounds, ...overrides.bounds },
    llm: { ...base.llm, ...overrides.llm },
  };
}
