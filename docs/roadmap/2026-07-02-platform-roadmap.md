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

## 1. The original roadmap (reconstructed, and continued — not replaced)

The foundation spec (§11) states the intended sequence explicitly:

> **Phase 0 (Foundation)** → **Explorer Agent** → **Coverage + Test Generator** → **Builder Engine** → **Failure Analyzer + Selector Healing** → **Reporting/Dashboard** — coverage measured by user journeys / business processes, never by code lines or test counts.

That sequence maps 1:1 onto the 10-phase agentic evolution below. No redesign is needed; this document continues the existing plan.

| Phase | Capability | Original sub-project | Status (2026-07-02) |
|---|---|---|---|
| 0 | Professional automation framework | Phase 0 foundation (POM/COM, fixtures, multi-env config, CI) | ✅ Done, live-validated against DES (one stabilization item, backlog A1) |
| 1 | Application discovery | Explorer Agent | 🔶 Built + unit-tested (76 tests); **live discovery blocked** — extraction is light-DOM only and DES is shadow-DOM (`bds-`) (backlog B5) |
| 2 | Persistent functional knowledge | Versioned `coverage/functional-map.json` + differ | 🔶 Machinery complete; **no canonical map has ever been produced** (backlog B7); flows are single-page (B8) |
| 3 | Knowledge Graph | Evolution of the map schema — pages/components/elements/flows are already relational via stable IDs | ⬜ Multi-step flow synthesis, coverage annotations, run-result linkage. Plain JSON + stable IDs suffices through Phase 4; no graph DB before it earns its keep |
| 4 | Planning Agent | Coverage + Test Generator agents | ⬜ Consumes flows + priorities from the map; proposes what to validate |
| 5 | Execution Agent | Builder Engine | ⬜ Generates specs that imitate the POM/COM contracts exactly — the contracts' regularity was designed for this |
| 6 | Risk Analysis Agent | Failure Analyzer (+ risk-scoring of map diffs) | ⬜ Traces/videos/JSON results are already captured by default as its inputs |
| 7 | Self-Healing | Selector Healing Agent | ⬜ `Strategy`/`selectorHints` + per-element testId-presence recording exist as its seam |
| 8 | Continuous Learning | Feed run results and diffs back into the functional map | ⬜ |
| 9 | Autonomous Quality Engineering | Orchestration of phases 4–8 | ⬜ |

**Current position: end of Phase 0 / mid-Phase 1.** The single most valuable next step is making the Explorer actually *see* DES (shadow-DOM-aware extraction) and committing the first canonical map — the moment the platform first has persistent knowledge.

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
| **M0** ✅ (this commit) | Platform roadmap + backlog committed as versioned docs | — | Knowledge, Engineering Excellence |
| **M1** | Stabilize `search-plp-pdp.spec` / `add-to-cart.spec`: explicit expect timeouts sized to the measured ~5s results-grid hydration (findings §7); verify with repeated full live runs | Reliably green suite = precondition for everything agentic | Engineering Excellence |
| **M2** | Explorer DES-readiness (own spec→plan cycle): a11y-tree/ariaSnapshot extraction alongside the linkedom analyzer, `suppressOnboardingTour` in the crawler, `errors[]` artifact; then the **first live crawl** → commit `coverage/functional-map.json` | Completes Phase 1, opens Phase 2 | Knowledge |
| **M3** | CI Explorer gate: `pnpm explore --diff --fail-on-new` stage; verify runner reachability to `*.inditex.grp` | New-flow detection runs without a human | Autonomy |
| **M4** | Flow synthesis + map enrichment: multi-step journeys, coverage annotations | Phase 2 → 3 | Knowledge |
| **M5** | Coverage + Test Generator spec (Planning Agent): consumes flows/priorities; coverage measured by user journeys | Phase 4 | Reasoning |
| **M6** | Builder Engine spec (Execution Agent): generates specs imitating the POM/COM contracts | Phase 5 | Autonomy |

Rules of engagement (unchanged from the repo's working method):

1. Each sub-project gets its own **spec → plan → implement** cycle under `docs/superpowers/`.
2. Never implement everything at once; milestones stay small and independently verifiable.
3. Anything requiring live DES access is validated live (see `docs/superpowers/notes/`) before being declared done.
4. No shortcut that makes a later agentic capability harder to implement (e.g., irregular POM contracts, non-deterministic IDs, hardcoded URLs).
