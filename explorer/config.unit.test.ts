import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadExplorerConfig } from './config';

describe('loadExplorerConfig', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.EXPLORER_MODE; delete process.env.EXPLORER_MAX_PAGES; });
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
});
