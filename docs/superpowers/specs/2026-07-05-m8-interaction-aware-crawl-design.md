# M8 — Interaction-Aware Crawl Design

**Date:** 2026-07-05
**Status:** Approved by Jorge (brainstorm 2026-07-05), pending implementation plan
**Closes:** backlog B9's "nav menus/overlays opened during crawl" deviation (the last open row of that table's original scope)
**North Star:** Knowledge (primary), Autonomy
**Phase gate:** prerequisite for the Builder generating interaction specs (M9 candidate) — Phase 5 extension

---

## 1. Problem

The crawler (`explorer/crawl/crawler.ts`) is 100% passive: navigate → consent → settle → extract → enqueue links. It never clicks anything. Two live-confirmed consequences:

1. **The PDP size selector is invisible to the map.** The "Tallas" dialog only exists after clicking "Añadir a cesta" (findings §5); passive crawling never sees it. This was the root cause of B13's Checkout/PDP misclassification (fixed there by path rules, but the *knowledge* is still missing), and it is exactly what the Builder needs to generate an add-to-cart interaction spec.
2. **Nav menus/overlays are never opened**, so their links and elements are absent from the map — the map under-represents the site's navigation surface.

The Builder can only generate navigation specs because the map only knows "what pages exist", not "what happens when you interact".

## 2. Decisions taken (with Jorge, 2026-07-05)

| Decision | Choice |
|---|---|
| Interaction scope | **Both families**: nav/header overlays AND page-body dialogs (e.g. PDP "Tallas") |
| Milestone boundary | **Map knowledge only.** Builder generation of interaction specs is a separate milestone (M9 candidate). One exception: a small Builder *guard* ships in M8 (see §5) |
| Candidate selection | **Generic bounded + equivalence-class dedupe** (not a curated trigger list, not exhaustive) |
| Map representation | **New top-level `interactions[]` entity** (schema 1.5), revealed elements in the normal `elements[]` with a `revealedBy` back-reference |

## 3. Crawler mechanics — `explorer/crawl/interact.ts` (new module)

Runs inside `crawlSession` immediately after the passive extraction of each page. **`aria` extraction mode only** — `dom` mode is offline and never interacts. The crawler remains the only layer touching Playwright; analyzer and schema stay browser-free.

### Candidate selection

From the page's already-extracted elements:

- Only `button` / `filter` / `sort` types with a usable role hint (`selectorHints.role`), and `destructive: false`.
- **Equivalence-class dedupe (the cost-control piece):**
  - Shared-chrome triggers (element `component` provenance `Header`/`Footer`/`MiniCart`, from B14) → interacted **once per crawl** (dedupe key: `label + role`, global).
  - Page-specific triggers → interacted **once per `routePattern`** (dedupe key: `routePattern + label + role`).
  - Net effect: "Añadir a cesta" opens on *one* PDP (all share `-c0p{id}.html`), "Filtrar" on *one* PLP, the header nav menu once per crawl. Estimated total interactions per full crawl: ~10–30 (≈ distinct routePattern × trigger pairs), adding ~2–3 min, not a multiplier.
- Residual per-page budget: `EXPLORER_MAX_INTERACTIONS_PER_PAGE` (default **3**) as a safety belt on pathological pages.

### Per-interaction protocol (act→verify→retry, per CLAUDE.md's standing rule)

1. Take an aria snapshot ("before") → click with retry → `waitForSettle` (reused from `explorer/crawl/settle.ts`) → aria snapshot ("after").
2. Diff the two snapshots. Three outcomes:
   - **`overlay`** — new nodes appeared: run the existing analyzer (`analyzeAriaNodes`) over the new subtree to extract revealed elements and links; close via **Escape** and verify closure (retry); if it will not close, **reload the page** (passive extraction is already saved).
   - **`navigated`** — URL changed: record it, then recover with `goto(originalPath)` + `acceptConsent` + settle; if recovery fails, abort the remaining interactions on this page (page knowledge is intact).
   - **`none`** — nothing changed: record and move on.
3. **Never click anything inside a revealed overlay** — extract and close only. Revealed *links* are enqueued into the frontier normally (this is the nav-menu knowledge payoff).
4. A failed interaction is logged and skipped — it never fails the page or the crawl.

### Safety policy (accepted by Jorge)

