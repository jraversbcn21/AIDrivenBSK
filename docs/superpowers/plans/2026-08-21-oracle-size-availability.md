# Oráculo #8 — disponibilidad de tallas overlay↔PDP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un octavo oráculo de correctness: las tuplas (talla, deshabilitada) del overlay quick-add de una card deben coincidir con las del PDP de esa misma card.

**Architecture:** Esqueleto de `tests/mujer/plp-tallas-overlay-vs-pdp.spec.ts` (§42) extendido a un escaneo de hasta 6 cards con skip honesto si ninguna tiene tallas agotadas. Un probe previo (Task 1) resuelve los tres desconocidos: ruta con stock agotado hoy, marcador de deshabilitada en el aria snapshot del overlay, y marcador en los botones del size group del PDP.

**Tech Stack:** Playwright + TypeScript; page objects existentes (los 6 PLP tienen `ensureOnPlp()` desde §44); fixtures de `src/fixtures/test.ts`.

## Global Constraints

- Spec aprobado: `docs/superpowers/specs/2026-08-21-oracle-size-availability-design.md`.
- Toda lectura que espera (innerText/getAttribute/ariaSnapshot) y todo click llevan `{ timeout: 5_000 }` (§43/§26).
- Nunca `.first()` para anclar — solo exemplar legítimo (§17/§31); los triggers/links card-scoped heredados de §42 son exemplar legítimo.
- Imports de test/expect desde `src/fixtures/test.ts`, nunca `@playwright/test` directo.
- Sin `any`; `pnpm typecheck` y `pnpm lint` limpios antes de cada commit.
- VPN activa y DES probado HTTP 200 antes de cualquier paso en vivo.
- Probes temporales en `tests/_probe/`, BORRADOS tras aterrizar su conocimiento (ciclo §18).
- El findings doc va hoy por §45; la sección nueva es **§46**, apendizada AL FINAL de `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` — nunca renumerar nada.
- Hazard §45 vigente: el `innerText` de las cards PLP llega TRIPLICADO — solo regex matching sobre texto de cards, nunca lecturas posicionales.

---

### Task 1: Probe en vivo — ruta con tallas agotadas + marcadores de deshabilitada en overlay y PDP

**Files:**
- Create (temporal): `tests/_probe/size-availability-probe.spec.ts`
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (nueva §46)

**Interfaces:**
- Produces: hechos en §46 que Task 2 consume — (a) ruta elegida (la primera con ≥1 talla deshabilitada en el primer viewport; si NINGUNA ruta la tiene hoy, la ruta por defecto es Hombre Lo Más Vendido y se registra "0 agotadas hoy"), (b) forma EXACTA del marcador de deshabilitada en el aria snapshot del overlay (p.ej. `[disabled]` tras `button "Talla X"`, o un nombre accesible distinto), (c) forma exacta en el PDP (atributo `disabled`, `aria-disabled`, texto extra tipo "Avísame"), y (d) el regex/lectura concretos con que Task 2 debe extraer las tuplas en cada lado.

- [ ] **Step 1: Escribir el probe**

Recorre las 6 PLPs mantenidas en orden de probabilidad de stockout; por ruta abre los overlays de las primeras 6 cards y vuelca el snapshot COMPLETO de cada dialog (ahí se ve el marcador de deshabilitada, sea cual sea). En la primera card con talla agotada, salta a su PDP y vuelca el snapshot del size group más los atributos por botón.

