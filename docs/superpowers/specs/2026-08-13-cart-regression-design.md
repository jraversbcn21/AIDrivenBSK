# Cart regression coverage — design

**Date:** 2026-08-13. **Status:** approved by Jorge (option A: single lifecycle journey + cleanup fixture).
**Context:** regression push on the full desktop web. The cart is the most expensive functional gap: the only cart assertion in the suite today is the header tab count going above 0 (`add-to-cart.spec.ts`). The inside of `/es/shop-cart.html` has never been probed — the committed map holds **0 elements** for that page in both sessions (the slow skeleton, §5/§23, beat the crawler too), and the findings doc has no remove/quantity selector knowledge.

## Scope (Jorge's selection, 2026-08-13)

All four cart operations, plus the backlog fixture:

1. **Remove a line item** (transition N → N−1).
2. **Change quantity** — ⚠ conditional on evidence: nobody has confirmed the DES cart *has* a quantity control. If the probe finds none, this part of the scope dies on evidence and is recorded as such in findings §32 — it is not simulated by re-adding the product.
3. **Empty-cart state** — the real empty state (message/CTA), not a broken skeleton.
4. **Totals** — the displayed total reacts to quantity changes.
5. **`cleanCart` fixture** — closes the §7/§29 backlog item (shared-account cart accumulation is a proven false-green source).

Out of scope: promos/discount math, multi-product carts beyond what the journey needs, checkout (covered by its own specs), wishlist-from-cart.

## Approach (decided: A, over B/C)

One journey spec covering the whole lifecycle, over four independent specs (B) or a two-spec split (C). Rationale:

- Priming (adding a product) costs 30-60s on DES and is the suite's #1 flake surface (the §28/§30 confirmation-drawer noise). One prime = one dice roll; four specs = four.
- `workers: 1` makes runtime strictly linear; B costs +5-8 min of suite.
- Each assertion in the chain 0→1→2→1→0 is a **transition from a guaranteed state** (§29 doctrine), anchored by the fixture's initial 0.
- Precedent: `search-plp-pdp.spec.ts` is already a multi-feature journey.
- Accepted cost: sequential coupling — if quantity fails, remove doesn't run that run. Acceptable because the fixture restores a consistent cart at the next run's start regardless.

## Phase 0 — live probe (§18 lifecycle: temporary, deleted after documenting)

`tests/_probe/cart-inner-probe.spec.ts`:

- Adds one product via the proven recipe (category PLP → PDP → `selectFirstSize` → `addToCart`), navigates to `/es/shop-cart.html`, waits out the skeleton, captures the aria snapshot of the cart's inside.
- Establishes: line-item container structure, remove-button accessible name, **quantity control existence and shape**, empty-state signal (message/CTA text), total element and its text format, and what the tab's "(N)" counts (units vs lines).
- Ends by removing what it added — the probe's own cleanup doubles as the first live validation of the remove selector.
- Also answers: what does the cart's mid-load skeleton expose? (Needed so `isEmpty()` can be proven to answer `false` on a half-loaded page.)
- Knowledge lands in findings **§32**; probe file deleted.

## Components

### `src/pages/CartPage.ts` — new Page Object for `/es/shop-cart.html`

No cart Page Object exists today. API (final shapes confirmed by the probe):

- `isLoaded()` — skeleton-aware: waits for real cart content (line items OR the empty-state signal), budget sized to the measured ~6-10s skeleton (§5) with headroom. "Neither appeared" fails with an explicit diagnostic (the §23 content-service-down class — analyzer classifies it `timeout`, no new vocabulary needed).
- `lineItemCount()` — counts line-item containers (structure from the probe), never the raw repeated buttons.
- `removeItem(index)` / `removeFirstItem()` — act→verify→retry; verify is the **line-count transition** N → N−1, not a state.
- Quantity ops (names pending probe, e.g. `increaseQuantity(index)` / `decreaseQuantity(index)`) — verify on the line's displayed quantity transition.
- `totalAmount(): Promise<number>` — parses the displayed total. Parsing is a pure function in `src/support/price.ts` with unit tests (locale format `1.234,56 €`).
- `isEmpty()` — **identifies the positive empty-state content** (§28: "0 line items" is indistinguishable from "skeleton not rendered yet"; counting zero would be a structural false green).

