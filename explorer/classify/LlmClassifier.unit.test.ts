import { describe, it, expect, vi } from 'vitest';
import { LlmClassifier } from './LlmClassifier';
import { RuleClassifier } from './RuleClassifier';
import type { PageContext } from './Classifier';

const ctx: PageContext = { path: '/es/x', title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false } };

describe('LlmClassifier', () => {
  it('parses a valid JSON completion', async () => {
    const complete = vi.fn().mockResolvedValue('{"pageType":"Wishlist","confidence":0.88}');
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect(await c.classifyPage(ctx)).toEqual({ pageType: 'Wishlist', confidence: 0.88 });
    expect(complete).toHaveBeenCalledOnce();
  });
  it('falls back to rules on transport error', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('network'));
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect((await c.classifyPage(ctx)).pageType).toBe('Other');
  });
  it('falls back to rules on an invalid pageType', async () => {
    const complete = vi.fn().mockResolvedValue('{"pageType":"Nonsense","confidence":1}');
    const c = new LlmClassifier(complete, new RuleClassifier());
    expect((await c.classifyPage(ctx)).pageType).toBe('Other');
  });
});