```typescript
// tests/_probe/size-availability-probe.spec.ts — TEMPORAL, borrar tras registrar §46 (ciclo §18).
// Instrumentos explícitos, nunca el código bajo diseño (§31).
import { test, expect } from '../../src/fixtures/test';
import type { Page } from '@playwright/test';
import { HombreLoMasVendidoPage } from '../hombre/pages/HombreLoMasVendidoPage';
import { HombreCamisasPage } from '../hombre/pages/HombreCamisasPage';
import { HombreComboWinsPage } from '../hombre/pages/HombreComboWinsPage';
import { PantalonesCapriPlpPage } from '../mujer/pages/PantalonesCapriPlpPage';
import { PantalonesComboWinsPlpPage } from '../mujer/pages/PantalonesComboWinsPlpPage';
import { VestidosTallasOverlayPage } from '../mujer/pages/VestidosTallasOverlayPage';

interface PlpDriver { open(): Promise<void>; isLoaded(): Promise<boolean>; ensureOnPlp(): Promise<void>; }

test('PROBE: rutas con tallas agotadas + marcadores overlay/PDP', async ({ page }) => {
  test.setTimeout(540_000);
  const routes: Array<[string, PlpDriver]> = [
    ['hombre-lo-mas-vendido', new HombreLoMasVendidoPage(page)],
    ['hombre-camisas', new HombreCamisasPage(page)],
    ['hombre-combo-wins', new HombreComboWinsPage(page)],
    ['mujer-pantalones-capri', new PantalonesCapriPlpPage(page)],
    ['mujer-pantalones-combo-wins', new PantalonesComboWinsPlpPage(page)],
    ['mujer-vestidos', new VestidosTallasOverlayPage(page)],
  ];
  const overlayDialog = page.getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: /^talla /i }) }).first();

  for (const [name, plp] of routes) {
    console.log(`[probe] ===== ruta: ${name} =====`);
    await plp.open();
    const loaded = await expect.poll(() => plp.isLoaded(), { timeout: 20_000 }).toBe(true).then(() => true).catch(() => false);
    if (!loaded) { console.log(`[probe] ${name}: isLoaded() nunca — salto la ruta`); continue; }
    await plp.ensureOnPlp();

    const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
    await expect.poll(() => cards.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    const n = Math.min(await cards.count(), 6);
    let hitHref: string | null = null;

    for (let i = 0; i < n && hitHref === null; i++) {
      const card = cards.nth(i);
      const href = await card.locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
      // Abrir el overlay de ESTA card (act→verify→retry, forma §42):
      const opened = await expect.poll(async () => {
        if (await overlayDialog.isVisible().catch(() => false)) return true;
        await plp.ensureOnPlp().catch(() => undefined);
        await card.locator('[data-qa-anchor="addToCartSizeBtn"]').first().click({ timeout: 5_000 }).catch(() => undefined);
        return overlayDialog.isVisible().catch(() => false);
      }, { timeout: 25_000 }).toBe(true).then(() => true).catch(() => false);
      if (!opened) { console.log(`[probe] ${name} card ${i}: overlay nunca abrió — sigo`); continue; }

      const snap = await overlayDialog.ariaSnapshot({ timeout: 5_000 }).catch(() => 'UNREADABLE');
      console.log(`[probe] ${name} card ${i} (href=${href}) overlay snapshot:\n${snap}`);
      // Heurística amplia de "deshabilitada" — el volcado completo de arriba es la verdad:
      if (/\[disabled\]|disabled|agotad|avísame|avisame|sin stock/i.test(snap)) {
        console.log(`[probe] ${name} card ${i}: POSIBLE talla deshabilitada — candidata`);
        hitHref = href;
      }
      await page.keyboard.press('Escape');
      await expect.poll(() => overlayDialog.isVisible().catch(() => false), { timeout: 10_000 }).toBe(false);
    }

    if (hitHref) {
      // PDP de la candidata: ¿cómo marca ÉL la talla deshabilitada?
      const c0pId = hitHref.match(/-c0p(\d+)\.html/)?.[1];
      const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
      const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
      for (let a = 0; a < 3 && !pdpUrl.test(page.url()); a++) {
        await plp.ensureOnPlp().catch(() => undefined);
        await link.click({ timeout: 5_000 }).catch(() => undefined);
        await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
      }
      await expect(page).toHaveURL(pdpUrl, { timeout: 20_000 });
      const group = page.getByRole('group', { name: /selecciona talla/i }).first();
      await expect.poll(() => group.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true);
      console.log('[probe] PDP size-group ariaSnapshot:\n' + (await group.ariaSnapshot({ timeout: 5_000 }).catch(() => 'UNREADABLE')));
      const btns = group.getByRole('button');
      for (let b = 0; b < (await btns.count()); b++) {
        const el = btns.nth(b);
        console.log(`[probe] PDP btn ${b}: text="${(await el.textContent({ timeout: 5_000 }).catch(() => '?'))?.trim()}" disabled=${await el.isDisabled().catch(() => '?')} aria-disabled="${await el.getAttribute('aria-disabled', { timeout: 5_000 }).catch(() => '?')}" aria-pressed="${await el.getAttribute('aria-pressed', { timeout: 5_000 }).catch(() => '?')}"`);
      }
      console.log(`[probe] VEREDICTO: ruta=${name}, candidata href=${hitHref}`);
      return; // primera ruta con evidencia basta
    }
    console.log(`[probe] ${name}: 0 tallas deshabilitadas en las primeras ${n} cards`);
  }
  console.log('[probe] VEREDICTO: NINGUNA ruta con tallas agotadas hoy — ruta por defecto Hombre Lo Más Vendido, camino skip');
});
```

