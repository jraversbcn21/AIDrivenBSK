# A5 — Robust Product Selection Against Personalizable Variants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `add-to-cart.spec.ts` pass deterministically regardless of whether the top "camiseta" result is a standard or Personalizable product, by having `firstProduct()` select a standard product *by capability* instead of by position.

**Architecture:** A live probe (Task 1) confirms the signal that distinguishes a standard PLP card from a Personalizable one and — critically — that the card-level signal predicts the PDP's add-to-cart variant. Task 2 extends `SearchResultsPage.firstProduct()` with a capability filter using that signal, refines `waitForResults()`'s diagnostics, and validates live. Task 3 closes the docs. If the probe rules out both card-level detection rungs, Task 2 is not applicable and the PDP-level fallback needs its own plan (see Task 1 exit gate).

**Tech Stack:** Playwright + TypeScript, Page Object model, pnpm, Vitest (unit — not used here, no POM unit-test precedent), live DES pre-prod.

**Spec:** `docs/superpowers/specs/2026-07-12-a5-personalizable-product-design.md`

**Model routing:** All three tasks run on **Claude Sonnet 5** (implementation + live validation + result-recording docs), per CLAUDE.md "Model routing policy". The design (spec) was Opus 4.8; the plan is Opus 4.8; from here it's Sonnet 5.

**Execution environment:** Create an isolated worktree/branch `feat/a5-personalizable-product` at execution start (superpowers:using-git-worktrees), matching the prior-milestone pattern (`feat/m9-...`). All commits land there; merge to master on completion.

## Global Constraints

Copied verbatim from CLAUDE.md / the spec — every task's requirements implicitly include these:

- `@typescript-eslint/no-explicit-any` is an **error** — no `any`, ever.
- `import/no-cycle` is an **error** (`maxDepth: Infinity`) — no circular imports at any depth.
- Selector priority: `getByTestId` → `getByRole` → `getByLabel` → `getByPlaceholder`. No XPath, no `nth-child`, no fragile CSS.
- `tsconfig.json` `strict: true`; path alias `@/*` → `src/*`.
- **Never** `waitForLoadState('networkidle')` against DES — wait by URL or specific elements.
- **act→verify→retry on every state-changing DES interaction** (fire-once clicks lost to Vue hydration). Not changed by this plan, but do not remove it anywhere.
- **No hardcoded URLs** — specs navigate with relative paths via `loadEnv()`.
- **`?device=desktop`** appended to every DES URL during manual/codegen probing (Jorge's current setup lacks the desktop-view extension). Watch for URLs already carrying a query string (use `&device=desktop`).
- Suite runs `workers: 1`, `retries: 1` — do not change.
- Package manager is **pnpm**.
- Commit messages: Conventional Commits (`type(scope): description`), scope `search/cart` for this work. End with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Live probe — confirm the personalizable signal and the rung decision

**Files:**
- Create (temporary, deleted at end of task): `tests/_probe/a5-probe.spec.ts`
- Modify (append): `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (new §18)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the **rung decision** consumed by Task 2 — one of: `rung-1` (positive card-level capability filter, with the exact locator predicate), `rung-2` (negative card-level variant filter, with the exact predicate), or `rung-3` (card-level rejected → PDP-level fallback, STOP). Plus the exact accessible name / role / regex of the chosen signal, recorded in findings §18.

**Prerequisites (superpowers:live-validate-des skill covers these):** VPN to `*.inditex.grp` up; `pnpm exec playwright install chromium` done (corp-proxy workaround: `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium`); `.auth/state.json` present (run `pnpm exec playwright test --project=setup` first if not).

- [ ] **Step 1: Invoke the live-validate-des skill**

This task probes live DES selectors — the skill establishes the VPN/cert/auth prerequisites and the codegen/probe workflow. Follow it.

- [ ] **Step 2: Reproduce A5 (confirm the red case live)**

Run the existing failing spec once to confirm A5 still reproduces and capture the current personalizable product:

Run: `pnpm exec playwright test tests/cart/add-to-cart.spec.ts --project=chromium`
Expected: FAIL — the failure snapshot shows a product PDP with `button "Personalizar"` / `button "Añadir"` instead of `button "Añadir a cesta"`. Record the product name shown.

**Catalog drift cuts both ways — if it unexpectedly PASSES:** the personalizable product is not currently top-ranked for "camiseta" (drift since M9). The fix is still warranted — it is about robustness to this recurring drift, not only today's failure. Proceed with the probe (Step 3), but search deeper: the probe must still locate *a* Personalizable card among the results to confirm the distinguishing signal and the card↔PDP correlation. If no Personalizable product can be found in the "camiseta" results at all, pause and tell Jorge — the signal cannot be characterized live today, and forcing a selector without a real example would violate the live-validation discipline (RIGOR Regla 5).

- [ ] **Step 3: Write a temporary probe spec that dumps the PLP card and personalizable PDP structure**

Create `tests/_probe/a5-probe.spec.ts`. It reuses the auth session (imports from `src/fixtures/test`), searches "camiseta", and prints the aria structure of the first several product cards plus the personalizable product's PDP add-to-cart region. Append `?device=desktop` where a raw URL is opened.

```ts
import { test } from '../../src/fixtures/test';

// TEMPORARY probe for A5 — deleted at end of Task 1. Not part of the suite.
test('A5 probe: PLP card signals + personalizable PDP', async ({ homePage, searchResultsPage, page }) => {
  await homePage.open();
  await homePage.header.searchBar.search('camiseta');
  await searchResultsPage.waitForResults();

  // (a) Dump the aria structure of the first few product cards (look for a per-card quick-add
  // button and whether a "Personalizable"/"Personalizar" signal is present on the card).
  const cards = page.getByRole('main').getByRole('listitem').filter({ has: page.locator('a[href*="-c0p"]') });
  const n = Math.min(await cards.count(), 6);
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-console
    console.log(`\n===== CARD ${i} =====\n` + (await cards.nth(i).ariaSnapshot()));
  }

  // (b) Open the FIRST card (currently the personalizable one) and dump its PDP add-to-cart region.
  await cards.first().getByRole('link').first().click();
  await page.waitForURL(/-c0p\d+\.html/, { timeout: 20_000 }).catch(() => undefined);
  // eslint-disable-next-line no-console
  console.log('\n===== PDP MAIN =====\n' + (await page.getByRole('main').ariaSnapshot()));
});
```

- [ ] **Step 4: Run the probe and read the output**

Run: `pnpm exec playwright test tests/_probe/a5-probe.spec.ts --project=chromium --reporter=line`
Read the console output. Answer, from the real output:
1. **Card signal:** does each standard card expose a per-card quick-add button, and with what exact accessible name (findings §10 expects `"Añadir a la cesta {producto}"` — confirm the exact wording, incl. whether it's `getByRole('button')`-reachable through the `bds-` shadow DOM)? Does the personalizable card show a distinguishing signal (a "Personalizable" badge/text, a "Personalizar" quick-add, or the *absence* of the standard quick-add)?
2. **Correlation (load-bearing):** does the personalizable product's CARD differ from a standard card? If its card looks identical to a standard one (same quick-add, no badge) while only its PDP differs → **card-level detection is impossible → rung 3**.
3. **Timing:** did `waitForResults()` return promptly, and is the card quick-add present at that point (not hover-only / not lazily added)?
4. **Only if rungs 1–2 are both rejected:** add `await page.goBack()` after the PDP dump and log `page.url()` — does it return to the `/q/camiseta` grid, or land on home? (Determines rung-3 viability.)

- [ ] **Step 5: Decide the rung and record findings §18**

Append a new section `## 18. A5 — Personalizable-product probe (2026-07-12)` to the findings doc, recording: the current personalizable product name, the exact card/PDP signals observed, the correlation verdict, the timing, and the **chosen rung with its exact locator predicate**. Be explicit and honest (RIGOR Regla 7): if the card cannot distinguish personalizable, say so and select rung 3.

