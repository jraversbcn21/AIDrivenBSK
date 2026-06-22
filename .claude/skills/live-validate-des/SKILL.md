---
name: live-validate-des
description: Use when confirming a new or changed selector/flow against the live DES site (Bershka pre-prod) — covers VPN/cert prerequisites, codegen probing, and updating the findings doc afterward.
---

Workflow for validating a selector or flow against live DES before committing it to a page/component object.

1. **Confirm prerequisites:**
   - Corp VPN access to `*.inditex.grp` is required — DES is unreachable without it.
   - If Playwright browser binaries aren't installed yet, the download fails behind the corp proxy cert (`SELF_SIGNED_CERT_IN_CHAIN`). Use: `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium`.
   - `ignoreHTTPSErrors` is NOT needed for navigation — Chromium trusts the corp CA from the OS store.

2. **Probe the real DOM** with codegen against the configured `BASE_URL`:
   ```bash
   ENVIRONMENT=des BASE_URL=$DES_URL pnpm exec playwright codegen "$BASE_URL"
   ```
   Prefer accessibility-tree/role-based probing over reading `page.content()` — DES is built with `bds-` shadow-DOM web components, so light-DOM HTML inspection misses most interactive content. Playwright locators (`getByRole`, `getByPlaceholder`, etc.) pierce shadow DOM and work normally.

3. **Never use `waitForLoadState('networkidle')`** while probing or in the resulting test — DES streams third-party beacons indefinitely. Wait on URL changes or specific elements instead.

4. **Watch for the driver.js onboarding tour** (`.driver-overlay`) — it can appear asynchronously (~5s after load) and intercept clicks even with `force: true`. Dismiss defensively before clicks (see `dismissOnboardingTour` in `src/support/consent.ts`).

5. **Apply the confirmed selector** to the relevant Page Object / Component Object, keeping the priority order `getByTestId → getByRole → getByLabel → getByPlaceholder`.

6. **Update the findings doc** — append or amend the confirmed selector/flow in `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` so the next person (or agent) doesn't have to re-probe it live.