- [ ] **Step 2: Lanzarlo en vivo y leer el output completo**

Run: `pnpm exec playwright test tests/_probe/size-availability-probe.spec.ts`
Expected: PASS con las líneas `[probe]`. El run puede ser largo (hasta 9 min si recorre las 6 rutas); si el harness mata el run, relanzar con PowerShell `Start-Process` redirigiendo stdout a archivo y leer el archivo. Si falla, leer `test-results/**/error-context.md` ANTES de re-lanzar (§28).

- [ ] **Step 3: Registrar §46 en el findings doc**

Apendizar al final. Contenido mínimo: los consumibles (a)-(d) del bloque Interfaces, los volcados de snapshot relevantes (recortados a lo probatorio), y — si ninguna ruta tenía stock agotado — ese hecho con fecha, que es evidencia del carácter oportunista del oráculo, no un fracaso. Formato §41/§42: hechos medidos.

- [ ] **Step 4: Borrar el probe y commitear**

```bash
rm tests/_probe/size-availability-probe.spec.ts
git add -A docs/superpowers/notes/ tests/
git commit -m "docs(oracle): probe findings §46 — disabled-size markers overlay/PDP + route"
```

---

### Task 2: El spec del oráculo + validación en vivo

**Files:**
- Create: `tests/hombre/plp-tallas-disponibilidad.spec.ts` (o `tests/mujer/` si §46 eligió ruta mujer — nombre del spec estable, solo cambia el directorio y el page object)
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (cierre de §46 + bloque Status: 32→33 tests, 7→8 oráculos, cita §46), `CLAUDE.md` (bloque Current state: ídem; pending item 1: candidato size-availability consumido), `docs/roadmap/2026-07-02-backlog.md` (item de oráculos, ídem)

**Interfaces:**
- Consumes: §46 — ruta/page object, y los dos extractores de tuplas (regex del snapshot del overlay; lectura por botón del PDP).
- Produces: el oráculo #8 en el suite (32 → 33 tests).

- [ ] **Step 1: Escribir el spec**

Código base abajo. Los DOS puntos marcados `// §46:` usan el candidato más probable (marcador `[disabled]` en el snapshot; `isDisabled()`/`aria-disabled` en el PDP) — **sustituirlos por los hechos medidos de §46** si difieren. El resto es la plantilla §42 extendida al escaneo multi-card.

