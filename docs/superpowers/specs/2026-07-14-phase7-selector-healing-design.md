# Phase 7 — Selector Healing Agent (design)

**Date:** 2026-07-14
**Status:** Scope approved by Jorge (interactive Q&A, this session): **propose, don't apply** + **reactive** + **mandatory live validation**. Execution follows the Phase 6 working pattern (autonomous, decision-log-audited). Companion decision log: `docs/superpowers/notes/2026-07-14-phase7-decision-log.md`.
**Phase gate:** Phase 7 of the platform roadmap — "Self-Healing: Selector Healing Agent. `Strategy`/`selectorHints` + per-element testId-presence recording exist as its seam. M7 shipped this seam's data."
**North Star:** Autonomy (a broken selector no longer needs a human to hunt the replacement) + Reasoning (evidence-ranked candidates).

---

## 1. What this is

A new top-level sub-project, `healer/` (`pnpm heal`), the sixth agent directory. Reactive selector healing:

1. **Input:** `reports/analyzer/failure-report.json` (Phase 6's output) — failures whose category is `selector-drift` (headline or any attempt).
2. **Parse** the broken locator out of the failure's real error message (the only place it exists).
3. **Search** the functional map for replacement candidates on the affected pages, ranked by evidence.
4. **Live-validate** each top candidate against DES: navigate to the page, resolve the proposed `Strategy` via the framework's own `locate()`, require unique + visible.
5. **Output:** `reports/healer/healing-report.json` — proposals with per-candidate validation verdicts, for a **human** to apply. The healer never edits a spec or page object.

Dependency chain stays one-way: `src ← explorer ← analyzer ← healer` (healer imports `Strategy`/`locate`/`TestIdHint` from `src/support/locators.ts` — the exact seam the roadmap reserved for this agent — plus the map schema from `explorer/` and `FailureReport` from `analyzer/types`). Nothing imports `healer/`.

## 2. Confirmed scope decisions (Jorge, 2026-07-14)

| Decision | Choice | Why |
|---|---|---|
| Propose vs apply | **Propose only.** Report + human application. | Mirrors Builder's draft-and-promote pattern (`tests/generated/`); `src/pages`/`src/components` are the battle-tested core — no agent auto-edits them in v1. |
| Reactive vs proactive | **Reactive.** Only `selector-drift` records from the failure report. | The signal already exists and was validated in Phase 6; proactive drift-checking needs new crawl machinery — v2 material. |
| Live validation | **Mandatory.** Every proposed candidate is probed against live DES before being marked `validated`. | Repo doctrine: nothing is "done" without live confirmation. Without it, self-healing is self-guessing. |

**Refinement of the approved wording, stated plainly (decision log D3):** "validación live" was phrased in conversation as "ejecutar el spec afectado". With propose-don't-apply, the spec still contains the broken selector, so re-running it cannot validate the *fix*. The live validation therefore probes the **proposed locator** on the live page (navigate → `locate()` → unique + visible). The full spec re-run is the human's final acceptance step *after applying* the chosen proposal.

## 3. Parsing broken locators (`healer/parse.ts`)

Playwright error messages carry the failing locator in a small set of real shapes (all observed in this project's own history):

| Shape | Real example (source) |
|---|---|
| Action timeout | `locator.click: Test timeout of 120000ms exceeded.` … `waiting for getByRole('button', { name: /continuar con e-?mail/i })` (A6, findings §19) |
| Strict-mode | `strict mode violation: getByRole('dialog') resolved to 2 elements` (M9, findings §17) / `locator('[data-qa-anchor="addToCartSizeBtn"]') resolved to 2 elements` (F18, findings §20) |
| Wait timeout | `waiting for locator('[data-qa-anchor="productItemWishlist"]')` (M8b, findings §16) |

`parseBrokenLocator(message)` returns a `BrokenLocator | null`:

```ts
interface BrokenLocator {
  method: 'getByRole' | 'getByTestId' | 'getByLabel' | 'getByPlaceholder' | 'locator';
  role?: string;            // getByRole first arg
  name?: string;            // getByRole name option (string or regex source, as written)
  value?: string;           // getByTestId / getByLabel / getByPlaceholder arg, or raw CSS for locator()
  testIdAttr?: TestIdAttr;  // recognized from a raw [data-*] CSS locator
  failureMode: 'not-found' | 'strict-mode';
  raw: string;              // the matched locator text, verbatim
}
```

`null` (unparseable) proposals are reported as `unparseable` — never guessed at.

## 4. Candidate search & ranking (`healer/candidates.ts`)

**Scope:** the pages of the failure's `flowsAffected` flows (all steps, not just leaves — the broken interaction can be mid-journey); if that yields no candidates, fall back to the whole map, flagged `scope: 'map-wide'`.

**Matching, in evidence order (score desc):**
1. **Label/name similarity** to the broken locator's `name`/`value` — exact (case/diacritic-insensitive) > prefix/containment > token overlap. Regex names (A6's `/continuar con e-?mail/i`) are matched by testing the regex against candidate labels where compilable, else by token overlap on the regex source's literal tokens.
2. **Role agreement** when the broken locator had one (`getByRole('button')` → candidate `role === 'button'` strongly preferred).
3. **Same-testId-value relocation** for strict-mode testId breaks: candidates elsewhere on the page carrying the same value are *the* repeated-id evidence; the proposal then prefers the page's **unique** alternatives instead (B16's map-time uniqueness rule, reusing `count`).
4. **Penalties:** shared chrome (`component` set, B14's lesson) and `revealedBy` elements (not visible on page load — M8's lesson) rank below page-specific, load-visible candidates.

