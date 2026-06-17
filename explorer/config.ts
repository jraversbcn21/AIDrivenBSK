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

export function loadExplorerConfig(overrides: Partial<ExplorerConfig> = {}): ExplorerConfig {
  const maxPages = process.env.EXPLORER_MAX_PAGES ? Number(process.env.EXPLORER_MAX_PAGES) : DEFAULTS.bounds.maxPages;
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
