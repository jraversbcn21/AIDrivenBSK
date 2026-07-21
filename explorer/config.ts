export type ClassifierMode = 'rules' | 'llm' | 'auto';
export type ExtractionMode = 'aria' | 'dom';

export interface CrawlBounds {
  maxPages: number;
  maxDepth: number;
  politenessMs: number;
  timeBudgetMs: number;
}

export interface LlmConfig {
  model: string;
  apiKeyEnv: string;
}

export interface InteractionsConfig {
  enabled: boolean;
  maxPerPage: number;
  /** Trigger-label patterns with guaranteed capture: prioritized on every page until
   *  each yields one `overlay` outcome anywhere in the crawl (design 2026-07-05-m8b §3). */
  mustCapture: RegExp[];
}

export interface ExplorerConfig {
  mode: ClassifierMode;
  extraction: ExtractionMode;
  bounds: CrawlBounds;
  llm: LlmConfig;
  autoThreshold: number;
  interactions: InteractionsConfig;
  /** Seed the auth-session crawl with the checkout entry flow (D15 phase 2, branch C).
   *  Default off — a crawl without EXPLORER_SEED_CHECKOUT behaves exactly as before. */
  seedCheckout: boolean;
}

const MODES: ClassifierMode[] = ['rules', 'llm', 'auto'];
const EXTRACTIONS: ExtractionMode[] = ['aria', 'dom'];

const DEFAULTS: ExplorerConfig = {
  mode: 'rules',
  extraction: 'aria',
  bounds: { maxPages: 200, maxDepth: 4, politenessMs: 300, timeBudgetMs: 600_000 },
  llm: { model: 'claude-haiku-4-5-20251001', apiKeyEnv: 'ANTHROPIC_API_KEY' },
  autoThreshold: 0.7,
  interactions: { enabled: true, maxPerPage: 3, mustCapture: [/^añadir a (la )?cesta/i] },
  seedCheckout: false,
};

function envMode(): ClassifierMode | undefined {
  const m = process.env.EXPLORER_MODE;
  if (m === undefined) return undefined;
  if (!MODES.includes(m as ClassifierMode)) {
    throw new Error(`EXPLORER_MODE must be one of: ${MODES.join(' | ')}`);
  }
  return m as ClassifierMode;
}

function envExtraction(): ExtractionMode | undefined {
  const e = process.env.EXPLORER_EXTRACTION;
  if (e === undefined) return undefined;
  if (!EXTRACTIONS.includes(e as ExtractionMode)) {
    throw new Error(`EXPLORER_EXTRACTION must be one of: ${EXTRACTIONS.join(' | ')}`);
  }
  return e as ExtractionMode;
}

function envInteractions(): boolean | undefined {
  const v = process.env.EXPLORER_INTERACTIONS;
  if (v === undefined) return undefined;
  if (v !== 'on' && v !== 'off') throw new Error('EXPLORER_INTERACTIONS must be on | off');
  return v === 'on';
}

function envSeedCheckout(): boolean | undefined {
  const v = process.env.EXPLORER_SEED_CHECKOUT;
  if (v === undefined) return undefined;
  if (v !== 'on' && v !== 'off') throw new Error('EXPLORER_SEED_CHECKOUT must be on | off');
  return v === 'on';
}

function envMustCapture(): RegExp[] | undefined {
  const raw = process.env.EXPLORER_MUST_CAPTURE;
  if (raw === undefined) return undefined;
  // Semicolon-separated regex sources; empty string disables must-capture (design §3.1).
  const sources = raw.split(';').map((s) => s.trim()).filter((s) => s !== '');
  return sources.map((s) => {
    try {
      return new RegExp(s, 'i');
    } catch {
      throw new Error(`EXPLORER_MUST_CAPTURE: invalid regex "${s}"`);
    }
  });
}

function envPositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
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
  const maxPages = envPositiveNumber('EXPLORER_MAX_PAGES', DEFAULTS.bounds.maxPages);
  const timeBudgetMs = envPositiveNumber('EXPLORER_TIME_BUDGET_MS', DEFAULTS.bounds.timeBudgetMs);
  const base: ExplorerConfig = {
    ...DEFAULTS,
    mode: envMode() ?? DEFAULTS.mode,
    extraction: envExtraction() ?? DEFAULTS.extraction,
    bounds: { ...DEFAULTS.bounds, maxPages, timeBudgetMs },
    interactions: {
      enabled: envInteractions() ?? DEFAULTS.interactions.enabled,
      maxPerPage: envPositiveNumber('EXPLORER_MAX_INTERACTIONS_PER_PAGE', DEFAULTS.interactions.maxPerPage),
      mustCapture: envMustCapture() ?? DEFAULTS.interactions.mustCapture,
    },
    seedCheckout: envSeedCheckout() ?? DEFAULTS.seedCheckout,
  };
  return {
    ...base,
    ...overrides,
    bounds: { ...base.bounds, ...overrides.bounds },
    llm: { ...base.llm, ...overrides.llm },
    interactions: { ...base.interactions, ...overrides.interactions },
  };
}
