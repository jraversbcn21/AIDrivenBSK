# AIDrivenBsk — Agentic QA Platform for Bershka DES

Playwright + TypeScript. What started as a Page-Object test framework is now a complete agentic QA platform: it **discovers** the site, **plans** coverage, **writes** its own tests, **runs** them, **classifies** failures, **remembers** across runs, **proposes** selector fixes, **orchestrates** the whole loop in one command — and **takes instructions in natural language**. Every mutation of committed code or knowledge stays gated by a human.

**All ten roadmap phases are implemented and live-validated** (2026-07-14). Full history: `docs/roadmap/2026-07-02-platform-roadmap.md`.

## The nine sub-projects

| Dir | Agent | Command |
|---|---|---|
| `src/` + `tests/` | Foundation (POM/COM, act→verify→retry doctrine) | `pnpm test` |
| `explorer/` | Knowledge Engine — crawls DES into a versioned functional map | `pnpm explore` |
| `planner/` | Coverage Planner — evidence-based `coveredBy` + drift-aware proposals | `pnpm plan` |
| `builder/` | Builder Engine — generates specs from proposals | `pnpm build-tests` |
| `analyzer/` | Risk Analysis — classifies failures, risk-scores map diffs | `pnpm analyze` |
| `healer/` | Selector Healing — live-validated fix proposals (propose-only) | `pnpm heal` |
| `learning/` | Continuous Learning — cross-run memory (`coverage/run-history.json`) | `pnpm learn` |
| `orchestrator/` | Deterministic full cycle: test→analyze→learn→heal→plan | `pnpm qa-cycle` |
| `intent/` | Natural-language interface | `pnpm ask "..."` |

## Setup

```bash
pnpm install
pnpm exec playwright install chromium   # behind the corp proxy: NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium
cp .env.example .env                    # ENVIRONMENT=des, BASE_URL, BERSHKA_USER, BERSHKA_PASS
```

Live anything (e2e, crawl, probing) needs the corp VPN (GlobalProtect) connected. `ENVIRONMENT` ∈ `prod | des | local`; no hardcoded URLs anywhere. Checkout is gated by `checkoutAllowed` (never on prod).

**Layout matters:** DES serves MOBILE by default and decides layout server-side per request. The suite tests **desktop** — a context-level interceptor (`src/support/layout.ts`) rewrites every document request to carry `device=desktop`, and every passing test is guarded against a silent mobile fallback; `EXPLORER_DEVICE` (default `desktop`) does the same for crawls. This is not optional plumbing: the suite silently tested the wrong layout for months before it existed (findings §24).

## Daily use

```bash
pnpm qa-cycle                 # the whole loop in one command (~10-15 min on the 25-test suite); consolidated report in reports/orchestrator/
pnpm ask "prueba el carrito"  # resolve an intent to a flow and generate its draft spec (--run executes it too)
```

`qa-cycle` flags: `--risk <old-map.json>` scores map drift · `--update-map` lets plan annotate the committed map (default OFF) · `--top <n>`.

## Growing coverage (generate → review → promote)

```bash
pnpm plan                  # ranked uncovered flows (drift-aware when run history exists)
pnpm build-tests --top 3   # drafts into gitignored tests/generated/ (prunes previous generations; --no-prune keeps)
pnpm test:generated        # run ONLY the drafts
# like one? move it into tests/<domain>/ and commit — nothing is promoted automatically
```

## When something breaks

```bash
pnpm analyze               # failures classified (6 signature-anchored categories + an `unknown` fallback, each flagged flaky/persistent)
pnpm heal                  # selector-drift failures get live-probed replacement proposals (never auto-applied)
pnpm exec playwright show-report reports/html   # videos/screenshots/traces of failures
```

## The knowledge (committed, versioned)

- `coverage/functional-map.json` — what the platform knows about DES (pages/elements/flows/interactions, schema 1.7)
- `coverage/run-history.json` — what it remembers across runs (feeds analyzer risk-scores and planner ranking)
- `docs/superpowers/notes/2026-06-17-des-live-validation-findings.md` — every live-confirmed selector/flow/gotcha, current behaviour (§2–§7, §23–§31)
- `docs/superpowers/notes/2026-06-17-des-live-validation-findings-archive.md` — closed milestone reports split out of it (§1, §8–§22)

## Explorer details

Aria-tree extraction by default (`EXPLORER_EXTRACTION=aria` — DES renders through `bds-` shadow-DOM components invisible to light-DOM parsing). Bounds: `EXPLORER_MAX_PAGES`, `EXPLORER_TIME_BUDGET_MS` (a full crawl runs ~30–40 min: real per-page settle waits). Interaction discovery (`EXPLORER_INTERACTIONS=on`) opens non-destructive overlays; `EXPLORER_MUST_CAPTURE` (semicolon-separated regexes, default `^añadir a (la )?cesta`) guarantees deterministic capture. Classifier: `EXPLORER_MODE=rules|llm|auto` (default `rules`; `llm` needs `ANTHROPIC_API_KEY`). `pnpm explore --update` writes the canonical map (refuses empty crawls); `--diff --fail-on-new` is the drift gate.

## CI (GitHub Actions, two tiers)

- `ci.yml` — unit/typecheck/lint on cloud runners, every push/PR.
- `qa-cycle.yml` (weekday mornings) + `explore.yml` (Mondays) — live jobs on a **self-hosted runner** (`[self-hosted, des-vpn]`) on a machine with the VPN; both fail fast with a clear message when DES is unreachable. Setup guide: `docs/ci/github-selfhosted-runner.md`.

## Development

```bash
pnpm test:unit    # unit tests across all nine sub-projects (vitest; the run prints the count)
pnpm typecheck && pnpm lint
```

House rules: no `any` (error), no import cycles (error), selector priority `testId → role → label → placeholder`, every DES state-changing interaction goes through `actUntil` (`src/support/retry.ts`), agents propose — humans apply.
