# Oráculo #7 — card "N COLORES" vs PDP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un séptimo oráculo de correctness: la card PLP que declara "N COLORES" debe llevar a un PDP que ofrezca exactamente N colores.

**Architecture:** Mismo esqueleto que `tests/mujer/plp-pdp-price-consistency.spec.ts` (§41): escaneo de cards del primer viewport con reads bounded → anclaje al `-c0p` id de la card leída → act→verify→retry de navegación con re-anclaje anti-bounce → `expect.poll` cuyo string de retorno lista ambos lados. Un probe en vivo previo (Task 1) resuelve los dos desconocidos: si Hombre Combo Wins tiene cards multicolor, y cómo renderiza el PDP desktop su selector de color.

**Tech Stack:** Playwright + TypeScript; page objects existentes; fixtures de `src/fixtures/test.ts`.

## Global Constraints

- Spec aprobado: `docs/superpowers/specs/2026-08-21-oracle-colores-card-vs-pdp-design.md`.
- Toda lectura que espera (innerText/getAttribute/ariaSnapshot) lleva `{ timeout: 5_000 }` (§43).
- Todo click lleva `{ timeout: 5_000 }` (§26).
- Nunca `.first()` para anclar — solo para "cualquier exemplar" legítimo (§17/§31).
- Selector priority: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`; sin XPath/nth-child.
- Nada de `waitForLoadState('networkidle')` (§2).
- `pnpm typecheck` y `pnpm lint` limpios antes de cada commit.
- VPN activa y DES probado HTTP 200 antes de cualquier paso en vivo.
- Los probes temporales viven en `tests/_probe/` y se BORRAN tras aterrizar su conocimiento en el findings doc (ciclo §18).
- El findings doc nuevo va en una sección **§45** apendizada al final de `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` — nunca renumerar secciones existentes.

---

### Task 1: Probe en vivo — cards multicolor en Hombre Combo Wins + selector de color del PDP

**Files:**
- Create (temporal): `tests/_probe/color-count-probe.spec.ts`
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (nueva §45)

**Interfaces:**
- Produces: hechos registrados en §45 que Task 2 consume — (a) ruta elegida (Hombre Combo Wins o fallback), (b) el locator exacto del selector de color del PDP y su semántica de conteo (¿el color activo cuenta?, ¿rol/nombre de cada swatch?), (c) el texto literal del enlace "N COLORES" en la card (mayúsculas, separador).

- [ ] **Step 1: Escribir el probe**

Ronda 1 (solo lectura, sin clicks): abre Hombre Combo Wins, escanea las primeras 12 cards y loggea el texto completo de cada una — buscamos el patrón `COLORES` y su forma literal. Ronda 2: si hay card multicolor, navega a su PDP (click anclado a su `-c0p` id) y vuelca el `ariaSnapshot` de la zona de info del producto (`div.product-detail-info`, §41) más un inventario de candidatos a swatch (links con `colorId`, botones/radios con nombre de color).

```typescript
// tests/_probe/color-count-probe.spec.ts — TEMPORAL, borrar tras registrar §45 (ciclo §18).
// Instrumentos explícitos, nunca el código bajo diseño (§31).
import { test } from '../../src/fixtures/test';
import { HombreComboWinsPage } from '../hombre/pages/HombreComboWinsPage';