```typescript
// Correctness oracle #8 (findings §46): the (size, disabled) tuples the PLP quick-add
// overlay shows for a product must match its PDP's — availability consistency, the scope
// §42 deliberately left out. OPPORTUNISTIC by design: it needs a partially out-of-stock
// product in the first 6 cards; when today's stock is healthy it SKIPS (visible in the
// report — never a false green, §29). Known ceilings: stock can genuinely change in the
// seconds between the two reads (the failure message carries both sides; the retry
// re-measures), and this route now carries a second oracle (accepted §44 trade-off,
// design doc 2026-08-21).
import { test, expect } from '../../src/fixtures/test';
import { HombreLoMasVendidoPage } from './pages/HombreLoMasVendidoPage'; // §46: ruta

const HYDRATION_TIMEOUT_MS = 20_000;
const MAX_CARDS_SCANNED = 6;

interface SizeTuple { size: string; disabled: boolean; }
const fmt = (t: SizeTuple[]) => t.map((x) => `${x.size}${x.disabled ? '(agotada)' : ''}`).join('|');

test('hombre > lo más vendido: overlay and PDP agree on which sizes are out of stock', async ({ page }) => {
  test.setTimeout(300_000);
  const target = new HombreLoMasVendidoPage(page);
  await target.open();
  await expect.poll(() => target.isLoaded(), { timeout: HYDRATION_TIMEOUT_MS }).toBe(true);
  await target.ensureOnPlp(); // §43: re-anchor after a possible §26 bounce

  const cards = page.locator('li', { has: page.locator('a[href*="-c0p"]') });
  await expect.poll(() => cards.count(), { timeout: HYDRATION_TIMEOUT_MS }).toBeGreaterThan(0);
  const overlayDialog = page.getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: /^talla /i }) }).first();

  // Scan up to 6 cards for the discriminating state: >=1 disabled size in the overlay.
  let overlayTuples: SizeTuple[] | null = null;
  let c0pId: string | null = null;
  const n = Math.min(await cards.count(), MAX_CARDS_SCANNED);
  for (let i = 0; i < n && overlayTuples === null; i++) {
    const card = cards.nth(i);
    const href = await card.locator('a[href*="-c0p"]').first().getAttribute('href', { timeout: 5_000 }).catch(() => null);
    const id = href?.match(/-c0p(\d+)\.html/)?.[1];
    if (!id) continue; // banner tile (§7) — skip it
    // Open THIS card's overlay (act→verify→retry, §42's exact shape).
    const opened = await expect.poll(async () => {
      if (await overlayDialog.isVisible().catch(() => false)) return true;
      await target.ensureOnPlp().catch(() => undefined); // §43: survive a §26 bounce mid-loop
      await card.locator('[data-qa-anchor="addToCartSizeBtn"]').first().click({ timeout: 5_000 }).catch(() => undefined);
      return overlayDialog.isVisible().catch(() => false);
    }, { timeout: 25_000 }).toBe(true).then(() => true).catch(() => false);
    if (!opened) continue; // degraded card — the scan, not the oracle, absorbs it

    // §46: disabled marker in the aria snapshot — substitute the measured form.
    const snap = await overlayDialog.ariaSnapshot({ timeout: 5_000 }).catch(() => '');
    const tuples = [...snap.matchAll(/button "Talla ([^"]+)"( \[disabled\])?/gi)]
      .map((m) => ({ size: m[1].trim(), disabled: m[2] !== undefined }));
    await page.keyboard.press('Escape');
    await expect.poll(() => overlayDialog.isVisible().catch(() => false), { timeout: 10_000 }).toBe(false);
    if (tuples.some((t) => t.disabled)) { overlayTuples = tuples; c0pId = id; }
  }

  test.skip(overlayTuples === null,
    `no partially out-of-stock product in the first ${n} cards today — nothing to compare (opportunistic oracle, design 2026-08-21)`);
  if (overlayTuples === null || c0pId === null) return; // narrowing for TS; skip already fired

  // Open the SAME product's PDP, anchored to its -c0p id (§41/§45 pattern).
  const link = page.locator(`a[href*="-c0p${c0pId}.html"]`).first();
  const pdpUrl = new RegExp(`-c0p${c0pId}\\.html`);
  for (let attempt = 0; attempt < 3 && !pdpUrl.test(page.url()); attempt++) {
    await target.ensureOnPlp().catch(() => undefined);
    await link.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForURL(pdpUrl, { timeout: 8_000 }).catch(() => undefined);
  }
  await expect(page).toHaveURL(pdpUrl, { timeout: HYDRATION_TIMEOUT_MS });

  // ORACLE: the PDP's (size, disabled) tuples equal the overlay's. Polled (§34); string
  // form so the failure message carries both complete sets.
  const expected = fmt(overlayTuples);
  await expect
    .poll(async () => {
      const group = page.getByRole('group', { name: /selecciona talla/i }).first();
      if (!(await group.isVisible().catch(() => false))) return 'PDP size group not visible yet';
      const btns = group.getByRole('button');
      const pdpTuples: SizeTuple[] = [];
      for (let b = 0; b < (await btns.count()); b++) {
        const el = btns.nth(b);
        const size = (await el.textContent({ timeout: 5_000 }).catch(() => ''))?.trim() ?? '';
        if (size === '') continue;
        // §46: PDP disabled marker — substitute the measured form.
        const disabled = (await el.isDisabled().catch(() => false)) ||
          (await el.getAttribute('aria-disabled', { timeout: 5_000 }).catch(() => null)) === 'true';
        pdpTuples.push({ size, disabled });
      }
      return fmt(pdpTuples) === expected
        ? 'match'
        : `MISMATCH: overlay=[${expected}] pdp=[${fmt(pdpTuples)}]`;
    }, { timeout: HYDRATION_TIMEOUT_MS })
    .toBe('match');
});
```

