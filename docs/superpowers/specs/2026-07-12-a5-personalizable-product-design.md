# A5 — Robust Product Selection Against Personalizable Variants

**Date:** 2026-07-12
**Status:** Approved by Jorge (brainstorm 2026-07-12), pending implementation plan
**Closes:** backlog **A5** (`add-to-cart.spec.ts` fails deterministically — the current top "camiseta" result is a Personalizable product with a different add-to-cart UI). Open and reconfirmed live across M8b, M9, and the 2026-07-06 audit.
**North Star:** Engineering Excellence (a reliably green reference suite is the precondition for everything agentic)
**Model routing:** this design on Opus 4.8; the live probe (Task 1) and all implementation/validation on Sonnet 5, per CLAUDE.md "Model routing policy".

---

## 1. Problem

`tests/cart/add-to-cart.spec.ts` searches `"camiseta"`, opens `searchResultsPage.firstProduct()` (the first PLP card matching the `-c0p` PDP-URL pattern), then drives `ProductPage.selectFirstSize()` → `addToCart()`. `selectFirstSize()` (`src/pages/ProductPage.ts:21`) waits for `getByRole('button', { name: 'Añadir a cesta' })` to open the "Tallas" dialog.

The current top "camiseta" result ("Camiseta tirantes rib") is a **Personalizable** product whose PDP exposes "Personalizar"/"Añadir" buttons instead of the plain "Añadir a cesta". The dialog never opens; `selectFirstSize()` exhausts its 20s deadline and throws. Failed **5/5 consecutive live attempts** during M8b's no-regression checks (findings §16); reconfirmed at M9 (findings §17).

**Root cause:** catalog drift, not flakiness. `firstProduct()` filters only on the `-c0p` URL pattern — it does not distinguish a standard product from a personalizable variant with a different add-to-cart UI. Whichever product DES ranks first for "camiseta" can be an incompatible variant.

`firstProduct()` is used by two specs:
- `tests/cart/add-to-cart.spec.ts:12` — opens **and adds to cart** (the failing spec).
- `tests/search/search-plp-pdp.spec.ts:13,16` — opens a product to verify search→PLP→PDP navigation; does **not** add to cart (a personalizable product would pass here today).

## 2. Decisions taken (with Jorge, 2026-07-12)

| Decision | Choice |
|---|---|
| Fix intent | **Keep the reference test on the standard flow.** Product selection avoids personalizable (and any future incompatible) variants; robust to catalog drift. The personalizable flow is **not** captured as framework knowledge (out of scope, no `ProductPage` variant handling). |
| Where the change lives | **Modify `firstProduct()` in place** in `src/pages/SearchResultsPage.ts` — extend the existing `-c0p` capability filter with a compatibility condition. Single source of truth; `search-plp-pdp.spec.ts` benefits too (deterministically opens a standard product). |
| Detection level | **Card-level (PLP) primary — select by capability, not position.** PDP-level try-next is a defined fallback only if the probe finds no usable card-level signal. |
| Selector | **Confirmed by a live probe (Task 1).** The design fixes the *shape*; the probe picks the exact signal by walking the detection hierarchy (§3). |