- `destructive`-flagged elements are never clicked (existing regex, `explorer/extract/destructive.ts`).
- Accepted residual risk: a "safe" button with no overlay may mutate test-account state (e.g. "Añadir a la lista de deseos" adds directly, no dialog). Same accepted precedent as cart accumulation between runs (findings §7 — cosmetic, doesn't affect correctness).

### Config

Follows the `loadExplorerConfig` pattern (defaults + env + overrides, fail-fast validation):

- `EXPLORER_INTERACTIONS=off` — escape hatch; default **on** when `extraction === 'aria'`.
- `EXPLORER_MAX_INTERACTIONS_PER_PAGE` — positive integer, default 3.

## 4. Schema `1.4 → 1.5` (additive, no migration code — M7/B14 precedent: the canonical map is regenerated live as part of this milestone)

New top-level section in `FunctionalMap`:

```ts
interface MapInteraction {
  id: string;                    // stable: derived from pageId + triggerElementId (ids.ts pattern)
  pageId: string;
  triggerElementId: string;
  outcome: 'overlay' | 'navigated' | 'none';
  revealedElementIds: string[];  // ids into elements[]; empty unless outcome === 'overlay'
  navigatedTo?: string;          // normalized path; only when outcome === 'navigated'
}
```

`MapElement` (and `ExtractedElement` in `explorer/types.ts`) gains `revealedBy?: string` (the interaction id). Revealed elements live in the normal `elements[]` array but remain distinguishable from load-time-visible ones.

## 5. Builder guard (ships in M8, not M9)

`builder/select.ts`'s `loadedSignalFor` must **exclude** elements carrying `revealedBy` when picking a loaded-signal: a revealed element is *not* visible on page load, so a generated `isLoaded()` asserting on one (e.g. a size button that only exists after opening the Tallas dialog) would always time out — regressing exactly what B14 fixed. ~3-line change + unit test. All other consumption of `interactions[]` (generating interaction specs) is M9.

## 6. Explicitly out of scope / unchanged

- **Classifier:** B13 already classifies PDPs by path; no rule changes needed.
- **Differ:** ignores the new section; surfacing interaction diffs is a follow-up.
- **Planner:** flow shape unchanged.
- **Builder spec generation from `interactions[]`:** M9.

## 7. Testing (TDD, existing patterns)

- `explorer/crawl/interact.unit.test.ts` — offline, synthetic before/after aria snapshots, injectable actions (same pattern as `settle.unit.test.ts` / `frontier.unit.test.ts`): overlay detected and extracted; equivalence-class dedupe (routePattern-keyed); global chrome dedupe; per-page budget respected; `navigated` outcome with recovery; `none` outcome; destructive never clicked; Escape-fails → reload fallback.
- `builder/select.unit.test.ts` — revealed elements excluded from loaded-signal selection.
- Strict repo rules apply: no `any`, no import cycles, `pnpm typecheck`/`lint`/`test:unit` green before any live run.

## 8. Live validation (milestone success criteria)

1. Bounded re-crawl against DES (80 pages/session, both sessions) with interactions on.
2. The map contains:
   - an `overlay` interaction on a PDP whose trigger is "Añadir a cesta" and whose `revealedElementIds` include "Talla …" buttons — the knowledge passive crawling could never capture;
   - a header nav-menu interaction whose revealed links fed the frontier.
3. Full no-regression: `pnpm test` 4/4; `pnpm build-tests` + `pnpm test:generated` green (proving the `revealedBy` guard).
4. Canonical schema-1.5 map committed; findings doc gains §15; `pnpm plan --update` re-annotates.

## 9. Risks

1. **DES instability during interactions** — mitigated by act→verify→retry, per-interaction try/catch, and the documented environment-noise protocol (findings §7: cross-check with a manual probe before touching framework code on a red streak).
2. **Tallas dialog might not close on Escape** — reload fallback designed in from the start.
3. **Crawl time** — bounded by equivalence-class dedupe (~10–30 total interactions, +2–3 min estimate). If live cost explodes, `EXPLORER_TIME_BUDGET_MS` is already configurable; do not blindly raise budgets — confirm the mechanism first (§10 precedent).
4. **Open lead this design may interact with (findings §7):** stray overlays from queued retry clicks. The per-interaction protocol (snapshot-diff + verified close) is itself a step toward state-aware interaction; if stray-overlay noise appears during live validation, characterize before patching.
