import { describe, it, expect } from 'vitest';
import { parseAriaSnapshot } from './aria';

const SNAPSHOT = `- banner:
  - navigation:
    - searchbox "Buscar"
- main:
  - heading "Novedades" [level=1]
  - link "Camiseta":
    - /url: /es/product/abc-c0p123.html
  - button "Añadir a la cesta"
  - button "Pagar"
  - form "login":
    - textbox "E-mail"
    - textbox "Contraseña"
    - button "Iniciar sesión"
  - dialog "cookies":
    - text: consent
    - button "Aceptar"
  - list:
    - listitem:
      - 'link "Ir a: Faldas"':
        - /url: /es/mujer/faldas-c0p456.html
- contentinfo: info`;

describe('parseAriaSnapshot', () => {
  const roots = parseAriaSnapshot(SNAPSHOT);

  it('builds the top-level landmark sequence', () => {
    expect(roots.map((n) => n.role)).toEqual(['banner', 'main', 'contentinfo']);
  });

  it('nests children by indentation', () => {
    expect(roots[0].children[0].role).toBe('navigation');
    expect(roots[0].children[0].children[0]).toMatchObject({ role: 'searchbox', name: 'Buscar' });
  });

  it('attaches /url children to their parent link', () => {
    const link = roots[1].children.find((n) => n.role === 'link');
    expect(link).toMatchObject({ name: 'Camiseta', url: '/es/product/abc-c0p123.html' });
  });

  it('ignores attribute blocks like [level=1]', () => {
    expect(roots[1].children[0]).toMatchObject({ role: 'heading', name: 'Novedades' });
  });

  it('captures text nodes', () => {
    const dialog = roots[1].children.find((n) => n.role === 'dialog');
    expect(dialog?.children[0]).toMatchObject({ role: 'text', text: 'consent' });
  });

  it('unwraps single-quoted entries containing colons', () => {
    const listitem = roots[1].children.find((n) => n.role === 'list')?.children[0];
    expect(listitem?.children[0]).toMatchObject({ role: 'link', name: 'Ir a: Faldas', url: '/es/mujer/faldas-c0p456.html' });
  });

  it('parses inline text after a role (contentinfo: info) as a text child', () => {
    expect(roots[2].children[0]).toMatchObject({ role: 'text', text: 'info' });
  });
});
