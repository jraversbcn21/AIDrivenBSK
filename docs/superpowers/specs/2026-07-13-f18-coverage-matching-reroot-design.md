# F18 — Restore coverage matching by re-rooting the map (design)

**Date:** 2026-07-13
**Model:** Claude Opus 4.8 (spec/design phase — CLAUDE.md "Model routing policy")
**Backlog:** `docs/roadmap/2026-07-02-backlog.md` §F, item F18 (= audit finding F5). Depends on / subsumes audit finding **F4** (chain-truncation on redirecting seeds) — see §3.
**Status:** Design, pending Jorge's review. Implementation runs on Claude Sonnet 5.
**Baseline:** `master` @ `034ea50`. Canonical map: `coverage/functional-map.json`, schema 1.5, 149 pages / 149 flows.

---

## 1. Problem

`pnpm plan`'s evidence→map coverage linkage — M5b's headline capability and the seed of Phase 8 (Continuous Learning) — has reported near-zero flows covered for seven consecutive sessions (M7 through M9). Each session's findings note attributed it to crawl-order variability. It is not variability; it is a deterministic root-alignment defect, now verified directly against the committed artifacts.

**Verified facts (measured, not assumed):**

- All 149 flows in the committed map root at the bare `/` page (`routePattern: "/"`, `pageType: Home`) — a non-localized home distinct from `/es/h-woman.html`. Confirmed: every page's `discoveredVia` chain terminates at `/`.
- The manual reference suite (`pnpm test` — the three specs `pnpm plan` consumes) navigates from the `/es/` locale root per `BASE_URL` doctrine and never visits bare `/`.
- `planner/coverage/match.ts`'s `isOrderedSubsequence` requires the flow's *entire* step chain — including the never-visited `/` — to appear in the evidence. The first needle element (`/`) is never in the haystack, so every match fails at step 1.

