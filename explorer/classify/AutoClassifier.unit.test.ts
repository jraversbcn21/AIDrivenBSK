import { describe, it, expect, vi } from 'vitest';
import { AutoClassifier } from './AutoClassifier';
import type { Classifier, PageContext } from './Classifier';

const ctx = { path: '/es/x', title: '', landmarkRoles: [], textSummary: '',
  signals: { hasAddToCart: false, hasSizeSelector: false, hasProductGrid: false, hasFilters: false, hasCheckoutSteps: false, hasLoginForm: false, hasSearchResults: false } } as PageContext;

const stub = (pageType: string, confidence: number): Classifier => ({ classifyPage: vi.fn().mockResolvedValue({ pageType, confidence }) });

describe('AutoClassifier', () => {
  it('uses rules result when confidence >= threshold', async () => {
    const llm = stub('PDP', 0.99);
    const c = new AutoClassifier(stub('Home', 0.9), llm, 0.7);
    expect((await c.classifyPage(ctx)).pageType).toBe('Home');
    expect(llm.classifyPage).not.toHaveBeenCalled();
  });
  it('defers to llm when rules confidence < threshold', async () => {
    const c = new AutoClassifier(stub('Other', 0.3), stub('PDP', 0.95), 0.7);
    expect((await c.classifyPage(ctx)).pageType).toBe('PDP');
  });
});
