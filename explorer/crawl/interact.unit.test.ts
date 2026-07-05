import { describe, it, expect } from 'vitest';
import { InteractionLedger, selectCandidates } from './interact';
import type { ExtractedElement } from '../types';

const btn = (label: string, over: Partial<ExtractedElement> = {}): ExtractedElement => ({
  type: 'button', label, role: 'button',
  selectorHints: { role: { type: 'button', name: label } }, destructive: false, ...over,
});

describe('selectCandidates', () => {
  it('filters to non-destructive role-hinted buttons within budget', () => {
    const ledger = new InteractionLedger();
    const els = [
      btn('Añadir a cesta'),
      btn('Comprar', { destructive: true }),
      btn('', { selectorHints: {} }),
      { ...btn('Ir a la cesta'), type: 'link' } as ExtractedElement,
      btn('Filtrar', { type: 'filter' }),
      btn('Ordenar', { type: 'sort' }),
      btn('Cuarto botón'),
    ];
    const picked = selectCandidates(els, '/es/prod-c0p1.html', ledger, 3);
    expect(picked.map((e) => e.label)).toEqual(['Añadir a cesta', 'Filtrar', 'Ordenar']);
  });

  it('dedupes page-specific triggers by routePattern across pages', () => {
    const ledger = new InteractionLedger();
    // Both normalize to the same routePattern ('/es/a-c0p{id}.html') — same equivalence class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([btn('Añadir a cesta')], '/es/a-c0p2.html', ledger, 3)).toHaveLength(0);
    // Different routePattern entirely — not deduped against the c0p class.
    expect(selectCandidates([btn('Añadir a cesta')], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(1);
  });

  it('dedupes chrome triggers globally regardless of route', () => {
    const ledger = new InteractionLedger();
    const menu = btn('Menú', { component: 'Header' });
    expect(selectCandidates([menu], '/es/a-c0p1.html', ledger, 3)).toHaveLength(1);
    expect(selectCandidates([menu], '/es/mujer/ropa.html', ledger, 3)).toHaveLength(0);
  });
});