- [ ] **Step 6: Delete the temporary probe and commit the findings**

```bash
rm tests/_probe/a5-probe.spec.ts
rmdir tests/_probe 2>/dev/null || true
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md
git commit -m "docs(search/cart): record A5 personalizable-product live probe (findings §18)"
```

- [ ] **Step 7: EXIT GATE — branch on the rung decision**

- **rung-1 or rung-2** → proceed to Task 2 (same code shape; the `.filter(...)` predicate differs).
- **rung-3** (card-level rejected) → **STOP.** The PDP-level try-next fallback is a materially larger change contingent on the Step-4 back-navigation result. Return to the writing-plans skill to author the fallback plan with the real back-nav data. Do **not** improvise it here.

---

### Task 2: Capability filter + diagnostic split in `SearchResultsPage`, validated live

**Applies only if Task 1 chose rung-1 or rung-2.**

**Files:**
- Modify: `src/pages/SearchResultsPage.ts`
- Test (existing, live — the red→green oracle): `tests/cart/add-to-cart.spec.ts` (unchanged), `tests/search/search-plp-pdp.spec.ts` (unchanged, no-regression)

**Interfaces:**
- Consumes: the rung decision + exact locator predicate from Task 1.
- Produces: `firstProduct(): ProductCard` now returns the first *standard* product (capability-filtered); `waitForResults()` throws distinct diagnostics for "no compatible product" vs "dead load". A new private `productCards(): Locator` helper. No signature changes to public methods.

**No unit test:** there is no POM/COM unit-test precedent in the repo (only `src/config/env.unit.test.ts` and `src/support/locators.unit.test.ts` exist; `src/pages/` and `src/components/` have none). Per spec §6, validation is live. The existing `add-to-cart.spec.ts` is the failing-then-passing oracle.

- [ ] **Step 1: Add the `Locator` type import**

In `src/pages/SearchResultsPage.ts`, extend the Playwright type import:

```ts
import type { Page, Locator } from '@playwright/test';
```

- [ ] **Step 2: Extract the `productCards()` helper and add the capability filter to `firstProduct()`**

Replace the existing `firstProduct()` (lines ~13-22) with a private `productCards()` (the current banner-skipping logic) plus a capability-filtered `firstProduct()`. The `.filter(...)` predicate below is the **expected rung-1** signal — **substitute the exact predicate Task 1 recorded** if it differs (rung-2 uses `hasNot` with the personalizable signal; the surrounding structure is identical):

```ts
  // Grid listitems that link to a real PDP (`-c0p<id>.html`), skipping the promo/banner tile.
  // Scoped to <main>: the header's hidden mobile-nav dialog also has listitem/link entries
  // (e.g. "Ir a la cesta"), so an unscoped getByRole('listitem') can resolve to the wrong node.
  private productCards(): Locator {
    return this.page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ has: this.page.locator('a[href*="-c0p"]') });
  }

  firstProduct(): ProductCard {
    // Select by capability, not position (backlog A5): a Personalizable product exposes
    // "Personalizar"/"Añadir" instead of the standard "Añadir a cesta" flow, so restrict to cards
    // presenting the standard per-card quick-add affordance. Robust to catalog drift — any card
    // lacking it (Personalizable or a future variant) is skipped. Signal confirmed live, findings §18.
    return new ProductCard(
      this.productCards()
        .filter({ has: this.page.getByRole('button', { name: /^Añadir a la cesta/i }) })
        .first(),
    );
  }
```

- [ ] **Step 3: Split `waitForResults()`'s deadline diagnostic**

