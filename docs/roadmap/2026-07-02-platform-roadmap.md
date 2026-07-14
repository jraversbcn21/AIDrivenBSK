# Agentic QA Platform — Roadmap & Module Evolution

**Date:** 2026-07-02
**Status:** Living document (update when a milestone lands or a phase gate is passed)
**Sources of truth:** `CLAUDE.md`, `docs/superpowers/specs/2026-06-17-qa-foundation-design.md`, `docs/superpowers/specs/2026-06-17-explorer-agent-design.md`, `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md`
**Companion:** [`2026-07-02-backlog.md`](./2026-07-02-backlog.md) — the complete pending-work backlog this roadmap sequences.

---

## North Star

Every commit must increase one of these four capabilities:

- **Knowledge** → the platform understands the application better.
- **Reasoning** → the platform makes better QA decisions.
- **Autonomy** → the platform requires less human intervention.
- **Engineering Excellence** → the codebase becomes more robust, maintainable and extensible.

If a task does not improve at least one of these capabilities, question whether it should be implemented.

---

## Where a fresh session resumes (2026-07-06, later: Fable 5 final audit)

**M9 is done — the Builder now generates interaction specs from `interactions[]`, and B16 is closed.** `builder/select.ts` gained `selectInteractionJourneys`/`unsatisfiedMustCapture` (map-only selection, must-capture patterns shared with the crawler's config); `TemplateGenerator.generateInteraction` emits an open→verify→close spec mirroring `ProductPage`'s act→verify→retry idiom; the CLI wires both alongside navigation-journey generation. Same milestone closed **B16**: `loadedSignalFor` now excludes a testId hint from the loaded-signal tier when it repeats among the leaf page's own elements (deprioritize, not exclude). No schema change (still 1.5). Design: `docs/superpowers/specs/2026-07-06-m9-interaction-spec-generation-design.md`. Plan: `docs/superpowers/plans/2026-07-06-m9-interaction-spec-generation.md`.

**Live-validated 2026-07-06, subagent-driven execution (worktree `feat/m9-interaction-spec-generation`):** all 5 offline tasks reviewed clean (one Important-but-plan-mandated duplication finding in Task 4 was fixed on the spot at Jorge's direction — a dedupe refactor, not a scope change). Live run found and fixed a genuine new bug during validation (not blind-patched — root-caused via isolated reproduction): DES keeps a permanently-mounted nav-menu dialog in the DOM on every page, so the design's original `getByRole('dialog')` overlay-open signal hit a strict-mode violation once a real overlay also opened. Fixed with a baseline dialog-count diff (mirrors M8's own crawler diffing idiom). After the fix: `pnpm test:generated` 5/5 no retries (the interaction spec opens/verifies/closes the Tallas dialog live); B16 confirmed fixed live (the exact page that failed in M8b's no-regression check now picks a page-specific carousel-control signal, not the repeated wishlist testId); `pnpm test` 3/4 (A5 confirmed, unrelated, pre-existing); `pnpm plan --update` unchanged (same `/`-rooted-flows cause as §9/§12/§13/§15/§16). Findings doc §17.

**Same day, later — a full codebase architecture/quality audit ran** (Fable 5's last document-phase task before its retirement from this workflow; see CLAUDE.md's "Model routing policy", added 2026-07-06, which replaces it with Opus 4.8 for all future spec/plan/doc cycles). Diagnostic only, no code changes: `docs/superpowers/notes/2026-07-06-fable5-final-audit.md`. Two structural findings were promoted to numbered backlog items — **B17** (root-caused the M9-observed 830+ duplicate `MapElement.id` collisions: no occurrence discriminator in `makeId`, 32% of the element table is redundant, 127 duplicate instances actually diverge in their hints) and **F18** (a new backlog section, Planner: coverage matching has been structurally 0/N since M7b — seven consecutive sessions attributed this to crawl-order variability, but it's a deterministic seed/match incompatibility, not noise). Ten smaller findings (differ blind to `interactions[]`, redirect-duplicate pages paying full extraction cost before being discarded, the offline DOM extractor missing `data-qa-anchor`, the act→verify→retry idiom hand-rolled seven times, and others) are tracked in the audit doc itself with a proposed sequencing, not filed as individual backlog items yet.

**A5 is done (2026-07-12)** — `SearchResultsPage.firstProduct()` now selects by capability (standard quick-add button present, `Personalizable` badge absent), live-validated 5/5 against DES. See backlog §A and findings doc §18 for full detail.

**A6 is done (2026-07-12, same day)** — `LoginPage.login()` matches DES's current `/es/logon.html` flow again (no obsolete interstitial click); the full serialized `pnpm test` suite completes 4/4 end-to-end. See backlog §A and findings doc §19.

**The audit's "hygiene" grouping is done (2026-07-12, same day)** — F2 (differ now diffs `interactions[]`), F9 (Builder detects a stale `proposals.json`), F6 (offline extractor no longer misses `data-qa-anchor`), F11 (extraction truncation now recorded, schema 1.5→1.6, additive), F12 (`--from-report` closes the report/map shape footgun). See audit doc §3.1.

**F18 is done (2026-07-13)** — coverage matching restored: `/` dropped from the crawler's `SEEDS` plus the coupled F4 chain-truncation fix (commit `304c35e`), a live re-crawl to a 155-page map with no `/` root (commit `e02acc8`), and `pnpm plan --update` now covering 5/155 flows with `coveredBy` naming all three real manual specs — the evidence→map linkage working live for the first time since M7b. See backlog §F and findings doc §20.

**B17 is done (2026-07-13)** — `MapElement.id` collisions eliminated: extraction-time content dedup with a new `MapElement.count` field (`explorer/extract/dedup.ts`, both extraction paths) plus occurrence-discriminated ids in `buildMap`, schema 1.6 → 1.7, three commits (`c17bdcc`, `8a5cabf`+`60e7c61`, `0e4057f` — the last closing audit finding F7). Live re-crawl (commit `b8dfbdf`): 165-page map, 4,222 element rows (down from 4,809), **4,222/4,222 unique ids — zero duplicates**, 484 rows carry `count > 1`; `pnpm plan --update` 5/165 covered (no coverage regression), all suites green. See backlog §B and findings doc §21. **With B17 done, both ⚠ schema/contract-affecting audit items (B17 = F1, F18 = F5) are now closed.**

**F3 is done (2026-07-14)** — the audit's Order-2 item. The crawler now dedups the resolved path *early* (right after `acceptConsent`, before the settle wait + aria extraction + `enrichTestIds`), via a pure unit-tested `isDuplicateResolution` helper, with the existing late check kept as a safeguard for the rare URL-changed-during-settle case. Direct-TDD, output-identical, no live re-crawl. See audit doc §2/§3 F3.

**Phase 6 is done, v1 (2026-07-14, same day)** — the Risk Analysis Agent, implemented autonomously under Jorge's /goal directive (full cycle on Fable 5 per his explicit instruction — see decision log D1). New `analyzer/` sub-project (`pnpm analyze`): Failure Analyzer (classifies `reports/results.json` failures — 7-category signature taxonomy + flaky/persistent + coveredBy flow linkage) and diff risk-scoring (`--risk <baseline>`: 7 deterministic signals over the explorer's `MapDiff`, banded high/med/low, explainable reasons; failure history feeds the score). 34 new unit tests (297/297 total), typecheck/lint clean, phases-0-5 e2e gate run live: 4/4 no retries. Zero touches to existing behavior (wiring additive only). Design doc + decision log delivered; **exit gate CLOSED same-day — Jorge reviewed and approved the decision log (2026-07-14), resolving D1 as a policy change (model routing neutralized to Fable 5 until Phase 9 completes; CLAUDE.md updated). Phase 7 is unblocked.** Remaining known gap: the risk CLI needs a caller-supplied baseline map (no automatic baseline snapshotting) — a deliberate v1 scope line, candidate for the CI diff-gate integration later.

**Next: decide the next milestone** — check [`2026-07-02-backlog.md`](./2026-07-02-backlog.md) for candidates. **No ⚠ schema/contract-affecting item remains, and F3 (the smallest quick win) is now done**, so nothing auto-recommends. Per the audit's own §3 sequencing table, **F8** is the next item (centralize the act→verify→retry idiom hand-rolled seven times) but it is ⚠-rated — "intent-preserving, but touches every live-validated interaction path... mandates a full live re-validation pass; human call on whether the consolidation is worth it now" — so it is a candidate, not a default. Lower-priority: C11 runner reachability, C13 flaky-tagging, D15 checkout/payment; plus two Minors (no `tests/generated/` pruning — audit F10; a plan-wording nit). The larger open direction is advancing to **Phase 6** (Failure Analyzer / Risk Analysis Agent). Confirm with Jorge before starting new brainstorm/spec work, per the working agreement.

See [`2026-07-02-backlog.md`](./2026-07-02-backlog.md) for the full list of lower-priority open items.

---

## 1. The original roadmap (reconstructed, and continued — not replaced)

The foundation spec (§11) states the intended sequence explicitly:

> **Phase 0 (Foundation)** → **Explorer Agent** → **Coverage + Test Generator** → **Builder Engine** → **Failure Analyzer + Selector Healing** → **Reporting/Dashboard** — coverage measured by user journeys / business processes, never by code lines or test counts.

That sequence maps 1:1 onto the 10-phase agentic evolution below. No redesign is needed; this document continues the existing plan.

| Phase | Capability | Original sub-project | Status (2026-07-02, updated) |
|---|---|---|---|
| 0 | Professional automation framework | Phase 0 foundation (POM/COM, fixtures, multi-env config, CI) | ✅ Done, live-validated against DES; interaction reliability hardened (act→verify→retry, M1) |
| 1 | Application discovery | Explorer Agent | ✅ **Closed**, deepened by M8. Aria-tree extraction (M2) + first live crawl (M2c): 150 unique pages, 2414 real elements, 0 errors. M8 adds interaction-based discovery: the crawler now opens overlays/dialogs, capturing knowledge (e.g. the PDP size selector) invisible to passive crawling |
| 2 | Persistent functional knowledge | Versioned `coverage/functional-map.json` + differ | ✅ Canonical map committed and diffable (schema 1.1, multi-step flows); CI diff gate wired (M3, scheduled/non-blocking) |
| 3 | Knowledge Graph | Evolution of the map schema — pages/components/elements/flows are already relational via stable IDs | ✅ Coverage annotations landed (M5b, schema 1.2): flows now carry `coveredBy` from real run evidence — the first run-result→map linkage (seed of Phase 8). Plain JSON + stable IDs suffices through Phase 4; no graph DB before it earns its keep |
| 4 | Planning Agent | Coverage + Test Generator agents | ✅ **Implemented and live-validated (M5b).** `pnpm plan`: evidence-based `coveredBy` + ranked proposals. Caveat: proposal quality is bounded by map completeness (findings §9) — the PLP-grid gap keeps the high-value journeys out of the map |
| 5 | Execution Agent | Builder Engine | ✅ **v1 implemented and live-validated (M6b, hardened M7, B14).** `pnpm build-tests` generates navigation specs + minimal page objects imitating BasePage/locate(); real, page-specific loaded-signals now win in every case — testId first (M7), and page-specific role/label over shared chrome as fallback (B14), now also excluding M8's interaction-revealed elements. Interaction specs remain future work — M8 supplies the map knowledge (`interactions[]`) they'd consume, but generating them is still unimplemented |
| 6 | Risk Analysis Agent | Failure Analyzer (+ risk-scoring of map diffs) | ✅ **v1 implemented (2026-07-14).** `pnpm analyze` (new `analyzer/` sub-project): the Failure Analyzer consumes `reports/results.json` (the day-one seam, first consumer ever) and classifies failures into a 7-category taxonomy anchored to real observed signatures, with flaky/persistent from retry data and coveredBy-linkage to map flows; `--risk <baseline>` scores map diffs (7 deterministic signals, explainable reasons). Design: `docs/superpowers/specs/2026-07-14-phase6-risk-analysis-design.md`; decision log: `docs/superpowers/notes/2026-07-14-phase6-decision-log.md` |
| 7 | Self-Healing | Selector Healing Agent | ⬜ `Strategy`/`selectorHints` + per-element testId-presence recording exist as its seam. **M7 shipped this seam's data:** `TestIdHint`'s attribute provenance (which of `data-testid`/`data-qa-anchor`/`data-qa` matched) is exactly the input this agent will need to heal broken selectors |
| 8 | Continuous Learning | Feed run results and diffs back into the functional map | ⬜ |
| 9 | Autonomous Quality Engineering | Orchestration of phases 4–8 | ⬜ First registered candidate: B-NL1 (NL instruction interface over Planner/Builder — backlog §E) |

**Current position: Phase 6 reached (v1).** The Risk Analysis Agent closes the discovery → planning → generation → **analysis** loop: failures now classify themselves against the map's own flows, and map drift now carries a ranked, explainable risk signal. Phases 7 (Self-Healing) and 8 (Continuous Learning) both have their input seams ready — testId attribute provenance (M7) plus the failure report's per-category selector-drift records for Phase 7; the evidence→map linkage (F18) plus `affectedFlowIds` for Phase 8.

*(Previous position note, kept for history:)* **Phase 5 reached (v1, navigation-only), hardened.** The Explorer has real, verified, multi-step knowledge of DES; the Coverage Planner closes the loop deterministically; the Builder Engine turns proposals into live-passing generated specs whose assertions now rest on trustworthy, page-specific selectors in every case — testId first (M7), and page-specific role/label over shared chrome as fallback (B14). The chain from discovery → planning → generation → resolution is proven end-to-end for navigation journeys, with the selector-resolution layer itself hardened for whatever consumes it next (including the future Selector Healing agent, Phase 7). See "Where a fresh session resumes" above for what's next.

---

## 2. How each existing module evolves toward the platform

- **Explorer → the Knowledge Engine.** Near-term: accessibility-tree-driven extraction (works where `page.content()` cannot), onboarding-tour suppression in the crawler, an `errors[]` artifact section, first committed canonical map. Mid-term: multi-step flow synthesis (Home→Search→PLP→PDP→Cart, done M4), interaction-based discovery (open nav menus/overlays, done M8), per-page state capture for later agents.
- **Functional map → the Knowledge Graph.** Schema v1.0 is already relational (stable IDs cross-referencing pages/components/elements/flows). Evolve additively with `schemaVersion` bump discipline: richer flows, coverage annotations (`coveredBy: [spec ids]`), risk/priority signals derived from diffs.
- **POM/COM + fixtures → the Execution Engine's target language.** The Builder Engine will generate code imitating `BasePage`/`BaseComponent` and the `locate()` strategy. Keep the contracts boring and uniform — every irregularity added now is a special case a generator must learn later. Long-term (Phase 9, B-NL1): a natural-language instruction layer will resolve user intent against `MapFlow.name`/`type` and inject a specific flowId at the Builder's `selectJourneys()` selection point, bypassing (not replacing) the ranking for that one request.
- **`src/support/locators.ts` (`Strategy`) → the Self-Healing seam.** Healing = swapping strategies when selectors break, informed by the map's `selectorHints` and testId-presence data.
- **JSON reporter output (`reports/results.json`) → the Failure Analyzer / Reporting seam.** Deliberately emitted since day one; nothing consumes it yet, by design.
- **Config** grows per-agent sections following the `loadExplorerConfig` pattern (defaults + env + explicit overrides, fail-fast validation).
- **CI/CD** gains stages progressively: Explorer diff gate (`explore --diff --fail-on-new`, Phase 2), generated-test execution (Phase 5), risk reports (Phase 6).
- **Docs** keep the working `docs/superpowers/{specs,plans,notes}` cycle per sub-project; this `docs/roadmap/` area holds the platform-level view.

---

## 3. Milestone sequence (near-term, in order)

| Milestone | Content | Phase gate | North Star |
|---|---|---|---|
| **M0** ✅ | Platform roadmap + backlog committed as versioned docs | — | Knowledge, Engineering Excellence |
| **M1** ✅ | Stabilized `search-plp-pdp.spec` / `add-to-cart.spec`: act→verify→retry on every state-changing DES interaction, `workers: 1`, `retries: 1` | Reliably green suite = precondition for everything agentic | Engineering Excellence |
| **M2** ✅ | Explorer DES-readiness: aria-tree extraction, crawler tour suppression + time budget, `errors[]` artifact; **first live crawl** → committed `coverage/functional-map.json` (150 pages, 2414 elements) | Closed Phase 1, opened Phase 2 | Knowledge |
| **M3** ✅ | CI Explorer gate: `explore` stage in `.gitlab-ci.yml` running `pnpm explore --diff --fail-on-new` — **scheduled-only, non-blocking** (`allow_failure: true`) by deliberate choice, since the map is still bounded/incomplete (B8 flow synthesis, PLP-grid gap). **Manual step outstanding:** a GitLab CI/CD Schedule must be created in the project (Settings → CI/CD → Schedules) for the job to ever run — not doable from this environment. Runner reachability to `*.inditex.grp` still unverified (C11) | New-flow detection runs without a human, once scheduled | Autonomy |
| **M4** ✅ | Flow synthesis: `MapFlow.steps` now carries real root→leaf navigation chains reconstructed from `discoveredVia` (schema 1.1; canonical map refreshed live: 152 flows, 74 multi-step). Coverage annotations deliberately deferred to M5, where they belong | Phase 2 → 3 | Knowledge |
| **M5** ✅ | Coverage Planner (Planning Agent): `pnpm plan` annotates flows with evidence-based `coveredBy` (schema 1.2) and ranks uncovered flows into proposals. Live-validated 2026-07-03: 3/152 flows covered by the 3-spec suite; first annotated map committed. Coverage usefulness bounded by map completeness (findings §9) | Phase 4 | Reasoning |
| **M6/M6b** ✅ | Builder Engine (Execution Agent) v1: `pnpm build-tests` generates navigation specs + minimal page objects from the planner's proposals, imitating the POM/COM contracts. Live-validated 2026-07-03: 3/3 generated specs pass against DES. Surfaced and worked around a real testId/`locate()` gap (backlog B15) | Phase 5 | Autonomy |
| **M7** ✅ | TestId attribute-provenance fix (closes B15): `TestIdHint { attr, value }` records which of `data-testid`/`data-qa-anchor`/`data-qa` matched; `locate()` resolves each correctly; Builder's testId priority restored. Live-validated 2026-07-03: 2,508 elements now carry provenance, 3/3 regenerated specs pass using real page-specific testIds, full manual suite unaffected (no regression). Partially closes B14 | Phase 5, Phase 7 seam | Engineering Excellence |
| **M7b** ✅ | B13 classifier fix: deterministic path rules (PDP `-c0p{id}.html`, Cart `shop-cart.html`) before text signals; Checkout requires a path hint. Live-validated 2026-07-04: full re-crawl, all `-c0p` → PDP, zero fake Checkout labels, planner ranking decontaminated | Phase 2 knowledge quality | Knowledge |
| **B14** ✅ | Shared-element deprioritization: extraction paths tag Header/Footer/MiniCart component provenance on elements (schema 1.4); Builder's `loadedSignalFor` runs pass-major (page-specific candidates across all selector tiers before falling back to shared chrome). Closes the scope M7 left open. Live-validated 2026-07-04: full re-crawl (152 pages), 17/17 generated specs pass, including a no-testId leaf page that now asserts a page-specific signal instead of generic header chrome | Phase 5 signal quality | Engineering Excellence |
| **M8** ✅ | Interaction-aware crawl: the crawler opens a bounded, deduped set of overlays/dialogs during the crawl (`explorer/crawl/interact.ts`); schema 1.4→1.5 adds `interactions[]` + `revealedBy`; Builder excludes revealed elements from loaded-signal selection. Closes backlog B9's "nav menus/overlays opened during crawl" row. Live-validated 2026-07-05: the "Añadir a la cesta → Tallas dialog" mechanism fired twice across two full crawls (size-selector knowledge invisible to passive crawling, §10), though not in the crawl chosen for the committed canonical map (M9 prerequisite); neither crawl's discovery order reached a literal PDP page (pre-existing crawl-order variability, §9/§12/§13, not an M8 defect). `pnpm test` 4/4, `pnpm test:generated` 20/20 | Phase 1/2 knowledge depth | Knowledge |
| **M8b** ✅ | Deterministic must-capture interactions: `interactions.mustCapture` config gives matching trigger labels priority in a two-pass `selectCandidates`, retried across pages until satisfied once per crawl (`InteractionLedger` equivalence-class + satisfaction bookkeeping); category-PLPs collapsed into one ledger scope; ledger made per-crawl-global. No schema change. Closes the M9 prerequisite left open by M8. Live-validated 2026-07-05: a 32-page probe and the full 149-page re-crawl both captured "Añadir a la cesta" → Tallas; the **committed canonical map now contains the capture**, verified directly. Surfaced two new, unrelated, out-of-scope findings (A5/B16) during no-regression checks | Phase 1/2 knowledge depth, Phase 5 seam for M9 | Knowledge, Autonomy |
| **M9** ✅ | Builder interaction-spec generation: `selectInteractionJourneys`/`unsatisfiedMustCapture` (map-only, shares must-capture config with the crawler) + `TemplateGenerator.generateInteraction` (open→verify→close, act→verify→retry) + CLI wiring. Same milestone closes **B16** (non-unique testId excluded from loaded-signal selection, deprioritize not exclude). Live-validated 2026-07-06: found and fixed a genuine live bug (persistent DES chrome dialog broke a bare `getByRole('dialog')` overlay-open signal; fixed with a baseline dialog-count diff mirroring M8's own crawler idiom). After the fix: `pnpm test:generated` 5/5 no retries (interaction spec opens/verifies/closes Tallas live), B16 confirmed fixed live, `pnpm test` 3/4 (A5 confirmed unrelated) | Phase 5 (Builder consumes interaction knowledge), Engineering Excellence (B16) | Autonomy, Engineering Excellence |

Rules of engagement (unchanged from the repo's working method):

1. Each sub-project gets its own **spec → plan → implement** cycle under `docs/superpowers/`.
2. Never implement everything at once; milestones stay small and independently verifiable.
3. Anything requiring live DES access is validated live (see `docs/superpowers/notes/`) before being declared done.
4. No shortcut that makes a later agentic capability harder to implement (e.g., irregular POM contracts, non-deterministic IDs, hardcoded URLs).
