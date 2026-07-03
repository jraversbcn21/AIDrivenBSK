# B13 — Checkout/PDP Classifier Fix (Design)

**Date:** 2026-07-03
**Status:** Approved by Jorge (brainstorm 2026-07-03)
**Backlog item:** B13 (`docs/roadmap/2026-07-02-backlog.md`), plus two adjacent misclassifications found during design exploration.
**Related findings:** `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` §10 (third classifier bug + shop-cart open lead).

---

## 1. Problem

At full crawl scope, 16 of 18 `-c0p` PDP pages in the canonical map classify as `Checkout` instead of `PDP`. Root cause chain, confirmed against the committed map during this design session:

- The PDP rule requires `hasAddToCart && hasSizeSelector`. On DES, the real size selector only exists inside the "Tallas" dialog the crawler never opens (link-following only, B9), so `hasSizeSelector` on a PDP fires only when the word "talla" happens to appear in the extracted `textSummary` — a hydration-timing accident. Two pages got lucky; sixteen didn't.
- Every PDP carries an "Envíos y devoluciones" accordion button, so the loose `hasCheckoutSteps` text regex (`/pago|checkout|envío|shipping|payment/`) **always** fires on PDPs. When the PDP rule misses, the page falls through to `Checkout`.

Two adjacent misclassifications share the same family (loose Checkout text rule + rule ordering), confirmed in the committed map:

- `/es/shop-cart.html` (auth) classifies `Checkout`. Double cause: the Cart path rule regex `/\/cart|\/cesta/` **does not match** `shop-cart.html` (requires a literal `/cart` with leading slash), and the Checkout rule is evaluated before the Cart rule anyway.
- `/es/shopping-guide.html` (anon + auth) classifies `Checkout` purely from its shipping/payment help text.

A structural fact discovered during exploration: **the map contains zero real checkout pages** (checkout is unreachable by link-following without cart state), so today the `hasCheckoutSteps` rule produces *only* false positives.

Why it matters: D15 flags Checkout as the highest-risk flow type. Sixteen fake `Checkout` flows contaminate the Coverage Planner's ranking and any human reading of the map.

## 2. Approach chosen

**Deterministic path rules, evaluated before text-signal rules** (approach A of three considered; B — interaction-based size-selector discovery — is M8/B9 scope; C — dropping `hasSizeSelector` from the PDP rule — remains text-fragile and was already rejected in M6).

The `-c0p{digits}.html` URL pattern is confirmed-live as the unambiguous DES PDP identifier and is already trusted elsewhere (`explorer/url.ts` `routePattern`, `ProductCard` detection in `explorer/extract/analyzeAria.ts`). The classifier already uses path rules for Wishlist/Cart/Home — this extends an existing idiom, not a new one.

## 3. New rule order (`explorer/classify/RuleClassifier.ts`)

```ts
// 1. Deterministic path rules (confirmed-live URL patterns beat text signals on this site)
if (/-c0p\d+\.html$/i.test(p))                    → PDP,      confidence 0.95
if (/\/shop-cart\.html$|\/cart|\/cesta/.test(p))  → Cart,     confidence 0.9
if (/\/wishlist|\/favoritos/.test(p))             → Wishlist, confidence 0.8   // moved up, logic unchanged

// 2. Signal rules (as today, one change in Checkout)
hasProductGrid && hasFilters                       → PLP, 0.85
hasAddToCart && hasSizeSelector                    → PDP, 0.9   // kept as fallback for non--c0p PDPs
hasCheckoutSteps && /checkout|order|pago|payment/.test(p) → Checkout, 0.8   // now requires a path hint too
hasLoginForm                                       → Account, 0.75
hasSearchResults                                   → Search, 0.75
p === '/' || /^\/[a-z]{2}$/.test(p)                → Home, 0.7
                                                   → Other, 0.3
```

Decisions:

- **PDP path rule beats the PLP signal rule.** A `-c0p` page is a PDP even when it shows a recommendations carousel with quick-add buttons (it does — confirmed from the map's extracted elements).
- **The signal-based PDP rule is kept** as a zero-cost fallback for a hypothetical PDP without the `-c0p` pattern.
- **Checkout now requires text + path.** With zero real checkout pages in the map, the text-only rule has no true positives to lose. The path-hint list (`checkout|order|pago|payment`) is a reasonable guess to be **confirmed against the real DES checkout URL the first time one is crawled or tested** (D15) — annotated at the rule site and in the findings doc.
- **No schema change.** `PageType` already includes `Cart`; only labels change, not shape. No `schemaVersion` bump.

Expected effect on the regenerated map: 16 mislabeled `-c0p` pages → `PDP`; `shop-cart.html` → `Cart` (also closes the §10 open lead); `shopping-guide.html` → `Other`; zero `Checkout` pages (none are genuinely reachable). No correctly-labeled page depends on the moved rules, so no label regressions are expected — verified via map diff during live validation.

## 4. Testing

Unit tests in `explorer/classify/RuleClassifier.unit.test.ts`, reproducing the live-confirmed combinations:

1. **B13 regression:** path `-c0p123.html` + `hasCheckoutSteps: true` + `hasSizeSelector: false` → `PDP`.
2. **Path beats PLP:** `-c0p` path + `hasProductGrid`/`hasFilters` true → `PDP`.
3. **Cart:** `/es/shop-cart.html` + checkout-ish text signal → `Cart`.
4. **Shopping-guide shape:** checkout text signal, no checkout path → `Other`.
5. **Checkout still reachable:** checkout text + a `checkout`/`order`/`pago` path → `Checkout`.
6. Existing tests adjusted where the reorder changes priority outcomes.

## 5. Live validation (VPN required)

1. `pnpm test:unit`, `pnpm typecheck`, `pnpm lint` green before touching DES.
2. `pnpm exec playwright test --project=setup` (regenerates `.auth/state.json`), then full re-crawl: `EXPLORER_MAX_PAGES=80`, `EXPLORER_TIME_BUDGET_MS=1200000`, both sessions, `pnpm explore --update`.
3. Verify on the regenerated map: **all** `-c0p` pages → `PDP`; `shop-cart` → `Cart`; `shopping-guide` → `Other`; zero `Checkout` pages; diff against the previous map to confirm no label regressions.
4. `pnpm test` + `pnpm plan --update` to re-annotate coverage on the new map (same pattern as M7). Expected side effect: the 16 fake `Checkout` flows disappear from the planner's ranking.

## 6. Deliverables

- `fix(explorer): ...` — `RuleClassifier.ts` + unit tests.
- Regenerated canonical map + re-annotated coverage.
- Docs: findings doc new §13 (live validation results), backlog (B13 → done; §10 shop-cart open lead → closed), roadmap ("Where a fresh session resumes").

## 7. Error handling

No new surface — the classifier is pure and synchronous; the crawl reuses all existing machinery (0-page overwrite guard, `errors[]`, time budget).