test('PROBE ronda 1+2: cards multicolor y selector de color del PDP', async ({ page }) => {
  test.setTimeout(240_000);
  const plp = new HombreComboWinsPage(page);
  await plp.open();
  await test.expect.poll(() => plp.isLoaded(), { timeout: 20_000 }).toBe(true);

  // Ronda 1 — inventario de cards, solo lectura.
  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await test.expect.poll(() => cards.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  const n = Math.min(await cards.count(), 12);
  let multiHref: string | null = null;
  for (let i = 0; i < n; i++) {
    const text = (await cards.nth(i).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    console.log(`[probe] card ${i}: "${text}"`);
    if (multiHref === null && /\d+\s+COLORES/i.test(text)) {
      multiHref = await cards.nth(i).locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
      console.log(`[probe] -> primera card multicolor, href=${multiHref}`);
    }
  }
  if (!multiHref) {
    console.log('[probe] VEREDICTO: Hombre Combo Wins NO tiene cards multicolor en el primer viewport — activar fallback Mujer Camisetas');
    return;
  }

  // Ronda 2 — el PDP de esa card: ¿cómo se renderiza el selector de color?
  const c0pId = multiHref.match(/-c0p(\d+)\.html/)?.[1];
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await plp.ensureOnPlp().catch(() => undefined);
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await test.expect(page).toHaveURL(pdpUrl, { timeout: 20_000 });
  await page.waitForTimeout(8_000); // dejar hidratar la zona de info (perfil §10)

  const info = page.locator('div.product-detail-info').first();
  console.log('[probe] product-detail-info ariaSnapshot:\n' + (await info.ariaSnapshot({ timeout: 5_000 }).catch(() => 'UNREADABLE')));
  // Candidatos a swatch, inventariados sin asumir la forma:
  const colorLinks = page.locator('a[href*="colorId"]');
  console.log(`[probe] links con colorId: ${await colorLinks.count()}`);
  for (let i = 0; i < Math.min(await colorLinks.count(), 15); i++) {
    const el = colorLinks.nth(i);
    console.log(`[probe] colorId link ${i}: href="${await el.getAttribute('href', { timeout: 5_000 }).catch(() => '?')}" aria-label="${await el.getAttribute('aria-label', { timeout: 5_000 }).catch(() => '?')}" visible=${await el.isVisible().catch(() => '?')}`);
  }
  console.log('[probe] radios: ' + (await page.getByRole('radio').count()) + ' | radiogroups: ' + (await page.getByRole('radiogroup').count()));
});
```

- [ ] **Step 2: Lanzarlo en vivo y leer el output completo**

Run: `pnpm exec playwright test tests/_probe/color-count-probe.spec.ts`
Expected: PASS con las líneas `[probe]` en stdout. Si la ronda 1 devuelve el veredicto de fallback, ejecutar la contingencia del spec (page object Mujer Camisetas — ver Step 3b).

- [ ] **Step 3: Registrar §45 en el findings doc**

Apendizar al final de `2026-06-17-des-live-validation-findings.md` (antes no hay §45 — verificar con grep). Contenido mínimo: ruta elegida, forma literal del texto "N COLORES" de la card, el locator del selector de color del PDP con su cuenta observada (y si el color activo cuenta), y cualquier sorpresa. Formato: como §41/§42 — hechos medidos, no prosa.

- [ ] **Step 3b (SOLO si la ronda 1 falló): page object Mujer Camisetas**

Crear `tests/mujer/pages/MujerCamisetasPlpPage.ts` clonando la forma de `HombreComboWinsPage` (open() con walk de gender gate → `/es/mujer/ropa/camisetas-n{id}.html` — el path exacto sale del mapa: `grep -o '"/es/mujer/ropa/camisetas[^"]*"' coverage/functional-map.json | sort -u`), con `isLoaded()` por título + heading "CAMISETAS" — **nunca `filterButton`** (hazard §36) — y el mismo `ensureOnPlp()`. Re-lanzar el probe apuntando a ella.

- [ ] **Step 4: Borrar el probe y commitear los findings**

```bash
rm tests/_probe/color-count-probe.spec.ts
git add -A docs/superpowers/notes/ tests/
git commit -m "docs(oracle): probe findings §45 — PLP color-count link + PDP color selector"
```

---

### Task 2: El spec del oráculo + validación en vivo

**Files:**
- Create: `tests/hombre/plp-colores-card-vs-pdp.spec.ts` (o `tests/mujer/` si Task 1 activó el fallback)
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (cierre de §45), `CLAUDE.md` (bloque de estado), `docs/roadmap/2026-07-02-backlog.md` (item de oráculos)

**Interfaces:**
- Consumes: §45 — `PDP_COLOR_SELECTOR` (el locator real del probe) y la semántica de conteo.
- Produces: el oráculo #7 en el suite (31 → 32 tests).

- [ ] **Step 1: Escribir el spec**

Plantilla = `plp-pdp-price-consistency.spec.ts` con el bloque del precio sustituido por el de colores. El locator PDP de abajo (`a[href*="colorId"]` visible) es el candidato más probable según §41 (el click card→PDP retiene `?colorId`); **sustituir por el locator que §45 registró** si difiere, y ajustar `ACTIVE_COLOR_COUNTS` según lo que el probe midió (¿el color activo tiene link propio o no?).

```typescript
// Correctness oracle #7 (findings §45): the color count a PLP card promises
// ("N COLORES") must match the colors its PDP actually offers. A mismatch with the
// rest of the suite green is a real DES catalog inconsistency — or the known ceiling
// (PDP may hide out-of-stock colors while the card counts them all, unprobed §45);
// the failure message carries both sides so each names itself.
import { test, expect } from '../../src/fixtures/test';
import { HombreComboWinsPage } from './pages/HombreComboWinsPage';

const HYDRATION_TIMEOUT_MS = 20_000;
// §45: whether the PDP's active color renders as one more selectable swatch or only
// the alternates do. Set from the probe's measurement; documents the count semantics.
const ACTIVE_COLOR_COUNTS = true;

test('hombre > combo wins: the first multicolor card\'s "N COLORES" matches its PDP color count', async ({ page }) => {
  const target = new HombreComboWinsPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.ensureOnPlp(); // §43: re-anchor after a possible §26 bounce

  // First card declaring "N COLORES" (N>=2). Single-color cards carry no declaration
  // and are out of scope by design (spec 2026-08-21).
  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  let declared: number | null = null;
  let cardText = '';
  let href: string | null = null;
  const n = Math.min(await cards.count(), 12);
  for (let i = 0; i < n && declared === null; i++) {
    cardText = (await cards.nth(i).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
    const m = cardText.match(/(\d+)\s+COLORES/i);
    if (m) {
      declared = Number(m[1]);
      href = await cards.nth(i).locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
    }
  }
  if (declared === null || !href) throw new Error(`no card declaring "N COLORES" in the first ${n} cards`);
  const c0pId = href.match(/-c0p(\d+)\.html/)?.[1];
  if (!c0pId) throw new Error(`card href has no -c0p id: ${href}`);

  // Open the PDP anchored to THAT card's id (§28/§31; §41's exact pattern).
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await target.ensureOnPlp().catch(() => undefined); // §43 re-anchor; guard keeps this off a reached PDP
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: PDP color count == the card's declared N. Polled (§34); the returned
  // string carries both sides on failure. Locator per §45's probe.
  await expect
    .poll(async () => {
      const swatches = page.locator('div.product-detail-info a[href*="colorId"]:visible');
      const rendered = (await swatches.count()) + (ACTIVE_COLOR_COUNTS ? 0 : 1);
      if (rendered <= (ACTIVE_COLOR_COUNTS ? 0 : 1)) return `PDP color selector not hydrated yet (0 swatches visible)`;
      return rendered === declared
        ? 'match'
        : `MISMATCH: card declares ${declared} (card text: "${cardText.slice(0, 100)}") but PDP renders ${rendered} colors`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
```

- [ ] **Step 2: Gates offline**

Run: `pnpm typecheck && pnpm lint`
Expected: ambos limpios.

- [ ] **Step 3: Validación en vivo, 2 pases standalone**

Run: `pnpm exec playwright test tests/hombre/plp-colores-card-vs-pdp.spec.ts` (×2)
Expected: PASS primer intento ambas veces. Si falla, leer `test-results/**/error-context.md` ANTES de re-lanzar (§28) — no re-run a ciegas.

- [ ] **Step 4: Actualizar docs**

- §45: añadir el resultado de la validación (2/2, tiempos) y el veredicto DES ("consistencia de colores card↔PDP verificada correcta el 2026-08-21" — o el bug si lo hubiera).
- `CLAUDE.md`: bloque de estado — "32 tests, 7 oráculos"; pending item 1 actualizado (este candidato consumido).
- Backlog: item de oráculos, mismo cambio.

- [ ] **Step 5: Commit final**

```bash
git add tests/ docs/ CLAUDE.md
git commit -m "feat(oracle): card 'N COLORES' vs PDP color-count consistency (§45)"
```

---

## Self-review

- Cobertura del spec: reformulación documentada (Task 1 Step 3 registra la muerte del contador), ruta + contingencia (Task 1 Step 3b), flujo de 4 pasos (Task 2 Step 1), probe previo (Task 1), techo conocido (comentario de cabecera del spec), validación (Task 2 Steps 2–3). Sin huecos.
- El único "placeholder" es deliberado y está señalizado: el locator PDP del oráculo es el candidato más probable y Task 2 Step 1 ordena sustituirlo por el hecho medido de §45 — un plan no puede contener un resultado de probe que aún no existe.
- Tipos y nombres consistentes entre tareas (`ensureOnPlp`, `c0pId`, patrón `-c0p{id}.html`).
