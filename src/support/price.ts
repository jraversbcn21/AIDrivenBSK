/**
 * Parses the FIRST euro amount out of a text blob in es-ES format
 * ('.' thousands, ',' decimals — e.g. "1.234,56 €"). Returns null when none is
 * present (skeleton text, "Gratis", empty string). Pure on purpose: the DOM-facing
 * caller is CartPage.totalAmount(); keeping the parsing here makes it unit-testable
 * without a browser (design 2026-08-13-cart-regression-design.md).
 */
export function parseEuroAmount(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*€/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) + Number(m[2]) / 100;
}