Each candidate's proposed fix is its `selectorHints` converted to a `Strategy` honouring the framework's own testId → role → label priority — the same conversion the Builder uses, for the same reason.

**Top 3 candidates per failure** proceed to live validation.

## 5. Live validation (`healer/validate.ts` + CLI)

For each candidate: a Chromium context (baseURL from `loadEnv()`; `.auth/state.json` storageState when the target page's `session` is `auth` — the explorer CLI's exact pattern), `suppressOnboardingTour` → `goto(page.path)` → `acceptConsent` → bounded settle → `locate(page, strategy)` → require `count() === 1` and visible.

Verdicts (pure, unit-tested function over probe observations):
- `validated` — unique + visible live.
- `rejected-not-found` / `rejected-not-unique` / `rejected-not-visible` — probed, failed, with the observed counts recorded.
- `skipped-overlay` — candidate is `revealedBy`-tagged: not expected to be load-visible; probing it on load would false-fail (M8/M9 lesson). Left for the human with that context.
- `error` — probe itself failed (navigation error etc.), message recorded.

A failure's proposal is **confirmed** when ≥1 candidate is `validated`.

## 6. Output — `reports/healer/healing-report.json`

```ts
interface HealingCandidate {
  elementId: string; pageId: string; pagePath: string;
  strategy: Strategy; matchEvidence: string[]; rankScore: number;
  verdict: 'validated' | 'rejected-not-found' | 'rejected-not-unique'
    | 'rejected-not-visible' | 'skipped-overlay' | 'error' | 'not-probed';
  observed?: { count: number; visible: boolean };
}
interface HealingProposal {
  spec: string; title: string;
  broken: BrokenLocator | null;      // null => unparseable
  status: 'confirmed' | 'unconfirmed' | 'unparseable' | 'no-candidates';
  scope: 'flows' | 'map-wide';
  candidates: HealingCandidate[];    // rank order
}
interface HealingReport {
  generatedAt: string; failureReportGeneratedAt: string; mapGeneratedAt: string;
  totals: { selectorDriftFailures: number; confirmed: number; unconfirmed: number; unparseable: number; noCandidates: number };
  proposals: HealingProposal[];
}
```

CLI: `pnpm heal` — reads `reports/analyzer/failure-report.json` (`--failures` override; fail-fast "run `pnpm analyze` first") + map (`--map`); `--no-probe` skips live validation (offline mode: all candidates `not-probed` — for CI boxes without DES reach); `--top <n>` candidates per failure (default 3). Empty guard: 0 selector-drift failures → clean exit "nothing to heal", no report clobbering.

## 7. Deliberately NOT in scope

- Applying fixes to any file (human step, by scope decision).
- Proactive drift detection (v2), map mutation (Phase 8), orchestration (Phase 9).
- Healing `environment-noise`/`catalog-drift`/other categories — those are not selector problems; the taxonomy exists precisely to keep them out of here.

## 8. Testing & validation plan

- **Unit (TDD):** `parse.unit.test.ts` (every real message shape verbatim, regex names, raw-CSS testId recognition, unparseable → null); `candidates.unit.test.ts` (ranking order, scope fallback, chrome/revealedBy penalties, testId-uniqueness via `count`, Strategy conversion priority); `verdict` logic (all verdict branches); `args.unit.test.ts`.
- **Gate:** full `pnpm test:unit` + `pnpm typecheck` + `pnpm lint`; phases-0-6 e2e (`pnpm test`) live — zero regressions.
- **Live end-to-end (the milestone's success criterion):** feed the healer a failure-report containing the **real A6 historical drift** (the retired `getByRole('button', { name: /continuar con e-?mail/i })` on `/es/logon.html`, verbatim from findings §19) and require it to propose a real, currently-valid login-page selector and **validate it live against DES**. This is a genuine historical selector-drift healed retroactively — not a synthetic toy.