- [ ] **Step 2: Gates offline**

Run: `pnpm typecheck && pnpm lint`
Expected: limpios.

- [ ] **Step 3: Validación en vivo, 2 pases standalone**

Run: `pnpm exec playwright test tests/hombre/plp-tallas-disponibilidad.spec.ts` (×2; ajustar la ruta si §46 la cambió)
Expected: PASS o SKIP primer intento ambas veces — ambos resultados son válidos y se registran con su tiempo. Si el resultado es SKIP los dos pases, el camino del assert queda sin validar HOY — declararlo así en §46 (postura §26), no forzarlo. Un FAIL se lee de `error-context.md` ANTES de re-lanzar (§28).

- [ ] **Step 4: Actualizar docs**

- §46: cierre con el resultado de la validación (pases/skips, tiempos) y el veredicto DES si el assert llegó a medir.
- Findings Status block: 32→33 tests, 7→8 oráculos, cita `§40–§42, §45` → `§40–§42, §45, §46`.
- `CLAUDE.md` Current state: ídem (33 tests, 8 oráculos, frase corta del nuevo oráculo citando §46; pending item 1: candidato size-availability consumido).
- Backlog: item de oráculos, ídem. Cambios quirúrgicos.

- [ ] **Step 5: Commit final**

```bash
git add tests/ docs/ CLAUDE.md
git commit -m "feat(oracle): overlay vs PDP size-availability consistency (§46)"
```

---

## Self-review

- Cobertura del spec de diseño: escaneo K=6 + skip honesto (Task 2 Step 1), ruta por probe con orden de búsqueda (Task 1 Step 1), tuplas completas no solo cuenta (SizeTuple/fmt), techos en el comentario de cabecera, validación con PASS-o-SKIP explícito (Task 2 Step 3). Sin huecos.
- Placeholders: los dos puntos `// §46:` son sustituciones ordenadas de hechos de probe que aún no existen — señalizados y con candidato funcional por defecto, mismo mecanismo que el plan del oráculo #7.
- Consistencia de tipos/nombres entre tareas: `ensureOnPlp`, `-c0p{id}`, `overlayDialog` (misma forma §42), `SizeTuple`.
