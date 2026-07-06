# M9 — Builder Interaction-Spec Generation Design

**Date:** 2026-07-06
**Status:** Approved by Jorge (brainstorm 2026-07-06), pending implementation plan
**Closes:** the Phase 5 extension M8/M8b existed to enable (Builder consumes `interactions[]`); also closes backlog **B16** (non-unique testId as loaded-signal)
**North Star:** Autonomy (primary), Engineering Excellence
**Prerequisite (met):** the committed canonical map contains an "Añadir a la cesta" → Tallas `overlay` interaction (M8b, findings §16)

---

## 1. Problem

The Builder only generates navigation specs: walk a chain, assert the leaf loaded. Since M8/M8b the map knows *what happens when you interact* — `interactions[]` records trigger→outcome→revealed-elements, and the canonical map is guaranteed (must-capture, M8b) to contain the "Añadir a la cesta" → "Tallas" dialog capture. Nothing consumes that knowledge yet. M9 makes the Builder generate **interaction specs**: navigate, open the overlay, verify it opened, close it, verify it closed.

Separately, B16 (found during M8b's no-regression checks) makes generated *navigation* specs flaky-by-shape: `loadedSignalFor` can pick a testId hint that repeats across an in-page product grid (`productItemWishlist` ×38), producing a strict-mode violation. M9 touches exactly that function's file, and the interaction trigger raises the same uniqueness question, so B16 is closed here.

## 2. Decisions taken (with Jorge, 2026-07-06)

| Decision | Choice |
|---|---|
| Spec scope | **Open overlay + verify + close.** No state mutation (no size click, no cart add) — derivable 100% from the map, no domain semantics needed, no duplication of the manual add-to-cart spec |
| Selection source | **Directly from `map.interactions[]`** — planner untouched (M8 precedent: "flow shape unchanged"). The navigation chain is inherited from the existing flow whose leaf is the interaction's page |
| Which interactions | **Only must-capture-matching triggers** (today: 1 spec, the Tallas capture). Patterns read from the same `loadExplorerConfig().interactions.mustCapture` the crawler uses — producer and consumer cannot disagree. Generalizing later = adding patterns, not code |
| Trigger selector | **First-match (`.first()`) on the testId** — explicit "any exemplar of the grid" semantics, stable under catalog drift (the role-name embeds the product name — exactly A5's fragility) |
| B16 | **Closed in M9**, map-time (no live check): a testId hint is eligible as loaded-signal only if unique among its page's elements |
| Architecture | **Approach A**: extend `builder/select.ts` + `TemplateGenerator` + CLI — no new generator class, no new entry point |

## 3. Selection — `selectInteractionJourneys(map)` in `builder/select.ts`

Independent of `PlanReport`. Pipeline:

1. **Filter** `map.interactions`: `outcome === 'overlay'` AND the trigger element's label matches a must-capture pattern. Patterns come from `loadExplorerConfig().interactions.mustCapture` (respects `EXPLORER_MUST_CAPTURE`; builder already imports from `explorer/` — no new import cycle). Label matching reuses M8b's semantics (`labelClass()`-compatible: test the pattern against the trigger label the way the ledger does) so crawler and Builder agree on what "satisfies" a pattern.
2. **Resolve the trigger element** by `triggerElementId` with `.find()` — first match, explicitly documented: the canonical map has duplicate element ids (830 label+page collisions, observed 2026-07-06; recorded as a finding, NOT fixed in M9).
3. **Inherit the navigation chain** from the flow whose last step is `interaction.pageId`. Pages are per-session, so this fixes the session automatically (current capture → the anon flow `/ → /es/h-woman.html → /es/mujer/ropa/rebajas-n5303.html`). No such flow → skip with reason.
4. **Reuse guards:** the `CHECKOUT_ROUTE` path guard over the inherited chain, same as `selectJourneys`.
5. **Output:** `InteractionJourneyInput` — the `JourneyInput` shape plus `{ interactionId, trigger: Strategy, triggerLabel, overlayIsDialog: boolean }`. `overlayIsDialog` is true when any revealed element of the interaction has `selectorHints.role.type === 'dialog'`.

**CLI (`builder/cli.ts`):** generates top-N navigation specs as today, **plus** all selected interaction specs (today: exactly 1), each logged. A must-capture pattern with no satisfying interaction in the map produces a **non-fatal warning** ("the map does not contain capture X — re-crawl with `pnpm explore --update`"), mirroring M8b's crawler-side warning. Navigation generation proceeds regardless.

## 4. Generated template — `TemplateGenerator`

A second pair of templates in the same file (`interactionPageObjectFile` / `interactionSpecFile`), sharing `sq`/`strategyLiteral`/naming helpers. The page object imitates the live-validated `ProductPage.selectFirstSize()` pattern exactly (act→verify→retry per CLAUDE.md's standing rule, `dismissOnboardingTour` defensively inside the loop):

- `open()` — chain of gotos, identical to the navigation template.
- `isLoaded()` — leaf loaded-signal, as today (post-B16 selection).
- `openOverlay()` — `locate(page, trigger).first().click()` retried against a 20s deadline until `page.getByRole('dialog')` is visible; throws a diagnostic error on deadline.
- `isOverlayOpen()` — `page.getByRole('dialog').isVisible()`.
- `closeOverlay()` — Escape keypress retried until the dialog is not visible (mirror of `openOverlay`).

Template decisions:

- **Overlay-open signal: `getByRole('dialog')` with NO name.** The dialog's accessible name concatenates product-variable text ("Tallas 32 34 … Pantalón bombacho …") — asserting on it would be A5-style fragility. Emitted only when `overlayIsDialog` is true; otherwise the open-signal falls back to the first revealed element with a usable hint via `locate()` (existing `toStrategy`).
- **No assertions on concrete sizes or "Descartar"** — sizes vary per product; the map-guaranteed outcome is "an overlay opened", and that is what the spec verifies.
- **Generated spec flow:** `open()` → `expect.poll(isLoaded)` → `openOverlay()` → `expect.poll(isOverlayOpen).toBe(true)` → `closeOverlay()` → `expect.poll(isOverlayOpen).toBe(false)`. Closing is part of the assertion — the full open/close cycle is exactly what M8's crawler validated live.
- **Naming:** `interaction-` prefix on the spec filename, `Interaction` suffix on the class, via two new helpers in `builder/naming.ts` delegating to the existing ones — navigation and interaction specs for the same leaf never collide.
- Output to the same gitignored `tests/generated/`, run via `pnpm test:generated`, same review→promote cycle.

## 5. B16 fix — testId uniqueness at selection time (map data only)

In `loadedSignalFor`:

- Build a per-page count `Map<attr+"="+value, count>` over the leaf's elements (before the existing `revealedBy` exclusion is applied to candidates; the count itself covers all the page's elements so a repeated grid testId is detected even if some instances are revealed).
- In the testId tier, a hint is eligible only if its `{attr, value}` occurs **exactly once** on that page. A repeated hint (the `productItemWishlist` ×38 case) makes that element fall through to the role/label tiers as a candidate — **deprioritize, not exclude**, consistent with B14.
- Documented symmetry note at the code site: the interaction trigger deliberately uses the opposite policy (`.first()` on a repeated testId) because there "any exemplar opens the overlay" is the semantics, while a loaded-signal must be unique because `isVisible()` on a multi-element locator is a strict-mode violation.

## 6. Guards, errors, out of scope

- Skips with explicit reasons (existing `SkippedProposal` structure): trigger element unresolvable, no flow with that leaf, no usable trigger hint, checkout-looking chain.
- Duplicate map element ids: tolerated (first-match), recorded as an observation in the findings doc/backlog — not fixed here.
- **Out of scope, explicit:** planner untouched; schema stays 1.5; crawler untouched; A5 not fixed (but shapes live validation, §7.3).

## 7. Testing & live validation

**Offline (TDD, all green before any live run):**

1. `builder/select.unit.test.ts`: overlay+must-capture filtering (a `none`/`navigated` or non-matching interaction never generates); chain/session inheritance from the correct flow; skip reasons; duplicate-id tolerance; `overlayIsDialog` computation. B16: repeated same-page testId not eligible as loaded-signal (falls to role/label), unique testId still wins, trigger may still use a repeated testId.
2. `TemplateGenerator.unit.test.ts`: generated pair contains `.first()` on the trigger, name-less `getByRole('dialog')`, Escape-close with retry, `GENERATED from interaction ...` header, prefixed naming.
3. `builder/naming.unit.test.ts`: new helpers.
4. Offline smoke against the committed canonical map (M6b precedent): `pnpm build-tests` yields exactly 1 interaction spec + top-N navigation.
5. `pnpm typecheck` / `pnpm lint` / `pnpm test:unit` green. Repo rules: no `any`, no import cycles.

**Live (milestone success criteria):**

1. `pnpm build-tests --top 3` → 3 navigation specs + 1 interaction spec, 0 errors.
2. `pnpm test:generated` → **the interaction spec passes live** (opens the Tallas dialog on the rebajas PLP via the grid quick-add, verifies, closes) — M9's core criterion. Navigation specs 3/3. If this regeneration's top-3 lacks a B16-shaped page, verify B16 by targeting the page that failed in M8b (`falda-mini-…c0p233761111`), same method B14 used with `--top 16`.
3. **No-regression with a known caveat:** `pnpm test` — expected 3/4: `add-to-cart.spec.ts` is deterministically broken by A5 (pre-existing, documented). Criterion: the other 3 pass, and an add-to-cart failure snapshot must still show the Personalizable product (confirming A5, not something new).
4. `pnpm plan --update` behaves identically (planner untouched).
5. Documentation closure: findings §17, roadmap/backlog (B16 → done, M9 → done), CLAUDE.md "Current state", memory.

## 8. Risks

1. **Catalog drift on the rebajas PLP** — mitigated by `.first()`: any grid product serves the interaction.
2. **DES environment noise** — `retries: 1`, findings §7 protocol (characterize red streaks before touching framework code).
3. **Dialog not closing on Escape live** — the spec fails and gets investigated before patching; M8's crawler already validated Escape-close on this exact UI.
4. **Map staleness** — a future re-crawl could drop the capture (must-capture makes this unlikely by design); the CLI's non-fatal warning names the re-crawl remedy.
