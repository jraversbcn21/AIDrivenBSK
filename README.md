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
