import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { hintsFor } from './hints';

function elementFor(html: string): Element {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const el = document.body.firstElementChild;
  if (!el) throw new Error('test fixture produced no element');
  return el as unknown as Element;
}

describe('hintsFor', () => {
  it('reads a data-qa-anchor testId (DES\'s dominant live attribute, findings §12)', () => {
    const el = elementFor('<button data-qa-anchor="addToCartSizeBtn">Añadir</button>');
    expect(hintsFor(el).testId).toEqual({ attr: 'data-qa-anchor', value: 'addToCartSizeBtn' });
  });
  it('still reads data-testid when present', () => {
    const el = elementFor('<button data-testid="add-to-cart">Añadir</button>');
    expect(hintsFor(el).testId).toEqual({ attr: 'data-testid', value: 'add-to-cart' });
  });
  it('still reads data-qa when present', () => {
    const el = elementFor('<button data-qa="add-to-cart">Añadir</button>');
    expect(hintsFor(el).testId).toEqual({ attr: 'data-qa', value: 'add-to-cart' });
  });
  it('leaves testId unset when none of the three attributes are present', () => {
    const el = elementFor('<button>Añadir</button>');
    expect(hintsFor(el).testId).toBeUndefined();
  });
});
