import { describe, it, expect } from 'vitest';
import { analyzePage } from './analyze';
import type { PageMeta } from '../types';

const meta: PageMeta = { path: '/es/x', url: 'https://des.example/es/x', title: 'X', session: 'anon', discoveredVia: 'seed' };

const HTML = `
<html><body>
  <header><nav><input type="search" aria-label="Buscar" /></nav></header>
  <main>
    <a href="/es/product/abc-p123.html">Camiseta</a>
    <button data-testid="add-to-cart">Añadir a la cesta</button>
    <button>Pagar</button>
    <form aria-label="login">
      <input name="email" type="email" required />
      <input name="password" type="password" required />
    </form>
    <div role="dialog" aria-label="cookies">consent</div>
  </main>
  <footer>info</footer>
</body></html>`;

describe('analyzePage', () => {
  it('extracts links', () => {
    const r = analyzePage(HTML, meta);
    expect(r.links).toContain('/es/product/abc-p123.html');
  });
  it('extracts buttons with selector hints and marks destructive ones', () => {
    const r = analyzePage(HTML, meta);
    const addToCart = r.elements.find((e) => e.label.includes('Añadir'));
    const pay = r.elements.find((e) => e.label === 'Pagar');
    expect(addToCart?.selectorHints.testId).toBe('add-to-cart');
    expect(addToCart?.destructive).toBe(false);
    expect(pay?.destructive).toBe(true);
  });
  it('extracts forms with fields and a purpose hint', () => {
    const r = analyzePage(HTML, meta);
    expect(r.forms[0].fields.map((f) => f.name)).toEqual(['email', 'password']);
    expect(r.forms[0].purposeHint).toBe('login');
  });
  it('detects modal elements and component kinds', () => {
    const r = analyzePage(HTML, meta);
    expect(r.elements.some((e) => e.type === 'modal')).toBe(true);
    expect(r.componentKinds).toEqual(expect.arrayContaining(['Header', 'Footer', 'SearchBar']));
  });
});
