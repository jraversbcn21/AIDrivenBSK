# Explorer Agent Design

**Date:** 2026-06-17
**Status:** Approved (design)
**Scope:** The Explorer Agent — the second sub-project of the Bershka agentic QA platform. Builds on the Phase 0 framework foundation (already merged to `master`).

---

## Context

The Explorer Agent autonomously navigates Bershka (DES), discovers pages and interactive elements (buttons, forms, filters, modals, reusable components), classifies them, and emits a **versioned functional-map JSON** that the later Coverage and Test Generator agents consume. Re-running it and diffing against the committed map surfaces **new / changed / removed** flows, directly serving platform goal #2 ("detect new functionalities").

It is one cohesive sub-project (crawl → extract → classify → build map → diff), so a single spec → plan → implement cycle fits.

### Decisions locked during brainstorming

- **Crawl mechanism:** Deterministic Playwright crawl as the backbone; LLM used *narrowly* for classification after extraction (not for navigation).
- **LLM provider:** Pluggable, provider-agnostic `Classifier` interface — ship one real adapter (Anthropic Claude) plus a deterministic no-LLM fallback; provider selected by config.
- **Crawl session:** Both an anonymous pass and an authenticated pass (reusing the foundation's `storageState`).
- **Run model:** A standalone CLI (`pnpm explore`) reusing the foundation's env/storageState, writing a single canonical JSON map committed to the repo; raw per-run artifacts go to gitignored `reports/`.
- **Safety:** Read-only crawl — never submit forms, never trigger transactional/destructive affordances, never target prod by default.

---

## 1. Location & reuse

- New source area: `explorer/`.
- Committed canonical map: `coverage/functional-map.json`.
- Gitignored per-run artifacts: `reports/explorer/<timestamp>.json`.

**Reuses the foundation (no duplication):**
- `src/config/env.ts` — `loadEnv()` for `BASE_URL`/`ENVIRONMENT` and fail-fast validation.
- `.auth/state.json` — reused for the authenticated pass.
- `src/support/consent.ts` — cookie/locale normalization.
- `src/support/locators.ts` — to emit `selectorHints` in the mandated priority order.

**Independent of the POM/COM** — the Explorer discovers elements that do not have Page Objects yet. The LLM client is a dependency used *only* by the LLM classifier adapter, lazy-loaded so rules-only/offline runs need no SDK or API key.

---

## 2. Units (each independently testable)

1. **Crawl engine** (`explorer/crawl/`) — bounded breadth-first crawler over a frontier of *states* (normalized URL + session). Seeds from a route list; follows in-app links and opens navigation menus. Bounded by: max-pages, max-depth, a **route allowlist**, a **denylist** (marketing/campaign/landing/promo), a politeness delay between requests, and a time budget. Dedups by normalized URL + route-pattern (won't crawl every individual product).
2. **Extractors** (`explorer/extract/`) — given a loaded page, deterministically extract links/navigation, buttons, forms (+fields), filters, sorting controls, modals/overlays, and candidate reusable components (Header/Footer/ProductCard/SearchBar/FiltersPanel/MiniCart) from role/DOM signals. Each returns typed records. Read-only guardrails are enforced here.
3. **Classifier** (`explorer/classify/`) — pluggable `Classifier` interface (see §5).
4. **Map builder** (`explorer/map/`) — assembles classified records into the functional-map tree + flat index with stable IDs; normalizes/dedups; produces canonical JSON.
5. **Differ** (`explorer/diff/`) — compares a fresh map against the committed canonical map → added/removed/changed report.
6. **CLI** (`explorer/cli.ts`) — orchestrates: load env, pick session(s), run crawl pass(es), classify, build map, write artifacts, optionally diff & update. Flags: `--session anon|auth|both`, `--classifier rules|llm|auto`, `--max-pages`, `--max-depth`, `--diff`, `--update`, `--fail-on-new`, `--out`.

---

## 3. Safety guardrails (read-only, non-negotiable)

Enforced in the extractors/crawl engine, not left to convention:
- **Never submit forms** — forms are described structurally (fields, types, inferred purpose), never filled+submitted.
- **Never click transactional/destructive affordances** — pay / place-order / delete / remove / confirm matched by role+name and excluded from interaction.
- **Overlays** opened only if non-destructive, then closed.
- **Default environment is DES** (and `local`); crawling defaults never target prod.
- **Politeness delay** between requests so DES is not hammered.

---

## 4. Functional-map schema (downstream contract)

`coverage/functional-map.json`:

```jsonc
{
  "schemaVersion": "1.0",
  "generatedAt": "<ISO-8601>",
  "environment": "des",
  "pages":      [{ "id", "path", "routePattern", "pageType", "session", "title", "discoveredVia" }],
  "components": [{ "id", "kind", "foundOnPages": [] }],
  "elements":   [{ "id", "pageId", "type", "label", "role", "selectorHints", "destructive": false }],
  "forms":      [{ "id", "pageId", "purpose", "fields": [{ "name", "type", "required" }] }],
  "flows":      [{ "id", "name", "type", "session", "priority", "steps": [] }]
}
```

Field notes:
- `pageType` ∈ Home | PLP | PDP | Cart | Checkout | Account | Wishlist | Search | Other.
- `session` ∈ anon | auth.
- `component.kind` ∈ Header | Footer | ProductCard | SearchBar | FiltersPanel | MiniCart | Other.
- `element.type` ∈ button | link | filter | sort | modal.
- `selectorHints` = `{ testId?, role?, label? }` in the foundation's priority order; records whether `data-testid` exists (feeds the future Builder + Selector-Healing agents, resolves foundation Risk #1).
- `form.purpose` ∈ login | register | search | newsletter | other (inferred; never submitted).
- `flow.priority` ∈ high | med | low, assigned by mapping discovered flows onto the critical-functionality list (Login/Wishlist/PLP/PDP/Cart/Checkout/Account = high; Filters/Sorting/Recommendations = med; Marketing/Landing = low).
- `flow.steps` reference `page.id`s.
- **Stable IDs** derived from normalized route + role + label hash, so re-runs produce identical IDs for identical things — making diffs meaningful.

---

## 5. Classifier adapters

One interface, config-selected:
- **`RuleClassifier`** (always-on baseline, fully offline): URL patterns + landmark roles + DOM signals → page type (e.g. size selector + add-to-cart ⇒ PDP; product grid + filters ⇒ PLP). Emits a confidence score.
- **`LlmClassifier`** (optional): Anthropic **Messages API**; model configurable via env, defaulting to a cheap/fast model (**Haiku 4.5**, `claude-haiku-4-5-20251001`); structured JSON output via tool-use. Receives a **trimmed page context** (URL, title, landmark roles, a short text/role summary — never full HTML, to bound tokens), not screenshots. Labels ambiguous flows/components.
- **Config modes:** `rules` (default), `llm` (rules fallback on error/no API key), `auto` (rules first, LLM only to disambiguate low-confidence cases — keeps cost low).
- Exact Messages API request shape (tool-use schema, token limits, model id/pricing) will be confirmed against the `claude-api` reference at implementation time.

---

## 6. Diff / new-feature detection (goal #2)

- `--diff` builds a fresh map and compares to the committed canonical map → report of **added / removed / changed** pages, flows, components, elements (by stable ID), with a human-readable summary.
- `--update` writes the fresh map as the new canonical (a reviewable git diff).
- `--fail-on-new` makes CI surface newly-discovered uncovered flows (non-zero exit).

---

## 7. Error handling

- Per-page failures are **recorded, not fatal** — an `errors[]` section in the gitignored per-run artifact; the crawl continues.
- Network/timeouts bounded by Playwright timeouts.
- LLM errors fall back to the rule classifier.
- Fail-fast only on config (reuse `loadEnv`) and an unreachable `BASE_URL`.

---

## 8. Testing

- **Unit (vitest, offline):** URL normalization/dedup, allow/deny route matching, destructive-affordance detection, `RuleClassifier` heuristics, map-builder ID stability, differ (added/removed/changed) — all from fixture inputs, no network.
- **Extractors** tested against **saved HTML fixtures** (representative captured Bershka page DOMs in `explorer/__fixtures__/`) so extraction logic is verifiable deterministically offline.
- **`LlmClassifier`** tested with a **mocked transport** (assert request shape + JSON parsing; no live API).
- **Deferred (same constraint as the foundation):** the live crawl against DES (needs VPN/credentials/browsers) and a thin live LLM smoke test (needs API key). The plan marks these deferred.

---

## 9. Risks / assumptions

1. **`data-testid` availability on DES** (carried from foundation) — recorded per element either way.
2. **HTML fixtures can go stale** vs the live site — they validate extractor *logic*, not current selectors; refreshed when the live crawl runs.
3. **Crawl completeness** — a bounded crawl may miss deep/JS-gated states; bounds are configurable and the diff surfaces gaps over time.
4. **LLM cost/nondeterminism** — contained by `auto` mode (rules-first), trimmed context, and the cheap model default.

---

## Non-goals for this sub-project

- No autonomous LLM-driven navigation (deterministic crawl only).
- No test generation, coverage scoring, or code generation (later agents).
- No writing/modifying Page Objects or tests.
- No dashboards/reporting UI.
- No crawling of production by default.