Replace the single post-deadline `throw` with a branch that distinguishes "grid rendered but no compatible product" from "grid never rendered":

```ts
  async waitForResults(opts: { timeoutMs?: number } = {}): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.firstProduct().isVisible().catch(() => false)) return;
      await this.page.waitForTimeout(500);
    }
    // Deadline hit. A compatible (standard) product never appeared. Distinguish the two causes so
    // the failure is actionable: a rendered grid with only incompatible variants is NOT a dead load.
    if (await this.productCards().first().isVisible().catch(() => false)) {
      throw new Error(
        `SearchResultsPage: results grid rendered but no standard-add-to-cart product found within ${timeoutMs}ms (all variants Personalizable?)`,
      );
    }
    throw new Error(
      `SearchResultsPage: results grid did not render within ${timeoutMs}ms — dead /q/ load (DES pre-prod noise); the test-level retry re-runs the search`,
    );
  }
```

Note on "fail fast" (spec §5): the common case already returns fast (a standard product is found and `waitForResults` returns early). Only a pathological all-Personalizable result set burns the full budget before the new diagnostic — accepted, because failing fast the instant the grid appears would race the quick-add's hydration (§4 q3) and mislabel a still-hydrating standard product as "no compatible product". The post-deadline check is the timing-safe choice.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean (no `any`, no cycles, no unused `Locator` import).

- [ ] **Step 5: Commit the fix**

```bash
git add src/pages/SearchResultsPage.ts
git commit -m "fix(search/cart): select a standard product by capability, skip Personalizable (A5)"
```

- [ ] **Step 6: Live-validate — `add-to-cart.spec.ts` green across repeated runs**

The spec failed 5/5 before; repeated passes rule out luck (spec §6). Run it 5 times consecutively:

Run: `for i in 1 2 3 4 5; do echo "=== run $i ==="; pnpm exec playwright test tests/cart/add-to-cart.spec.ts --project=chromium || break; done`
Expected: PASS on all 5 runs. (One retry within a run is acceptable per `retries: 1` / documented DES noise; a hard fail on any run is not — investigate before proceeding, do not paper over with more retries.)

- [ ] **Step 7: Live-validate — no regression on the full reference suite**

Run: `pnpm test`
Expected: 4/4 (setup + login + search-plp-pdp + add-to-cart). Confirm `search-plp-pdp.spec.ts` (also uses `firstProduct()`) still passes — it now deterministically opens a standard product. (A single retry on documented DES noise is acceptable; a reproducible failure is a regression to fix.)

- [ ] **Step 8: Commit any validation-driven adjustment (only if Step 6/7 required a selector tweak)**

If the live runs showed the Task-1 predicate needed adjusting (e.g. exact accessible name differed), fix `firstProduct()` and re-run Steps 6-7, then:

```bash
git add src/pages/SearchResultsPage.ts
git commit -m "fix(search/cart): adjust A5 standard-product selector to live-confirmed name"
```

---

### Task 3: Close the docs

