# AIDriven Bershka QA — Framework Foundation (Phase 0)

Playwright + TypeScript test framework using Page Object / Component Object models with multi-environment config. Foundation for a later agentic QA platform.

## Setup
```bash
pnpm install
pnpm exec playwright install --with-deps chromium
cp .env.example .env   # fill in BASE_URL + credentials
```

## Run
```bash
# Local run against DES (values via .env or inline)
ENVIRONMENT=des BASE_URL=... BERSHKA_USER=... BERSHKA_PASS=... pnpm test
pnpm test:unit       # unit tests (config, selector strategy)
pnpm typecheck && pnpm lint
```

## Environments
Set via env vars only — no hardcoded URLs. `ENVIRONMENT` ∈ `prod | des | local`.
Checkout/payment tests are gated by `checkoutAllowed` (disabled for `prod`).

## Structure
- `src/config` — typed, validated multi-env config
- `src/pages` — Page Objects (intent-level methods)
- `src/components` — Component Objects (rooted at a Locator)
- `src/fixtures/test.ts` — injects env + page objects
- `tests/` — reference specs

## Explorer Agent

Crawls the site and emits a versioned functional map.

```bash
# Build the map (both sessions) and write the canonical file
ENVIRONMENT=des BASE_URL=... pnpm explore --update

# Re-run and show what changed vs the committed map
ENVIRONMENT=des BASE_URL=... pnpm explore --diff

# CI gate: fail if new uncovered flows appear
ENVIRONMENT=des BASE_URL=... pnpm explore --diff --fail-on-new
```

Classifier mode via `EXPLORER_MODE=rules|llm|auto` (default `rules`). The `llm`/`auto`
modes use `ANTHROPIC_API_KEY` and are optional. The canonical map lives at
`coverage/functional-map.json`; per-run artifacts go to `reports/explorer/`.
The live crawl needs corp VPN access to DES + browser binaries.

Extraction is accessibility-tree-driven by default (`EXPLORER_EXTRACTION=aria`) because DES
renders through `bds-` shadow-DOM components that light-DOM parsing cannot see; `dom` keeps the
offline linkedom path. Crawls are bounded by `EXPLORER_MAX_PAGES` and `EXPLORER_TIME_BUDGET_MS`.
Per-run artifacts in `reports/explorer/` have the shape `{ map, errors }`; the committed
canonical map stays a plain functional map.

Interaction discovery (`EXPLORER_INTERACTIONS=on|off`, default `on`; aria mode only) opens
non-destructive overlays/dialogs during the crawl so the map records what they reveal.
`EXPLORER_MUST_CAPTURE` (optional, M8b): semicolon-separated, case-insensitive regex patterns
for trigger labels the crawl must capture deterministically — matching candidates are
prioritized on every page until each pattern yields an overlay outcome once per crawl.
Default: `^añadir a (la )?cesta`. Empty string disables.

## Coverage Planner

Annotates the functional map with journey coverage from real execution evidence and
proposes what to validate next.

```bash
pnpm test                 # normal run; also writes reports/route-evidence.json
pnpm plan                 # read-only: coverage summary + reports/planner/proposals.json
pnpm plan --update        # additionally writes coveredBy into coverage/functional-map.json
```

A flow counts as covered when a passing test's visited routes contain the flow's steps as
an ordered subsequence. Only passed tests count; `--update` refuses empty evidence.

## Builder Engine

Generates runnable Playwright navigation specs (+ minimal page objects imitating the
POM/COM contracts) from the planner's top-ranked uncovered journeys.

```bash
pnpm plan                  # produces reports/planner/proposals.json
pnpm build-tests --top 3   # writes drafts into tests/generated/ (gitignored)
pnpm test:generated        # runs ONLY the drafts (excluded from pnpm test)
```

Drafts are deterministic (same inputs → identical files) and never join the suite
automatically: review, run, then promote by moving into `tests/<domain>/` and committing.
Checkout-looking routes are skipped by path.
