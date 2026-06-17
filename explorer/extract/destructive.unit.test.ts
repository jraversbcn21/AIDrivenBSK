import { describe, it, expect } from 'vitest';
import { isDestructive } from './destructive';

describe('isDestructive', () => {
  it.each(['Pagar', 'Pay now', 'Realizar pedido', 'Eliminar', 'Delete', 'Confirmar compra', 'Buy now'])(
    'flags "%s" as destructive', (label) => { expect(isDestructive(label)).toBe(true); },
  );
  it.each(['Añadir a la cesta', 'Buscar', 'Ver producto', 'Filtrar', ''])(
    'treats "%s" as safe', (label) => { expect(isDestructive(label)).toBe(false); },
  );
});
