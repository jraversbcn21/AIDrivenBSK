# Explorer DES-Readiness Design (a11y-tree extraction)

**Date:** 2026-07-02
**Status:** Approved (design)
**Scope:** Milestone M2 of the platform roadmap (`docs/roadmap/2026-07-02-platform-roadmap.md`) — make the Explorer able to actually see DES. Covers backlog items B5 (shadow-DOM-blind extraction, CRITICAL), B6 (crawler tour suppression), B9-partial (errors[] artifact, crawl time budget), B10 (.env.example). The first live crawl and canonical-map commit (B7) is the M2c exit criterion.

---

## Context

The Explorer pipeline (crawl → extract → classify → map → diff) is built and unit-tested, but its extractor feeds `page.content()` (light DOM) to a linkedom analyzer. DES renders through `bds-` shadow-DOM web components, so a live crawl would see almost none of the interactive content (findings doc §8). Playwright's accessibility-tree APIs and locators *do* pierce open shadow DOM — the foundation's POM/COM works this way — so extraction must move to that channel.

### Verified facts this design rests on

- **Installed Playwright is 1.61** (`locator.ariaSnapshot()` available since 1.49; CI image is v1.61.0-jammy).
- **`ariaSnapshot()` output format** (probed offline against a synthetic page, 2026-07-02): indented YAML-like lines, `- role "name"` with children two spaces deeper; links carry a `- /url: <href>` child; plain text appears as `- text: …`; landmarks come out as `banner`, `navigation`, `main`, `contentinfo`, `form "label"`, `dialog "label"`, `searchbox`, `textbox`, `button`, `list`/`listitem`.
- **What the a11y tree does NOT expose:** `data-testid`-style attributes, input `name`/`type`/`required`. Those need focused locator probes (Playwright CSS pierces open shadow roots).
- **DES has test-id-like attributes on at least some elements** — `data-qa-anchor="filterButton"` confirmed live (findings §7, 2026-07-02) — so recording testId presence (foundation Risk #1) is worthwhile.
- The `bsk_onboarding` cookie must be pre-seeded before first navigation or the driver.js tour intercepts the crawl (findings §7); the crawler currently never does this (it bypasses `BasePage.goto()`).

---

## Decisions

1. **Aria snapshot is the backbone of live extraction.** One `page.locator('body').ariaSnapshot()` call per page → parsed into a node tree → mapped to the existing `PageExtraction` type. The downstream contract (`PageExtraction`, classifier context, map builder, differ, stable IDs) does not change.
2. **Focused locator probes supplement DOM-only facts:**
   - **testId enrichment:** for a bounded number of extracted interactive elements (cap 40/page), probe `data-testid` / `data-qa-anchor` / `data-qa` via `getByRole(role, { name, exact: true })` + `getAttribute`. Best-effort: ambiguity or timeout ⇒ no hint recorded.
   - **Forms:** field facts come from the aria tree only — `ExtractedFormField.name` = accessible label, `.type` = aria role, `.required` = `false` (unknown). `purposeHint` inferred from the form's accessible name + field labels (e-mail + contraseña/password ⇒ login, etc.). A DOM-level form probe is deliberately out of scope (YAGNI until a consumer needs `required`).
3. **The linkedom/`page.content()` path stays** for offline unit tests and as an escape hatch: `EXPLORER_EXTRACTION=aria|dom` (default `aria`), validated like `EXPLORER_MODE`.
4. **Crawler fixes:** call `suppressOnboardingTour(page)` before the first navigation of each session; add a wall-clock **time budget** (`EXPLORER_TIME_BUDGET_MS`, default 10 min) checked in the frontier loop.
5. **Errors leave the map:** `crawlSession` returns `{ extractions, errors }` (`CrawlError = { path, session, depth, discoveredVia, message }`) instead of synthesizing fake `ERROR:`-titled pages. The per-run artifact (`reports/explorer/<ts>.json`, gitignored) becomes `{ map, errors }`; the canonical map (`coverage/functional-map.json`) stays a pure `FunctionalMap`, so existing diff/update semantics are untouched.
6. **Docs:** `.env.example` documents `EXPLORER_MODE`, `EXPLORER_MAX_PAGES`, `EXPLORER_TIME_BUDGET_MS`, `EXPLORER_EXTRACTION`, `EXPLORER_ALLOW_PROD`, `ANTHROPIC_API_KEY`; README's Explorer section mentions the extraction modes.

## M2c — first live crawl (protocol, executed after implementation)

1. VPN + `.env` as for e2e runs. Start bounded: `EXPLORER_MAX_PAGES=25 pnpm explore --session anon`.
2. Review the artifact: are `bds-` contents visible (elements per page ≫ 0)? Do PDP pages match `-c0p{id}.html` route patterns? Does path lowercasing break any real route (B9 note)?
3. Capture 2–3 real DES aria snapshots into `explorer/__fixtures__/` (gitignored candidates reviewed first for PII/secrets) to replace synthetic fixtures over time.
4. Run `--session both`, review, then `pnpm explore --update` and commit the first canonical map (closes B7, exits Phase 1).
5. Record findings (element counts, testId coverage stats, surprises) in the findings doc.

## Non-goals (tracked elsewhere)

- Multi-step flow synthesis (M4 / backlog B8).
- CI gate (M3 / C12), LLM live smoke test, nav-menu/overlay interaction during crawl (B9).
- Any change to POM/COM or specs.

## Risks

- **Aria snapshot volume** on heavy DES pages (thousands of nodes): parser must be linear-time; extraction caps (elements per page) keep the map bounded.
- **Accessible-name-based testId probing is fuzzy** (strict-mode ambiguity): accepted — hints are best-effort by design; absence is itself signal for Risk #1.
- **DES service flakiness** (dead loads, degraded shells — findings §7): per-page errors are recorded, crawl continues; the time budget bounds a bad day.