Doctrines binding every locator in this file:

- **Anchoring (§31):** the remove button repeats once per line — every per-line locator is scoped to its line-item container. No page-wide `.first()` over a repeated name.
- **Bounded clicks (§26):** every `.click()` carries an explicit `timeout`.
- Selector priority (`getByTestId` → `getByRole` → …) as always; if the probe finds only BEM classes for the line container, that deviation is documented in-code (§31 precedent: `mainWishlistPanel()`).

### `cleanCart` fixture — `src/fixtures/test.ts` + `src/support/cartCleanup.ts`

- **Explicit, not autouse**: only cart specs declare it; zero runtime cost to the rest of the suite.
- `ensureEmptyCart(page)`: navigate to cart → if `isEmpty()`, done → else remove lines one at a time until the empty state is confirmed. Hard bounds: max ~15 iterations AND a global deadline — on a dead DES it fails with a clear message, never hangs to the test timeout (§26).
- Closes the §7/§29 backlog item ("cart-cleanup fixture").

### `tests/cart/cart-lifecycle.spec.ts` — the journey

```
cleanCart fixture   → cart provably empty (transition anchor)
add product         → lineItemCount 0→1, tab count consistent, total > 0
quantity 1→2        → line quantity 2, total STRICTLY increased
quantity 2→1        → line quantity 1, total decreased back
remove item         → lineItemCount 1→0 AND isEmpty() true (the real empty state)
```

Totals policy: **start falsifiable** — assert the total strictly increases 1→2 units. Documented risk: a 2×1 promo on DES would break it; if that fires, weaken with the evidence in hand rather than shipping an unfalsifiable `>=` from day one (§29: a test that cannot fail is worse than a red one).

If the probe finds no quantity control: the spec drops to `cleanCart → add → verify 1 + total > 0 → remove → verify empty`, and findings §32 records the absence as the reason.

### Targeted improvement — `tests/cart/add-to-cart.spec.ts`

Today it asserts `itemCount() > 0`: a **state** assert, exactly §29's false-green shape (residue from a previous run blesses it). It adopts `cleanCart` and asserts the transition to exactly `1`. Two-line change, closes a known weakness.

## Error handling

- **Cart content never renders** (§23: 60+s empty `<main>` while the tab reads "Cesta (3)"): `isLoaded()` fails with its diagnostic after the budget. Environment class; retry may recover; analyzer files it `timeout`.
- **Fixture on a dead cart:** bounded iterations + deadline → explicit failure, never a hang.
- **Priming flake** (§28/§30 drawer noise): reuses the characterized `ProductPage` recipe; `retries: 1` recovers as usual.
- **Stale session mid-suite** (§24's login.spec re-auth tell): nothing new needed — the spec runs under the same storageState rules as every other spec.

## Validation plan (ordered gates)

1. Probe live → write findings §32 → delete probe.
2. New spec standalone ×2 (two consecutive greens, §25 criterion).
3. Controlled checks (§29 style): journey green from an already-empty cart (fixture short-circuit path); probe evidence that `isEmpty()` answers `false` on the mid-load skeleton.
4. Full `pnpm test` (26 specs) — no regression across the specs sharing `ProductPage.ts`.
5. `pnpm test:unit` (total-parsing unit tests), `pnpm typecheck`, `pnpm lint`.
6. Full suite → `pnpm plan --update` (§30 rule: never update the plan from a subset run).

## Files touched

| File | Change |
|---|---|
| `tests/_probe/cart-inner-probe.spec.ts` | new, temporary (deleted in step 1) |
| `src/pages/CartPage.ts` | new |
| `src/support/cartCleanup.ts` | new (`ensureEmptyCart`) |
| `src/support/price.ts` | new (pure total-parsing function, unit-tested) |
| `src/fixtures/test.ts` | `cleanCart` fixture + `cartPage` page-object fixture |
| `tests/cart/cart-lifecycle.spec.ts` | new |
| `tests/cart/add-to-cart.spec.ts` | adopt `cleanCart`, assert `=== 1` |
| `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` | append §32 |
| `CLAUDE.md` | current-state pointer refresh; backlog: cart-cleanup fixture → closed |
