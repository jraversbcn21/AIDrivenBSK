# D15 phase 2 — Checkout inner structure, map integration, permanent spec (design)

**Date:** 2026-07-18
**Model:** Claude Fable 5 (full-cycle routing — CLAUDE.md "Model routing policy", 2026-07-14 decision).
**Backlog:** `docs/roadmap/2026-07-02-backlog.md` §D, item D15 (phase 2). Phase 1 closed 2026-07-14 (findings §22).
**Status:** Design approved section-by-section in session, pending Jorge's review of this written spec. Implementation follows via writing-plans.
**Baseline:** `master` @ `e74c389`. Canonical map: `coverage/functional-map.json`, schema 1.7, 165 pages / 165 flows, zero Checkout pages (the crawler cannot reach checkout by link-following — it sits behind a cart with items).

---

## 1. Problem

Phase 1 reached the real checkout for the first time (`/es/shop-cart.html` → "Tramitar pedido" → `/es/checkout.html`) and validated B13's Checkout path-hint, but deliberately stopped at the door. What's still missing, per the backlog's own phase-2 definition:

1. **Checkout's inner structure is unknown.** The phase-1 probe's `<main>`-scoped snapshot was **empty at +5s** — the checkout SPA hydrates slower than anything else measured on this site, and no settle budget for it exists. Steps, shipping form, and the payment-method list have never been captured.
2. **The map has no Checkout flow**, so `pnpm ask "checkout"` answers with the honest blind-spot message instead of resolving. The evidence→map→ask chain is dark for the platform's highest-risk flow type.
3. **No permanent spec asserts anything inside checkout** — `tests/checkout/checkout-reach.spec.ts` verifies arrival (URL + title) only.

## 2. Scope decisions (Jorge, this session)

- **Deliverable: the full package** — structured knowledge capture (findings §23) + a permanent inner-structure spec + a Checkout flow in the canonical map so `pnpm ask "checkout"` resolves.
- **Depth: strict read-only.** Observe and capture only: checkout steps, shipping form structure, and whatever payment methods the page *lists*. No field is ever filled, no state-changing click is made past "Tramitar pedido" (itself already validated in phase 1), nothing is confirmed. The shared test account is never mutated beyond the pre-existing add-to-cart behavior every suite run already has.
- **Explicit non-goals (a hypothetical phase 3):** filling shipping/payment forms, interacting with payment methods, placing orders, and investigating DES *test* payment methods (external knowledge the project does not have — never guessed, per standing doctrine). Prod is structurally excluded (`checkoutAllowed: false`).

## 3. Decision — the ladder: branch C with fallback B, decided by probe evidence

Three approaches were weighed for the map-integration piece:

- **A — scripted state-changing actions inside the crawl** (crawler adds to cart and clicks "Tramitar pedido" mid-crawl): **rejected.** It breaks the crawler's deliberate non-destructive interaction invariant (M8), is the largest code change, and worsens shared-cart accumulation on every crawl.
- **B — dedicated post-crawl scripted visit** (see §5): viable everywhere, slightly more code than C.
- **C — checkout as a crawl seed behind a cart-priming step** (see §5): smallest true integration — checkout becomes an ordinarily-crawled page — but only works if `/es/checkout.html` is **server-routable** with a non-empty cart, which is unknown (phase 1 deliberately did not test it; cf. `/es/q/{term}` which is NOT server-routable, findings §7).

**Decision (A5-ladder precedent): the Task-1 probe answers routability empirically, then the branch is chosen on evidence** — C if routable, B if not. The branch decision is recorded in findings §23 *before* any branch code is written. Both branches share most of their pieces (§5), so the wasted-work risk of the ladder is small by construction.

## 4. Task 1 — the probe (temporary, deleted after documenting; A5/D15-f1 lifecycle)

`tests/_probe/d15-checkout-inner-probe.spec.ts`, auth session, cart primed via the existing UI flow, answers **three questions in one live session**:

- **Q1 — settle timing.** After the "Tramitar pedido" navigation lands on `/es/checkout.html`: full-page aria snapshots at +2/+5/+8/+12/+20s. Output: when the tree stabilizes and what a reliable "checkout hydrated" signal is. This feeds the settle budget for everything downstream — measured, not guessed (§10 doctrine: no blind timeout increases).
- **Q2 — inner structure.** Once stable: complete accessibility-tree dump — visible checkout steps, shipping-form fields (names/roles only), and the **listed** payment methods. Read-only: the probe reads the tree, it never focuses, fills, or clicks anything inside checkout.
- **Q3 — server-routability.** *After* Q1/Q2 (so a redirect cannot contaminate the main capture), same session, same non-empty cart: `page.goto('/es/checkout.html')` directly. Does checkout load, or does it redirect (cart/home — the `/es/q/` pattern)? Run twice for confidence if the first result is a redirect (environment noise discrimination, §7).

**Ordering note:** Q3 runs last within the same test so the primary capture is finished before any navigation experiment. If the probe's first attempt hits the documented add-to-cart environment noise (Tallas dialog, §14/§16/§18), the standard `retries: 1` re-runs it — same as phase 1, where the retry captured everything.

