const DESTRUCTIVE_RE =
  /\b(pay|pagar|place\s*order|realizar\s*pedido|delete|eliminar|borrar|remove|quitar|confirm(ar)?|buy\s*now|comprar)\b/i;

export function isDestructive(label: string): boolean {
  if (!label) return false;
  return DESTRUCTIVE_RE.test(label);
}
