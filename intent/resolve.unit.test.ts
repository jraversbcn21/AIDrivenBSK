import { describe, it, expect } from 'vitest';
import type { FunctionalMap, MapFlow } from '../explorer/map/schema';
import { resolveIntent, WEIGHTS } from './resolve';

function flow(
  id: string, name: string, type: string, steps: number,
  coveredBy: string[] = [], session: 'anon' | 'auth' = 'auth',
): MapFlow {
  return {
    id, name, type, session, priority: 'high',
    steps: Array.from({ length: steps }, (_, i) => `p-${id}-${i}`),
    coveredBy,
  };
}

// Realistic shapes taken from the actual committed map's vocabulary.
const map: FunctionalMap = {
  schemaVersion: '1.7', generatedAt: '2026-07-14T00:00:00.000Z', environment: 'des',
  pages: [], components: [], elements: [], forms: [], interactions: [],
  flows: [
    flow('f-cart', '/es/h-woman.html -> /es/shop-cart.html', 'Cart', 2, ['tests/cart/add-to-cart.spec.ts']),
    flow('f-bombacho', '/es/h-woman.html -> /es/mujer/ropa/pantalones-n3888.html -> /es/mujer/ropa/pantalones/bombacho-%7c-barrel-c1010868620.html', 'PLP', 3),
    flow('f-capri', '/es/h-woman.html -> /es/mujer/ropa/pantalones-n3888.html -> /es/mujer/ropa/pantalones/capri-c1010873129.html', 'PLP', 3),
    flow('f-zap-1', '/es/h-woman.html -> /es/mujer/zapatos-n3432.html', 'PLP', 2),
    flow('f-zap-2', '/es/h-woman.html -> /es/mujer/zapatos-n3432.html -> /es/mujer/zapatos/botas-y-botines-n3435.html', 'PLP', 3),
    flow('f-logon', '/es/h-woman.html -> /es/logon.html', 'Other', 2, ['tests/auth/login.spec.ts']),
  ],
};

describe('resolveIntent', () => {
  it('resolves "prueba el carrito" to the Cart flow via the synonym dictionary (carrito -> cesta/Cart)', () => {
    const r = resolveIntent('prueba el carrito', map);
    expect(r.outcome).toBe('picked');
    expect(r.pick?.flowId).toBe('f-cart');
    expect(r.pick?.reasons.join(' ')).toMatch(/type match: Cart/);
    expect(r.pick?.coveredBy).toEqual(['tests/cart/add-to-cart.spec.ts']);
  });

  it('resolves a specific product intent through URL tokens, diacritics-insensitively', () => {
    const r = resolveIntent('quiero probar el pantalón bombacho', map);
    expect(r.outcome).toBe('picked');
    expect(r.pick?.flowId).toBe('f-bombacho');
  });

  it('lists candidates without picking when the intent is ambiguous (near-tie under the 1.5x rule)', () => {
    const r = resolveIntent('prueba zapatos', map);
    expect(r.outcome).toBe('ambiguous');
    expect(r.pick).toBeNull();
    expect(r.matches.map((m) => m.flowId)).toEqual(['f-zap-1', 'f-zap-2']); // same score: shorter chain listed first
  });

  it('auto-picks when the best clearly beats the runner-up (>= 1.5x)', () => {
    // "pantalones capri": capri hits 2 tokens (pantalones + capri) = 50; bombacho hits 1 (pantalones) = 25.
    const r = resolveIntent('pantalones capri', map);
    expect(r.outcome).toBe('picked');
    expect(r.pick?.flowId).toBe('f-capri');
  });

  it('reports the D15 checkout blind spot explicitly instead of a bare no-match', () => {
    const r = resolveIntent('prueba el checkout', map);
    expect(r.outcome).toBe('no-match');
    expect(r.checkoutBlindSpot).toBe(true);
  });

  it('reports a plain no-match (with sub-threshold suggestions empty here) for alien intents', () => {
    const r = resolveIntent('prueba la newsletter de invierno', map);
    expect(r.outcome).toBe('no-match');
    expect(r.checkoutBlindSpot).toBe(false);
    expect(r.pick).toBeNull();
  });

  it('ignores stopwords and test-speak so they never score', () => {
    const noise = resolveIntent('prueba genera crea un flujo test spec', map);
    expect(noise.outcome).toBe('no-match');
    expect(noise.tokens).toEqual([]);
  });

  it('resolves login intent to the logon flow via synonyms and reports its coverage', () => {
    const r = resolveIntent('verifica el login', map);
    expect(r.outcome).toBe('picked');
    expect(r.pick?.flowId).toBe('f-logon');
    expect(r.pick?.coveredBy).toEqual(['tests/auth/login.spec.ts']);
  });

  it('exposes its weights for documentation and stability', () => {
    expect(WEIGHTS.tokenHit).toBe(25);
    expect(WEIGHTS.typeHit).toBe(40);
    expect(WEIGHTS.minScore).toBe(25);
    expect(WEIGHTS.clearWinnerRatio).toBe(1.5);
  });

  it("carries each match's session, sourced from its flow", () => {
    const soloMap: FunctionalMap = {
      schemaVersion: '1.7', generatedAt: '2026-07-14T00:00:00.000Z', environment: 'des',
      pages: [], components: [], elements: [], forms: [], interactions: [],
      flows: [flow('f-cart-anon', '/es/h-woman.html -> /es/shop-cart.html', 'Cart', 2, [], 'anon')],
    };
    const r = resolveIntent('prueba el carrito', soloMap);
    expect(r.outcome).toBe('picked');
    expect(r.pick?.session).toBe('anon');
  });
});
