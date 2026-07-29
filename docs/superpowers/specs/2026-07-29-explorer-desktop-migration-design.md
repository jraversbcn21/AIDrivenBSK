# Explorer desktop migration — design (2026-07-29)

## Problem

Findings §24: DES decides mobile/desktop layout server-side via the `?device=desktop` query
param (no cookie, no persistence). The team's QA standard is desktop; `BasePage.goto()` now
forces the param for the suite — but the Explorer bypasses `BasePage` and navigates raw, so
the committed canonical map (154 pages, schema 1.7) is **mobile-layout knowledge**: element
inventories, testId uniqueness (`count`), and captured interactions describe a DOM the team
does not test. Evidence it hurts: `bombacho-barrel.spec.ts` (a promoted Builder draft) failed
on desktop because its map-derived testId was unique on mobile but 4× on desktop.

## Decision

Append the param at **navigation time only**, at the crawler's two raw `page.goto()` sites.
Map paths stay param-free **by construction**: `normalizePath()` keeps `pathname` only, and
every recorded path (`meta.path`, `discoveredVia`, frontier dedup keys, `routePattern`)
derives from it — nothing else to sanitize.

1. **`explorer/url.ts`** — pure helper `withDevice(path, device)`: appends `device=<value>`
   (`?`/`&`-aware), identity when `device === ''`.
2. **`explorer/config.ts`** — `device: string` on `ExplorerConfig`, default `'desktop'`
   (matches the team standard and `BasePage`'s unconditional behavior). Env override
   `EXPLORER_DEVICE`: unset → default; empty string → disables (server default = mobile;
   same "empty disables" idiom as `EXPLORER_MUST_CAPTURE`); validated `/^[a-z0-9_-]*$/i`.
3. **`explorer/crawl/crawler.ts`** — `CrawlDeps.device: string`; the main visit
   (`page.goto(item.path)`) and the interaction driver's `recover()` wrap their path in
   `withDevice`. No other raw navigations exist (grepped; `primeCart` uses `src/` page
   objects → already desktop via `BasePage.goto()`).
4. **`explorer/cli.ts`** — pass `device: cfg.device` into deps.

No schema change. The map's shape is untouched; only the layout the crawler *sees* changes.

## Known risk to verify live (NOT guessed)

`acceptConsent`'s gender-gate click and DES's `/es/` → `/es/h-woman.html` resolution happen
*after* our param-carrying `goto`. If either is a full server navigation/redirect that drops
the query param, the resolved page renders MOBILE and is extracted as such. Verification: a
bounded probe crawl, then fingerprint the report — the mobile nav drawer (dialog "Categorías
y productos", findings §17/§24) exists only on mobile; `searchBtn` testId count is 1 on
mobile vs 4 on desktop. If leakage shows up, the fix is a re-`goto(withDevice(resolvedPath))`
when `resolvedPath !== item.path` — deferred unless the probe proves it necessary.

Second risk, accepted: the settle profiles (`DEFAULT_SETTLE`, `CHECKOUT_SETTLE`) were
measured on mobile hydration. The settle is condition-based with a floor, so a different
desktop profile degrades to "waits the floor, polls until stable" — the probe's page yield
will show if the ceiling needs retuning; don't retune blindly (§10 doctrine).

## Validation plan

1. Offline: unit tests for `withDevice` + `EXPLORER_DEVICE` parsing; typecheck/lint.
2. Bounded probe crawl (no `--update`, `EXPLORER_MAX_PAGES≈6`, anon): fingerprint check
   (drawer absent / searchBtn multiplicity) against the mobile map's same pages.
3. Full re-crawl `pnpm explore --update` (150 pages/session, `EXPLORER_TIME_BUDGET_MS=1200000`,
   ~35-40 min) → map guardrails (B17 zero duplicate ids, non-zero pages, schema 1.7).
4. `pnpm test` (order matters: fresh `route-evidence.json`) → `pnpm plan --update` →
   coverage non-zero (F18 guardrail). Builder smoke: `pnpm build-tests --top 3` +
   `pnpm test:generated` — the payoff check: drafts generated from the desktop map must
   pass against desktop DES.
5. Docs: findings §24 completion note; CLAUDE.md `pnpm explore` line gains `EXPLORER_DEVICE`.
