# Oráculo #8 — disponibilidad de tallas overlay↔PDP (diseño)

**Fecha:** 2026-08-21. **Aprobado por:** Jorge. **Programa:** oráculos de correctness (findings §40).

## Contexto

§42 comparó la LISTA de tallas overlay↔PDP y dejó la **disponibilidad** (tallas deshabilitadas)
fuera de alcance deliberadamente: el producto probado no tenía tallas agotadas, así que esa
forma quedó sin probar en ambos lados. Jorge confirma (QA manual, 2026-08-21) que una talla
agotada se muestra **deshabilitada/tachada visible** (no oculta) — el oráculo es construible.

## Aserción

Para la primera card (de las primeras K=6 del primer viewport) cuyo overlay de tallas tenga
≥1 talla deshabilitada, el conjunto completo de tuplas **(talla, deshabilitada)** del overlay
debe coincidir exactamente con el del `group "Selecciona talla"` del PDP de esa misma card.
Prometer disponibilidad en el overlay que el PDP niega (o viceversa) = bug real de
catálogo/stock de DES.

## Naturaleza oportunista — decisión de diseño central

El estado discriminante (un producto **parcialmente** agotado) no se puede construir, solo
encontrar. Enfoque aprobado (A):

- Escanear las primeras 6 cards abriendo el overlay de cada una; primera con talla
  deshabilitada → candidata, break.
- Sin candidata en 6 cards → **`test.skip()`** con mensaje explícito ("ningún producto
  parcialmente agotado en las primeras 6 cards — nada que comparar"). Un skip es visible en
  el report y es la respuesta honesta: ni verde falso (§29), ni rojo por un estado de
  negocio (el stock) que no controlamos.
- Coste aceptado: ~5-15s por overlay en el peor caso; skip será el resultado en ventanas de
  stock sano.

## Ruta

La decide el probe. Orden de búsqueda: **Hombre Lo Más Vendido** primero (best-sellers = más
agotados), luego Hombre Camisas, Hombre Combo Wins, Pantalones Capri, Pantalones Combo Wins,
vestidos. El oráculo aterriza donde haya evidencia de tallas agotadas. **Retroceso parcial de
§44, aceptado:** esa ruta gana un segundo oráculo (un bounce ahí mataría 2, no 1) — se
documenta en el comentario de cabecera del spec.

## Flujo del spec

1. Navegación param-less → `ensureOnPlp` → para cada card i (0..5): abrir su overlay
   (trigger card-scoped `[data-qa-anchor="addToCartSizeBtn"]` anclado al `-c0p` id de ESA
   card, §42), leer el `ariaSnapshot` del dialog con bound 5s extrayendo tuplas
   (talla, deshabilitada), cerrar con Escape (§17). Primera card con talla deshabilitada →
   candidata; break.
2. Sin candidata → `test.skip()` (mensaje arriba).
3. Navegar al PDP anclado al `-c0p` de la candidata: loop act→verify→retry con re-anclaje
   `ensureOnPlp` guardado (patrón §41/§45 — nunca navegar fuera de un PDP ya alcanzado).
4. Leer las tuplas del `group "Selecciona talla"` del PDP (forma del marcador según probe) y
   comparar con `expect.poll`; el string de fallo lista **ambos conjuntos completos**.

## Probe previo obligatorio (~20 min, se borra tras aterrizar — ciclo §18)

Tres desconocidos reales; resultados → findings **§46**:

- (a) ¿En qué ruta hay hoy tallas agotadas en el primer viewport? (decide la ruta)
- (b) ¿Cómo marca el overlay una talla deshabilitada en el aria snapshot — `[disabled]`,
  nombre distinto ("Avísame"/"agotada"), u otra cosa?
- (c) Ídem en el PDP: los botones del size group exponen `aria-pressed` (§24); la forma
  deshabilitada está sin probar.

## Techos conocidos (documentados también en el spec)

- **Carrera contra el negocio:** el stock puede cambiar entre la lectura del overlay y la del
  PDP (segundos). Irreducible; mitigación = mensaje con ambos lados + el retry re-mide.
- **Validación condicionada al estado:** si el día de la validación no hay tallas agotadas,
  el camino del assert queda sin validar (solo el camino skip) — se declara honestamente
  (postura §26) y se valida cuando el estado exista.

## Qué NO hace

- No scrollea (lazy-load §31).
- No re-compara lista/orden de tallas (eso es §42) ni precios.
- No toca los specs existentes.

## Validación

- Probe en vivo → findings §46.
- Spec en vivo standalone: 2 pases. Resultado esperado = PASS (si hay stock agotado ese día)
  o SKIP (si no) — ambos se registran con su tiempo; un FAIL se lee de su `error-context.md`
  antes de re-lanzar (§28).
- `pnpm typecheck` / `pnpm lint`.
- El full `qa-cycle` llega con el siguiente ciclo regular.
