# B14 — Shared-element deprioritization for the Builder's loaded-signal

**Date:** 2026-07-04
**Status:** Approved (Jorge, 2026-07-04)
**Closes:** backlog B14 (remaining scope after M7's partial closure)

## Problem

`builder/select.ts`'s `loadedSignalFor` returns the first non-destructive element with a usable
hint in map-element order, per tier (testId → role → label). On leaf pages whose elements carry
**no** testId-like attribute, the role/label fallback typically picks a generic shared header
element — live-confirmed in M6b (findings §11): the header's "Buscar en tienda" button is usually
the first role-hinted element captured on any DES page, so it wins over page-specific candidates
(e.g. "Añadir a la lista de deseos") purely by extraction order. The signal is *true* (the page
did load) but *weak* — it asserts nothing specific about the leaf page.

M7 closed the common case (trustworthy testId hints win the top tier). This design closes the
remaining scope: the map records which elements belong to shared chrome (`Header`/`Footer`/
`MiniCart`), and `loadedSignalFor` prefers page-specific candidates within every tier.

## Decisions taken during brainstorming

1. **Shared scope:** only `Header`, `Footer`, `MiniCart` — exactly the backlog's fix direction.
   `SearchBar`/`FiltersPanel` are not treated as shared (the observed offender lives inside the
   banner and is covered by Header).
2. **Fallback:** deprioritize ≠ exclude. If *every* candidate on a leaf page is shared, the
   shared element is still used (better than the generic `main`-landmark fallback). `null` is
   returned only when there is no usable candidate at all — current behavior.
3. **Validation level:** full live validation, same sequence as M7/M7b — full re-crawl,
   regenerate the canonical map, `plan --update`, `build-tests`, `test:generated` live, plus the
   manual reference suite as a no-regression check.
4. **Approach chosen:** component provenance on elements (Approach B) — an optional
   `component?: ComponentKind` field, not a bare `shared` boolean (keeps provenance for
   M8/Selector Healing, same philosophy as M7's `{attr, value}` testId hints), and not a
   builder-side cross-page frequency heuristic (threshold-arbitrary, conflates shared chrome
   with per-page-type common elements, and hides knowledge outside the map).

## Design

### 1. Types and schema (1.3 → 1.4)

- `ExtractedElement` (`explorer/types.ts`) and `MapElement` (`explorer/map/schema.ts`) gain
  `component?: ComponentKind`. Absent = page-specific. Only `Header` | `Footer` | `MiniCart`
  are emitted this milestone; the type admits the full enum so M8 doesn't re-touch it.
- `SCHEMA_VERSION` bumps to `'1.4'`. No migration code (map is regenerated live as part of this
  milestone, same as M7). Update the two tests asserting `'1.3'`
  (`explorer/map/builder.unit.test.ts`, `planner/coverage/annotate.unit.test.ts`).
- Legacy tolerance: a schema-1.3 map simply has no `component` on any element, so nothing is
  deprioritized — the optional field's natural semantics; no explicit guard needed.

### 2. Extraction — aria path (`explorer/extract/analyzeAria.ts`, the live path)

Same pattern as the existing `inListitem` parameter: `visit` threads an ancestor-context value.

- Inside a `banner` subtree → elements get `component: 'Header'`.
- Inside a `contentinfo` subtree → `component: 'Footer'`.
- A `link`/`button` whose name matches the existing cart regex (`/cesta|cart/i`, analyzeAria.ts
  line 53) → `component: 'MiniCart'`, taking precedence over Header when both apply (the
  "Ir a la cesta" link lives inside the banner; MiniCart is the more specific label).
- Grounding: real DES fixtures show both landmarks — `banner` (`home.aria.txt:4`),
  `contentinfo "Pie de página"` (`category-gate.aria.txt:417`).

### 3. Extraction — DOM path (`explorer/extract/analyze.ts`, offline-only)

Equivalent semantics via `closest('header, [role=banner]')` /
`closest('footer, [role=contentinfo]')`, plus the same cart-name regex on the element label for
MiniCart, so offline unit tests exercise the same behavior.

### 4. Map build passthrough (`explorer/map/builder.ts`)

`buildMap` copies `component` from `ExtractedElement` to `MapElement` (the element-push at
builder.ts:51-57). `enrichTestIds` mutates hints only and is unaffected.

### 5. Builder — `loadedSignalFor` (`builder/select.ts`)

Current: per tier, first candidate producing a `Strategy` wins. New: two passes per tier —
first only candidates whose `component` is not in `{Header, Footer, MiniCart}`, then (fallback,
decision 2) the shared ones. Map order remains the tiebreak within each pass — determinism
intact. Deprioritization applies uniformly to all three tiers (a header testId is just as weak
a leaf-page signal as a header role).

### 6. Tests

- `analyzeAria.unit.test.ts`: elements under `banner`/`contentinfo` carry `component`; the cart
  link carries `MiniCart` (precedence over Header); `main` elements carry nothing; one case fed
  from the real `home.aria.txt` fixture asserting "Buscar en tienda" comes out `Header`.
- `select.unit.test.ts`: page with a header-role element first and an own element later → the
  own element wins; page where everything is shared → the shared element is returned (not
  `null`); legacy 1.3-shaped map (no `component` anywhere) → current behavior, no crash.
- `analyze.unit.test.ts` / `builder.unit.test.ts`: DOM-path tagging and passthrough.

### 7. Live validation (sequence identical to M7b)

Full re-crawl (80 pages/session, both sessions, `EXPLORER_TIME_BUDGET_MS=1200000`) → verify in
the fresh map that header/footer/cart elements carry `component` → `pnpm plan --update` →
`pnpm build-tests --top 3` → inspect that no generated spec uses "Buscar en tienda" as its
loaded-signal when the leaf has own candidates → `pnpm test:generated` live →
`pnpm test` (no-regression, 4/4) → commit map + code, update findings (§14) and backlog
(B14 closed).

**Success criterion:** in the regenerated map, leaf pages of the top-3 journeys that lack a
testId-bearing element pick a non-shared loaded-signal; generated specs pass live.

**Known risk:** the post-re-crawl top-3 journeys may all be PDPs with the strong
`addToCartSizeBtn` testId, so the "leaf without testId" case may not appear in the top-3. In
that case, validate the new behavior with a hand-picked journey (raise `--top`) or, failing
that, rely on unit tests + direct map inspection — and document whichever happened in findings.

## Out of scope

- Interaction-aware extraction (nav menus/overlays) — that's M8/B9.
- Any change to `SearchBar`/`FiltersPanel` treatment, cross-page frequency heuristics, or the
  `main`-landmark template fallback.
- Migration code for schema 1.3 maps.
