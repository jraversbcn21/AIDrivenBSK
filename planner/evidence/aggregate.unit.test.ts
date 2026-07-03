import { describe, it, expect } from 'vitest';
import { aggregateEvidence } from './aggregate';

const NOW = '2026-07-02T20:00:00Z';

describe('aggregateEvidence', () => {
  it('keeps entries with a parseable attachment and their status', () => {
    const e = aggregateEvidence([
      { specFile: 'tests/auth/login.spec.ts', title: 'logs in', status: 'passed', attachmentBody: '["https://x/","https://x/es/logon.html"]' },
      { specFile: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'failed', attachmentBody: '["https://x/"]' },
    ], NOW);
    expect(e.generatedAt).toBe(NOW);
    expect(e.tests).toEqual([
      { spec: 'tests/auth/login.spec.ts', title: 'logs in', status: 'passed', urls: ['https://x/', 'https://x/es/logon.html'] },
      { spec: 'tests/cart/add-to-cart.spec.ts', title: 'adds', status: 'failed', urls: ['https://x/'] },
    ]);
  });
  it('skips entries without an attachment (e.g. auth.setup, which uses the raw base test)', () => {
    const e = aggregateEvidence([{ specFile: 'tests/auth.setup.ts', title: 'authenticate', status: 'passed' }], NOW);
    expect(e.tests).toEqual([]);
  });
  it('skips entries whose attachment is not valid JSON', () => {
    const e = aggregateEvidence([{ specFile: 's.ts', title: 't', status: 'passed', attachmentBody: 'not-json' }], NOW);
    expect(e.tests).toEqual([]);
  });
  it('normalizes Windows path separators in spec paths', () => {
    const e = aggregateEvidence([{ specFile: 'tests\\cart\\add-to-cart.spec.ts', title: 't', status: 'passed', attachmentBody: '[]' }], NOW);
    expect(e.tests[0].spec).toBe('tests/cart/add-to-cart.spec.ts');
  });
});