**Considered and rejected:**
- **Expanding `ProductPage` to handle both UI variants** — scope expansion beyond fixing A5; would make the personalizable flow proven knowledge, but Jorge chose to keep the reference test focused on the standard flow.
- **A separate `firstAddableProduct()` method** — smaller blast radius, but duplicates the locator logic and leaves `firstProduct()` able to land on a personalizable. Single source of truth preferred.
- **Changing the search term / adding a filter** — cheapest, but only moves the fragility (any term's top result can drift to a personalizable variant tomorrow). Does not address the root cause.

## 3. Detection hierarchy (the probe picks the rung)

The design commits to a card-level capability filter. The live probe (Task 1) walks this hierarchy top-down and implements the highest usable rung. The expected outcome is rung 1.

1. **Preferred — positive capability filter.** `firstProduct()` filters listitems that have both the `-c0p` PDP link *and* the card's standard add-to-cart affordance (e.g. a per-card quick-add `getByRole('button', { name: /^Añadir a la cesta/i })` — DES PLP cards carry per-card quick-add buttons, findings §10/M8b). Selects **by capability**: any card lacking the standard affordance (personalizable *or* a future variant) is skipped automatically. **Load-bearing assumption:** the card-level signal must reliably *predict* the PDP's add-to-cart variant — if a personalizable product shows the standard quick-add on its card and only its PDP differs, this rung is defeated. The probe validates this correlation before this rung is chosen (§4.1); if it fails, this rung is unusable and detection drops to rung 3 (PDP-level, where the truth lives).
2. **Acceptable — negative variant filter.** If no positive card-level affordance is reliably detectable, filter out cards showing a personalizable signal (`hasNot` a "Personalizable" badge/text or a "Personalizar" quick-add). A denylist: fixes today's case but does not generalize to unanticipated variants.
3. **Fallback (Enfoque 2) — PDP-level try-next.** Only if neither card-level rung is usable. Open card N; if the standard "Añadir a cesta" button does not appear within a short budget, recover the results grid and try card N+1, up to a small cap. Most robust to arbitrary drift, but a larger change (open→detect→recover→next loop) and contingent on `page.goBack()` restoring the SPA grid — which findings §7 flags as uncertain (`/q/` is not server-routable; a *reload* lands on home, but history-based back is untested). The probe confirms back-navigation before this rung is chosen.

**Robustness rationale:** rungs 1 and 3 select by *capability* (skip whatever the standard flow cannot drive), so they survive future catalog changes, not just today's personalizable product. Rung 2 is a denylist — acceptable as a floor, not preferred.

## 4. The live probe — implementation Task 1 (Sonnet 5)

A live probe against DES **must precede** any selector change (backlog requirement: findings §16 does not cover what "Personalizar"/"Añadir" do). Use `?device=desktop` on every DES URL (Jorge's current setup lacks the desktop-view extension). Use the `live-validate-des` skill.

The probe must answer, in order:

1. **Card signal AND its correlation to the PDP (the load-bearing question).** On the "camiseta" PLP, does each *standard* card expose a stable, accessibly-named quick-add affordance ("Añadir a la cesta {producto}"), present in the accessibility tree **at the moment `firstProduct()` is evaluated** (not only on hover / not lazily added on interaction)? Critically: **does that card-level signal reliably predict the PDP's add-to-cart variant?** Open the personalizable product's card and confirm whether its card looks standard (standard quick-add) while its PDP shows "Personalizar"/"Añadir" — if the card cannot be told apart from a standard one, rung 1 is **rejected** (drop to rung 3). If the card is distinguishable, capture the distinguishing signal (a "Personalizable" badge/text, a "Personalizar" quick-add, or the *absence* of the standard quick-add).
2. **Exact selector.** Confirm role / accessible name / regex for whichever rung (§3.1 or §3.2) is usable.
3. **Timing.** Does the chosen signal hydrate within `waitForResults()`'s 30s budget? With the card, or noticeably later? (Determines whether the wait needs adjusting.)
4. **Fallback viability (only if rungs 1–2 both fail).** Does `page.goBack()` from a PDP restore the results grid, or land on home like a reload?
5. **Reproduce A5.** Confirm the current personalizable product still reproduces the failure, and capture what its PDP shows ("Personalizar"/"Añadir") for the findings doc.

**Deliverable:** a new findings-doc section (§18) recording the personalizable card/PDP signals and the chosen rung. This grounds the selector change in real DES output, per the project's live-validation discipline.

## 5. Error handling & diagnostics

Today, when `firstProduct()`'s filter matches nothing, `waitForResults()` (`SearchResultsPage.ts:33`) times out and throws *"results grid did not render … dead /q/ load"*. After the change that message is **misleading** when the grid *did* render but contained no compatible product. The design distinguishes two states with separate diagnostics:

- **Grid rendered, no compatible product** → new error: *"results grid rendered but no standard-add-to-cart product found (all variants personalizable?)"*. Fails fast rather than burning the full budget.
- **Grid never rendered** (no `-c0p` listitem at all) → keep the existing *"dead /q/ load"* diagnostic and the reload-free, test-level-retry recovery (findings §7).

Mechanism: `waitForResults()` keeps a private locator for "any `-c0p` product card" (the pre-change `firstProduct()` logic) and compares it against the compatibility-filtered `firstProduct()`. If any product card is visible but no compatible one is, throw the new diagnostic; if no product card is visible at all, keep the dead-load path.

## 6. Testing & validation

**Test-first, adapted.** A live-validated locator change does not fit classic red/green unit TDD. The probe (Task 1) establishes the red case **live** (A5 reproduced). The fix turns it green **live**.

- **Unit tests.** Add coverage only where the codebase already has a precedent for testing locator construction. Confirm during implementation whether `src/pages/` has such a pattern; if not, validation is live-only (POMs are thin locator wrappers, validated live by design).
- **Live validation gate (Sonnet 5):**
  1. `add-to-cart.spec.ts` green across **3–5 consecutive runs** (it failed 5/5 before — repeated passes rule out luck, not one green).
  2. `pnpm test` full suite 4/4 — confirm `search-plp-pdp.spec.ts` (also uses `firstProduct()`) still passes.
  3. `pnpm typecheck` + `pnpm lint` clean.
- **Docs on completion:** findings doc §18 (probe + fix); mark A5 done in `docs/roadmap/2026-07-02-backlog.md` and the roadmap's "Where a fresh session resumes"; update CLAUDE.md's pending-tasks note.

## 7. Non-goals

- No `ProductPage` handling of the personalizable UI ("Personalizar"/"Añadir") — the standard flow only.
- No new test for the personalizable flow.
- No change to the search term or to `selectFirstSize()`/`addToCart()` themselves — the fix is in product *selection*.
- No hardcoded product URL (violates the no-hardcoded-URLs rule and the catalog-drift concern the fix exists to solve).
- Rung 3 (PDP-level try-next) is built **only** if the probe rules out both card-level rungs — not speculatively (YAGNI).

## 8. Success criteria

- `add-to-cart.spec.ts` passes deterministically across repeated live runs against DES, regardless of whether the top "camiseta" result is a standard or personalizable product.
- `firstProduct()` selects a standard product by capability, skipping incompatible variants — robust to future catalog drift, not just today's personalizable item.
- No regression: `search-plp-pdp.spec.ts` and the rest of `pnpm test` stay green; typecheck/lint clean.
- The personalizable card/PDP signals are recorded live in findings §18.