## 5. Shared pieces and branch mechanics

**Common to both branches:**

- **`explorer/config.ts`:** new `seedCheckout: boolean` (env `EXPLORER_SEED_CHECKOUT`, **default off**). The default crawl's behavior is byte-identical unless explicitly opted in.
- **`primeCart` helper in `explorer/`:** ensures the auth session's cart is non-empty before checkout is approached. Reads the cart tab count ("Cesta (N)", the fast reliable signal, §5 findings); **only if 0**, runs the add-to-cart flow **reusing the `src/` page objects** (SearchBar / SearchResultsPage / ProductPage — the explorer already imports from `src/` today, e.g. `acceptConsent`; the import direction explorer→src has no cycle). If the shared cart already has items (it usually does, §7's accumulation lead), nothing is added.
- **Extraction:** the existing pipeline — `waitForSettle` with a checkout-specific budget derived from Q1 (not the PLP default, unless Q1 shows the PLP default suffices) + `analyzeAria`. **Zero classifier changes:** B13's path rules already label `checkout.html` as `Checkout` (validated live in phase 1).
- **Failure policy:** if `primeCart` exhausts its retries or the checkout visit/settle fails, the checkout capture is **skipped with a non-fatal warning** (M8b must-capture precedent) — a bad DES day degrades the crawl's checkout knowledge, it never kills the crawl.

**Branch C (Q3 = routable):** when `seedCheckout` is on, `explorer/cli.ts` runs `primeCart` on the auth context before crawling and adds `/es/checkout.html` to the **auth-session seed list**. Checkout is then crawled, extracted, flow-synthesized, and refreshed on every future opted-in crawl like any other page.

**Branch B (Q3 = not routable):** same `primeCart`, but `explorer/cli.ts` gains a **dedicated post-crawl step** (auth context, `seedCheckout` on): navigate to `/es/shop-cart.html` → click "Tramitar pedido" via `actUntil` (F8; the exact pattern `checkout-reach.spec.ts` already uses) → settle → `analyzeAria` → append the resulting page + flow through the same `buildMap`-shaped path the crawl uses (no hand-written JSON) before the map is written. Because the step runs on every opted-in `--update`, the entry **regenerates with each crawl — no preservation logic is needed** (this dissolves the staleness cost that made standalone map-injection unattractive).

**Permanent spec:** new `tests/checkout/checkout-structure.spec.ts` (phase 1's `checkout-reach.spec.ts` stays untouched): walk the UI path to checkout, wait the measured settle, assert the inner-structure signals Q2 identified (e.g. shipping form visible, step indicators present) — read-only, `test.skip(!env.checkoutAllowed)`, `expect.poll` + `actUntil` conventions.

**`pnpm ask`:** expected zero code — resolution operates over map flows, and a Checkout-typed flow should match "checkout" naturally. **Implementation must verify** whether the honest blind-spot answer special-cases checkout in `intent/` (B-NL1 mentions it explicitly); if a hardcoded case exists, it is removed in this milestone so the answer flows from the map.

## 6. Risks

- **Checkout settle is the main technical unknown** (empty `<main>` at +5s, phase 1). Q1 measures before anything is built on it. If checkout's aria tree turns out never to stabilize usefully, the milestone stops there and findings §23 records an honest blocker — no empty capture is forced into the map.
- **Read-only under a slow SPA:** probe and spec only read the accessibility tree; the only new click anywhere is "Tramitar pedido" (phase-1-validated). State-mutation risk beyond the existing add-to-cart behavior: none by design.
- **Environment noise:** `primeCart` inherits the documented Tallas-dialog flakiness — mitigated by the same `actUntil` retries inside the reused POMs, plus the non-fatal skip policy in the crawler.
- **Shared cart:** at most +1 item per opted-in crawl (only when the cart is empty). Marginally worsens §7's cosmetic accumulation lead — noted there; the cleanup fixture remains its own backlog item, not solved here.
- **Map guardrails:** existing ones apply unchanged (0-page write refusal, B17 unique-id guarantee). Branch B feeds the standard builder path, so its page/flow obeys the same schema and guards.

## 7. Validation gates (all live, in order)

1. **Probe:** runs live, answers Q1/Q2/Q3; findings §23 written with the evidence and the chosen branch; probe deleted.
2. **Opted-in crawl:** `EXPLORER_SEED_CHECKOUT=1 pnpm explore --update` → canonical map contains ≥1 `Checkout` page (`/es/checkout.html`) with real extracted elements and a Checkout-typed flow. Verified directly against the JSON, not logs (B17 precedent).
3. **`pnpm ask "checkout"`** (plus a Spanish phrasing, e.g. "prueba el checkout") resolves to the new flow and generates its draft; the draft **passes live**.
4. **Permanent spec:** `checkout-structure.spec.ts` green live; full `pnpm test` green with no regressions; `pnpm test:unit` / `typecheck` / `lint` clean (new unit tests for `primeCart` and the branch-B step if built, offline with fixtures, existing pattern).
5. **Default crawl unchanged:** a crawl **without** the flag shows no behavior change — the opt-in boundary is demonstrated, not assumed.
