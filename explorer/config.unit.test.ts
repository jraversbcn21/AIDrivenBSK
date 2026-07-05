import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertCrawlableEnv, loadExplorerConfig } from './config';

describe('loadExplorerConfig', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.EXPLORER_MODE;
    delete process.env.EXPLORER_MAX_PAGES;
    delete process.env.EXPLORER_ALLOW_PROD;
    delete process.env.EXPLORER_EXTRACTION;
    delete process.env.EXPLORER_TIME_BUDGET_MS;
    delete process.env.EXPLORER_INTERACTIONS;
    delete process.env.EXPLORER_MAX_INTERACTIONS_PER_PAGE;
    delete process.env.EXPLORER_MUST_CAPTURE;
  });
  afterEach(() => { process.env = { ...saved }; });

  it('provides sensible defaults', () => {
    const c = loadExplorerConfig();
    expect(c.mode).toBe('rules');
    expect(c.bounds.maxPages).toBeGreaterThan(0);
    expect(c.llm.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
  });

  it('reads mode and bounds from env', () => {
    process.env.EXPLORER_MODE = 'auto';
    process.env.EXPLORER_MAX_PAGES = '50';
    const c = loadExplorerConfig();
    expect(c.mode).toBe('auto');
    expect(c.bounds.maxPages).toBe(50);
  });

  it('applies explicit overrides over env and defaults', () => {
    process.env.EXPLORER_MODE = 'auto';
    const c = loadExplorerConfig({ mode: 'rules' });
    expect(c.mode).toBe('rules');
  });

  it('rejects an invalid mode', () => {
    process.env.EXPLORER_MODE = 'bogus';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_MODE/);
  });

  it('rejects a non-numeric EXPLORER_MAX_PAGES', () => {
    process.env.EXPLORER_MAX_PAGES = 'abc';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_MAX_PAGES/);
  });

  it('accepts a valid EXPLORER_MAX_PAGES', () => {
    process.env.EXPLORER_MAX_PAGES = '50';
    const c = loadExplorerConfig();
    expect(c.bounds.maxPages).toBe(50);
  });

  it('defaults extraction to aria and time budget to 10 minutes', () => {
    const c = loadExplorerConfig();
    expect(c.extraction).toBe('aria');
    expect(c.bounds.timeBudgetMs).toBe(600_000);
  });

  it('reads extraction mode and time budget from env', () => {
    process.env.EXPLORER_EXTRACTION = 'dom';
    process.env.EXPLORER_TIME_BUDGET_MS = '120000';
    const c = loadExplorerConfig();
    expect(c.extraction).toBe('dom');
    expect(c.bounds.timeBudgetMs).toBe(120_000);
  });

  it('rejects an invalid extraction mode', () => {
    process.env.EXPLORER_EXTRACTION = 'bogus';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_EXTRACTION/);
  });

  it('rejects a non-positive time budget', () => {
    process.env.EXPLORER_TIME_BUDGET_MS = '0';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_TIME_BUDGET_MS/);
  });

  it('defaults interactions to enabled, maxPerPage 3, and the añadir-a-cesta must-capture', () => {
    const cfg = loadExplorerConfig();
    expect(cfg.interactions.enabled).toBe(true);
    expect(cfg.interactions.maxPerPage).toBe(3);
    expect(cfg.interactions.mustCapture).toHaveLength(1);
    // Both live label variants: PDP main button and card quick-add (design §3.1).
    expect(cfg.interactions.mustCapture[0].test('Añadir a cesta')).toBe(true);
    expect(cfg.interactions.mustCapture[0].test('Añadir a la cesta Short denim mini')).toBe(true);
    expect(cfg.interactions.mustCapture[0].test('Filtrar')).toBe(false);
  });

  it('EXPLORER_INTERACTIONS=off disables', () => {
    process.env.EXPLORER_INTERACTIONS = 'off';
    expect(loadExplorerConfig().interactions.enabled).toBe(false);
  });

  it('EXPLORER_INTERACTIONS=on enables', () => {
    process.env.EXPLORER_INTERACTIONS = 'on';
    expect(loadExplorerConfig().interactions.enabled).toBe(true);
  });

  it('rejects invalid EXPLORER_INTERACTIONS', () => {
    process.env.EXPLORER_INTERACTIONS = 'yes';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_INTERACTIONS/);
  });

  it('EXPLORER_MAX_INTERACTIONS_PER_PAGE overrides the budget', () => {
    process.env.EXPLORER_MAX_INTERACTIONS_PER_PAGE = '5';
    expect(loadExplorerConfig().interactions.maxPerPage).toBe(5);
  });

  it('EXPLORER_MUST_CAPTURE replaces the default list (semicolon-separated, case-insensitive)', () => {
    process.env.EXPLORER_MUST_CAPTURE = '^categorías y productos; ^mercado';
    const { mustCapture } = loadExplorerConfig().interactions;
    expect(mustCapture).toHaveLength(2);
    expect(mustCapture[0].test('Categorías y productos')).toBe(true);
    expect(mustCapture[1].test('Mercado')).toBe(true);
    expect(mustCapture.some((r) => r.test('Añadir a cesta'))).toBe(false);
  });

  it('EXPLORER_MUST_CAPTURE="" disables must-capture entirely', () => {
    process.env.EXPLORER_MUST_CAPTURE = '';
    expect(loadExplorerConfig().interactions.mustCapture).toEqual([]);
  });

  it('rejects an invalid EXPLORER_MUST_CAPTURE regex', () => {
    process.env.EXPLORER_MUST_CAPTURE = '([';
    expect(() => loadExplorerConfig()).toThrow(/EXPLORER_MUST_CAPTURE/);
  });
});

describe('assertCrawlableEnv', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.EXPLORER_ALLOW_PROD; });
  afterEach(() => { process.env = { ...saved }; });

  it('does not throw for non-prod environments', () => {
    expect(() => assertCrawlableEnv('des')).not.toThrow();
  });

  it('throws for prod by default', () => {
    expect(() => assertCrawlableEnv('prod')).toThrow(/prod/);
  });

  it('does not throw for prod when explicitly allowed', () => {
    expect(() => assertCrawlableEnv('prod', true)).not.toThrow();
  });
});
