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

## Where a fresh session resumes (2026-07-04)

**M7b is done** — the Checkout/PDP classifier fix closes B13: `RuleClassifier` now evaluates deterministic path rules (`-c0p{id}.html` → PDP, `shop-cart.html`/`/cart`/`/cesta` → Cart) before text-signal rules, and the Checkout text rule additionally requires a path hint. Live-validated 2026-07-04: full re-crawl (151 pages, both sessions) — all 17 `-c0p` pages → PDP, zero fake `Checkout` labels, `shop-cart.html` → Cart in both sessions, no label regressions vs. the previous map; `pnpm test` 4/4, `pnpm plan --update` re-annotated cleanly (schema 1.3, 0 `Checkout` flows) — findings doc §13.

**Next: decide the next milestone** — candidates in rough priority order: B14 (Builder's loaded-signal quality, now narrower — only pages with no testId-bearing element at all), or M8 (interaction-aware map knowledge, needed before the Builder can generate anything beyond navigation specs). Confirm with Jorge before starting new brainstorm/spec work, per the working agreement.

See [`2026-07-02-backlog.md`](./2026-07-02-backlog.md) for the full list of lower-priority open items.

---

## 1. The original roadmap (reconstructed, and continued — not replaced)

The foundation spec (§11) states the intended sequence explicitly:

> **Phase 0 (Foundation)** → **Explorer Agent** → **Coverage + Test Generator** → **Builder Engine** → **Failure Analyzer + Selector Healing** → **Reporting/Dashboard** — coverage measured by user journeys / business processes, never by code lines or test counts.

That sequence maps 1:1 onto the 10-phase agentic evolution below. No redesign is needed; this document continues the existing plan.

| Phase | Capability | Original sub-project | Status (2026-07-02, updated) |
|---|---|---|---|
| 0 | Professional automation framework | Phase 0 foundation (POM/COM, fixtures, multi-env config, CI) | ✅ Done, live-validated against DES; interaction reliability hardened (act→verify→retry, M1) |
| 1 | Application discovery | Explorer Agent | ✅ **Closed.** Aria-tree extraction (M2) + first live crawl (M2c): 150 unique pages, 2414 real elements, 0 errors |
| 2 | Persistent functional knowledge | Versioned `coverage/functional-map.json` + differ | ✅ Canonical map committed and diffable (schema 1.1, multi-step flows); CI diff gate wired (M3, scheduled/non-blocking) |
| 3 | Knowledge Graph | Evolution of the map schema — pages/components/elements/flows are already relational via stable IDs | ✅ Coverage annotations landed (M5b, schema 1.2): flows now carry `coveredBy` from real run evidence — the first run-result→map linkage (seed of Phase 8). Plain JSON + stable IDs suffices through Phase 4; no graph DB before it earns its keep |
| 4 | Planning Agent | Coverage + Test Generator agents | ✅ **Implemented and live-validated (M5b).** `pnpm plan`: evidence-based `coveredBy` + ranked proposals. Caveat: proposal quality is bounded by map completeness (findings §9) — the PLP-grid gap keeps the high-value journeys out of the map |
| 5 | Execution Agent | Builder Engine | ✅ **v1 implemented and live-validated (M6b, hardened M7).** `pnpm build-tests` generates navigation specs + minimal page objects imitating BasePage/locate(); 3/3 pass live against DES using real, page-specific testId signals (M7). Interaction specs remain future work (needs B9's interaction-aware map knowledge) |
| 6 | Risk Analysis Agent | Failure Analyzer (+ risk-scoring of map diffs) | ⬜ Traces/videos/JSON results are already captured by default as its inputs |
| 7 | Self-Healing | Selector Healing Agent | ⬜ `Strategy`/`selectorHints` + per-element testId-presence recording exist as its seam. **M7 shipped this seam's data:** `TestIdHint`'s attribute provenance (which of `data-testid`/`data-qa-anchor`/`data-qa` matched) is exactly the input this agent will need to heal broken selectors |
| 8 | Continuous Learning | Feed run results and diffs back into the functional map | ⬜ |
| 9 | Autonomous Quality Engineering | Orchestration of phases 4–8 | ⬜ |

**Current position: Phase 5 reached (v1, navigation-only), hardened.** The Explorer has real, verified, multi-step knowledge of DES; the Coverage Planner closes the loop deterministically; the Builder Engine turns proposals into live-passing generated specs whose assertions now rest on trustworthy, page-specific testId selectors (M7). The chain from discovery → planning → generation → resolution is proven end-to-end for navigation journeys, with the selector-resolution layer itself hardened for whatever consumes it next (including the future Selector Healing agent, Phase 7). See "Where a fresh session resumes" above for what's next.

---

## 2. How each existing module evolves toward the platform

- **Explorer → the Knowledge Engine.** Near-term: accessibility-tree-driven extraction (works where `page.content()` cannot), onboarding-tour suppression in the crawler, an `errors[]` artifact section, first committed canonical map. Mid-term: multi-step flow synthesis (Home→Search→PLP→PDP→Cart), interaction-based discovery (open nav menus/overlays), per-page state capture for later agents.
- **Functional map → the Knowledge Graph.** Schema v1.0 is already relational (stable IDs cross-referencing pages/components/elements/flows). Evolve additively with `schemaVersion` bump discipline: richer flows, coverage annotations (`coveredBy: [spec ids]`), risk/priority signals derived from diffs.
- **POM/COM + fixtures → the Execution Engine's target language.** The Builder Engine will generate code imitating `BasePage`/`BaseComponent` and the `locate()` strategy. Keep the contracts boring and uniform — every irregularity added now is a special case a generator must learn later.
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

Rules of engagement (unchanged from the repo's working method):

1. Each sub-project gets its own **spec → plan → implement** cycle under `docs/superpowers/`.
2. Never implement everything at once; milestones stay small and independently verifiable.
3. Anything requiring live DES access is validated live (see `docs/superpowers/notes/`) before being declared done.
4. No shortcut that makes a later agentic capability harder to implement (e.g., irregular POM contracts, non-deterministic IDs, hardcoded URLs).
