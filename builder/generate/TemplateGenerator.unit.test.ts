import { describe, it, expect } from 'vitest';
import { TemplateGenerator } from './TemplateGenerator';
import type { JourneyInput } from './Generator';

const input: JourneyInput = {
  flowId: 'flow_a1b2c3d4e5f6',
  journeyName: '/ -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html',
  session: 'anon',
  chain: [
    { path: '/', routePattern: '/', title: 'Home' },
    { path: '/es/h-woman.html', routePattern: '/es/h-woman.html', title: 'Woman' },
    { path: '/es/mujer/ropa/camisetas-n4365.html', routePattern: '/es/mujer/ropa/camisetas-n4365.html', title: 'Camisetas' },
  ],
  loadedSignal: { role: { type: 'button', name: 'Filtrar' } },
  mapGeneratedAt: '2026-07-03T06:00:00Z',
};

describe('TemplateGenerator', () => {
  const g = new TemplateGenerator();
  const [pageFile, specFile] = g.generate(input);

  it('emits the page object at pages/<ClassName>.ts extending BasePage with the chain walk', () => {
    expect(pageFile.relPath).toBe('pages/MujerRopaCamisetasN4365PageA1B2C3D4.ts');
    expect(pageFile.content).toContain('export class MujerRopaCamisetasN4365PageA1B2C3D4 extends BasePage {');
    expect(pageFile.content).toContain("await this.goto('/');");
    expect(pageFile.content).toContain("await this.goto('/es/h-woman.html');");
    expect(pageFile.content).toContain("await this.goto('/es/mujer/ropa/camisetas-n4365.html');");
    expect(pageFile.content).toContain("locate(this.page, { role: { type: 'button', name: 'Filtrar' } })");
  });

  it('emits the spec importing the shared fixture and polling isLoaded', () => {
    expect(specFile.relPath).toBe('camisetas-n4365-a1b2c3d4.spec.ts');
    expect(specFile.content).toContain("import { test, expect } from '../../src/fixtures/test';");
    expect(specFile.content).toContain("import { MujerRopaCamisetasN4365PageA1B2C3D4 } from './pages/MujerRopaCamisetasN4365PageA1B2C3D4';");
    expect(specFile.content).toContain('journey: / -> /es/h-woman.html -> /es/mujer/ropa/camisetas-n4365.html');
    expect(specFile.content).toContain('await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);');
  });

  it('stamps a header with flowId and map generatedAt — never wall-clock time', () => {
    for (const f of [pageFile, specFile]) {
      expect(f.content.startsWith('// GENERATED from flow flow_a1b2c3d4e5f6 (map generated 2026-07-03T06:00:00Z)')).toBe(true);
    }
  });

  it('is fully deterministic: same input, identical bytes', () => {
    expect(g.generate(input)).toEqual(g.generate(input));
  });

  it('falls back to the main landmark when loadedSignal is null, without importing locate', () => {
    const [p] = g.generate({ ...input, loadedSignal: null });
    expect(p.content).toContain("return this.page.getByRole('main').isVisible();");
    expect(p.content).not.toContain('import { locate }');
  });

  it('escapes single quotes in strategy names', () => {
    const [p] = g.generate({ ...input, loadedSignal: { role: { type: 'button', name: "Women's sale" } } });
    expect(p.content).toContain("name: 'Women\\'s sale'");
  });

  it('emits a nested testId literal carrying the attribute provenance', () => {
    const [p] = g.generate({ ...input, loadedSignal: { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } } });
    expect(p.content).toContain("locate(this.page, { testId: { attr: 'data-qa-anchor', value: 'addToCartSizeBtn' } })");
    expect(p.content).toContain("import { locate }");
  });
});