**Files:**
- Modify: `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` (append fix + validation results to §18; update the header "Status" line's A5 note)
- Modify: `docs/roadmap/2026-07-02-backlog.md` (mark A5 done)
- Modify: `docs/roadmap/2026-07-02-platform-roadmap.md` ("Where a fresh session resumes" — A5 closed)
- Modify: `CLAUDE.md` (pending-tasks note — remove/close A5)

**Interfaces:**
- Consumes: the live-validation results from Task 2.
- Produces: A5 recorded as closed across the docs. No code.

- [ ] **Step 1: Append the fix + validation outcome to findings §18**

Under the §18 probe section from Task 1, record: the shipped `firstProduct()` capability filter, the diagnostic split, and the live results (5/5 `add-to-cart.spec.ts`, `pnpm test` 4/4). State honestly if any run needed a retry (RIGOR Regla 7). Update the findings-doc header "Status" line where it currently reads "modulo the known A5 catalog-drift gap in `add-to-cart.spec.ts`".

- [ ] **Step 2: Mark A5 done in the backlog**

In `docs/roadmap/2026-07-02-backlog.md`, update the A5 item (§A, line ~49) to a **done** status line with the closing date (2026-07-12), the chosen rung, and a findings §18 reference — matching the format of the other closed items (e.g. A1/A3/A4). Remove A5 from the "Where a fresh session resumes" candidate list at the top.

- [ ] **Step 3: Update the roadmap's resume note**

In `docs/roadmap/2026-07-02-platform-roadmap.md`, update "Where a fresh session resumes" so A5 is no longer the top next-candidate (it's closed); B17/F18 become the natural next candidates per the audit's sequencing.

- [ ] **Step 4: Update CLAUDE.md's pending-tasks note**

In `CLAUDE.md`, remove A5 from "Pending tasks for next session" (item 2) and from the "Current state" paragraph's A5 references; leave B17/F18/lower-priority items intact. (Note: CLAUDE.md already has an unrelated pre-existing working-tree modification — do not revert it; only make the A5-closure edits.)

- [ ] **Step 5: Commit the doc closure**

```bash
git add docs/superpowers/notes/2026-06-17-des-live-validation-findings.md docs/roadmap/2026-07-02-backlog.md docs/roadmap/2026-07-02-platform-roadmap.md CLAUDE.md
git commit -m "docs(search/cart): close A5 — standard-product selection live-validated"
```

- [ ] **Step 6: Finish the branch**

Use superpowers:finishing-a-development-branch to merge `feat/a5-personalizable-product` to master (or open a PR, per Jorge's preference at that point).

---

## Self-Review

**Spec coverage:**
- Spec §2 "keep the reference test on the standard flow" → Task 2 (capability filter, no `ProductPage` variant handling). ✓
- Spec §2 "modify `firstProduct()` in place" → Task 2 Step 2. ✓
- Spec §3 detection hierarchy → Task 1 Step 4-5 (probe walks rungs), Task 2 (implements chosen rung), Task 1 Step 7 gate (rung-3 → re-plan). ✓
- Spec §4 live probe (all 5 questions incl. the load-bearing correlation) → Task 1 Steps 2-5. ✓
- Spec §5 error diagnostics (two distinct messages) → Task 2 Step 3. ✓
- Spec §6 testing (no unit-test precedent; 3-5 consecutive live runs; full suite; typecheck/lint; findings §18; backlog/roadmap) → Task 2 Steps 4/6/7, Task 3. ✓
- Spec §7 non-goals (no term change, no `selectFirstSize`/`addToCart` change, no hardcoded URL, rung-3 not built speculatively) → respected; Task 2 touches only `SearchResultsPage.ts`. ✓
- Spec §8 success criteria → Task 2 Steps 6-7 (deterministic repeated green, no regression). ✓

**Placeholder scan:** The rung-1 locator in Task 2 Step 2 is the *expected* signal with an explicit, bounded "substitute the Task-1 predicate if it differs" instruction — not an open placeholder; the code is complete and runnable for the expected case. Task 1's probe output is genuinely investigative (live), so its steps specify the exact questions and commands, not fabricated output. No "TBD"/"handle edge cases"/"similar to Task N". ✓

**Type consistency:** `productCards(): Locator` (Task 2 Step 2) is used by both `firstProduct()` (Step 2) and `waitForResults()` (Step 3); `Locator` imported in Step 1. `firstProduct(): ProductCard` return type unchanged (consumed by both specs). No signature drift. ✓

**Contingency honesty:** rung-3 (PDP-level fallback) is deliberately NOT written as speculative code (YAGNI + it depends on live back-nav data we won't have until Task 1) — it is gated to a fresh planning cycle at Task 1 Step 7. This is a conscious scope decision, stated in the plan header and the exit gate.