**The matching logic itself is correct.** Feeding the current matcher + committed map the on-disk `route-evidence.json` from a `pnpm test:generated` run (whose generated specs replay the map's chains and therefore *do* start at `/`) yields **18/149 flows covered**, with sensible covered chains. The 0/N is exclusively a root-alignment problem between the map (roots at `/`) and the manual suite's evidence (roots at `/es/`).

## 2. Decision

**Option A — re-root the map by dropping `/` from the crawler's seed list.** Chosen over the two alternatives (B: trim un-navigated seed-root prefixes at match time; C: match on chain suffix) on platform-goal grounds:

- **Knowledge correctness (decisive).** A map that roots journeys at a bare `/` artifact no real user or spec enters through is *wrong knowledge*. Option A fixes the input data so the map models the site as it is actually entered (`/es/` → gender gate → `h-woman`). B/C leave the wrong root in place and compensate at match time.
- **Platform coherence.** Today the Builder's generated specs `goto('/')` while the manual reference specs `goto('/es/')` — the model of journeys and how they are actually driven disagree. A heals this everywhere at once; B/C keep the disagreement alive but hidden behind the coverage number, which for an autonomous platform compounds silently.
- **QA trust — why not B/C.** B and C introduce match-time leniency that nudges toward *false positives* ("this flow is covered" when it isn't). For a QA platform, a coverage false positive hides untested risk — strictly worse than under-counting. A keeps matching strict and fixes the data instead: no leniency, no false-positive surface.

`planner/coverage/*` is **not touched** — matching semantics stay exactly as they are.

## 3. Critical dependency: fixing F4 is part of this change, not optional

Dropping `/` alone would regress the map. Verified mechanism:

- Today the discovery tree hangs cleanly off `/` because `/` does **not** redirect (it serves a real home at path `/`) and discovers `/es/h-woman.html` first, with `discoveredVia: "/"`. The `/es/` seed *does* server-resolve (via the gender gate) to `/es/h-woman.html`, but it arrives second and is deduped by `Frontier`/`markSeen` — so its behavior is masked. (Confirmed: no distinct `/es` page exists in the map; `h-woman.discoveredVia === "/"` in both sessions.)
- Drop `/`, and `/es/` becomes the root seed. It resolves to `/es/h-woman.html`, which is recorded under its **resolved** `meta.path` (`/es/h-woman.html`), `discoveredVia: 'seed'`. But its children are enqueued in `crawler.ts:112-117` with `discoveredVia: item.path` — the **requested** seed path (`/es`). In `buildMap`'s second pass (`explorer/map/builder.ts:110-114`), each child looks up its parent in `nodeByKey`, which is keyed by the parent's **resolved** `meta.path`. The requested `/es` key misses the resolved `/es/h-woman.html` entry → the chain walk terminates immediately → **every flow truncates to a single step.**
- Net effect of a naive "drop `/`" : we would trade "0 coverage with correct multi-step chains" for "non-zero coverage with M4's multi-step chains destroyed." Unacceptable.

This is exactly audit finding **F4** (`docs/superpowers/notes/2026-07-06-fable5-final-audit.md` §2), latent today precisely because the `/` seed masks it. Re-rooting on `/es/` unmasks it, so F4's fix ships here.

**F4 fix:** in `explorer/crawl/crawler.ts`, set a child's `discoveredVia` to the parent's **resolved** path (`extraction.meta.path`), not the requested `item.path`. Properties:

- **Inert for non-redirected pages** — where requested === resolved (every page in today's tree, including `/` if it were kept), the value is unchanged, so no current behavior shifts.
- **Load-bearing exactly when the root seed redirects** — which is the new `/es/` case.
- **Semantically correct** — children are literally discovered on the resolved page (`page.url()` after `goto` + `acceptConsent`), so the resolved path is their true parent.

## 4. Scope of the change

1. **`explorer/cli.ts`** — `const SEEDS = ['/es/', '/es/search'];` (remove `'/'`). Single source of the seed list; no CI/env override exists (verified).
2. **`explorer/crawl/crawler.ts`** (~line 116) — child `discoveredVia: extraction.meta.path` instead of `item.path`.
3. **`planner/coverage/*`** — **no change** (matching preserved, per the decision).
4. **Schema** — **no change**; stays 1.5. No new fields. The committed map's flow ids re-root (a one-time diff-baseline reset, the same precedent as every prior map refresh) but the shape is identical.

Out of scope, deliberately:
- **Not adding option B** (matcher prefix-trimming). After A there is no observed need, and adding match-time leniency would create a false-positive surface — contrary to both the QA-trust rationale above and the project's "fix to observed reality, don't hedge unconfirmed hypotheticals" doctrine.
- **`/es/search`** stays as a seed (status quo; untouched).
- **`route-evidence.json` producer overlap** — both `pnpm test` and `pnpm test:generated` write the same file via the shared `routeEvidence` fixture. Validation must therefore run `pnpm test` (not `test:generated`) immediately before `pnpm plan`. This is a validation-ordering note and a candidate future backlog item, **not** fixed here.

## 5. Testing

**Unit (deterministic guarantee of the F4 fix).** Add a `buildMap` regression test that reproduces the redirect scenario at the pure/offline level: a seed page whose `meta.path` (resolved) differs from the requested seed path, plus child extractions whose `discoveredVia` equals the resolved parent path. Assert the reconstructed flow chain is the **full** `[seed → child → …]`, not a truncated `[child]`. This locks in that resolved-path `discoveredVia` reconstructs chains through a redirecting root. (`buildMap` is pure and already unit-tested — this extends `explorer/map/builder.unit.test.ts`.) Existing unit tests that use `/` as a synthetic fixture path stay valid — they exercise chain/matching logic with synthetic data, and that logic is unchanged.

**Live re-validation (mandatory — this change is ⚠ per the audit; it re-roots the committed map).** In order:
1. Full re-crawl, both sessions (`pnpm explore --update`). Verify against the new map: (a) flows root at `/es/h-woman.html`, (b) **no** `/` page, (c) multi-step chains **preserved** — a multi-step flow count comparable to today's 147, **not** collapsed toward single-step (this is the guardrail proving F4 did not regress chains).
2. `pnpm test` (manual reference suite) → `pnpm plan --update`. Confirm **non-zero** `coveredBy`, and that the covered flows are the journeys the manual suite demonstrably walks (login → `member-hub`; the add-to-cart chain as far as it aligns).
3. `pnpm build-tests` + `pnpm test:generated` — no regression (generated specs now root at the localized entry).
4. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` — green.

## 6. Success criteria

- `coveredBy` is **non-empty** on the manual suite's real journeys — the evidence→map linkage (M5b's headline capability) works for the first time since M7b.
- Multi-step chains are **preserved** in the re-crawled map (F4 guardrail), not truncated to single steps.
- No regression in `pnpm test`, `pnpm test:generated`, unit tests, typecheck, or lint.

## 7. Risks

- **DES pre-prod flakiness on the re-crawl** (findings §7/§8) — pre-existing; mitigated by re-running. Not an F18 defect.
- **`/es/` root stability.** If a crawl intermittently fails to pass the gate and roots at `/es` instead of `/es/h-woman.html`, the subsequence match still tolerates it as long as the manual suite's evidence contains the same root (it navigates the same `/es/` entry). Treat any root instability as the documented DES gate-flakiness noise, not an F18 regression — cross-check with a manual probe before touching code.
- **F4 fix blast radius.** The re-indexing changes flow *contents* on any historically-redirecting parent, not just the seed. The live guardrail in §5 step 1(c) (multi-step chain count preserved) is what catches an unexpected regression here before commit.
