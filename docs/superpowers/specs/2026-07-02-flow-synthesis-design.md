# Multi-Step Flow Synthesis Design

**Date:** 2026-07-02
**Status:** Approved (design)
**Scope:** Milestone M4 of the platform roadmap (`docs/roadmap/2026-07-02-platform-roadmap.md`) — turn the functional map's single-page pseudo-flows into real multi-step navigation journeys. Implements backlog B8. Coverage annotations (matching flows against existing Playwright specs) are explicitly **out of scope** — they belong to M5 (Coverage + Test Generator Planning Agent), where cross-referencing `tests/*.spec.ts` is a first-class design concern, not a bolt-on.

---

## Context

`explorer/map/builder.ts`'s `buildMap()` currently emits exactly one `MapFlow` per crawled page, with `steps: [pageId]` — a "flow" that is really just the page itself. This was flagged as a known gap from the start (backlog B8): the Coverage/Planning agent (Phase 4) needs real multi-step journeys (Home→Search→PLP→PDP→Cart) to reason about, not isolated pages.

The first live crawl (M2c, committed `coverage/functional-map.json`) confirmed the data needed for this already exists: every `MapPage.discoveredVia` is either `'seed'` or the exact `path` of the parent page that linked to it. Because `Frontier` dedups each page by `session:routePattern` **before** enqueueing, every page has exactly one recorded parent — the discovery graph is a tree, not a general graph, rooted at the crawl's seeds. This makes "the flow to reach page X" unambiguous: walk `discoveredVia` backward from X to a seed.

---

## Decisions

1. **A flow is a real navigation path, not a curated business journey.** Reconstruct the actual multi-hop path the crawler walked to reach each page, using `discoveredVia`. This works today even though most pages still classify as `pageType: 'Other'` (a separate, harder classifier problem already tracked in the findings doc) — it reflects real site structure, not a guess requiring accurate page-type detection first.
2. **Still one flow per page** (parity with today's 1:1 behavior) — but `steps` now holds the full ordered chain of page IDs from a seed to that page, not just the page itself. No new page-selection heuristic (e.g. "only leaves") is introduced; every page keeps its own flow entry.
3. **Coverage annotations are out of scope for M4.** They're M5's concern.
4. **Change is contained to `explorer/map/builder.ts`.** No crawler, extractor, or `PageExtraction` schema changes — `discoveredVia` already carries what's needed.

---

## Design

### Chain reconstruction

Inside `buildMap()`, before assembling `flows`, build a lookup:

```ts
const byPath = new Map<string, { id: string; discoveredVia: string; title: string }>();
```

keyed by `` `${session}:${path}` ``, populated in the same loop that already builds `pages[]` (so no second pass over the input is needed).

For each classified page, resolve its flow's `steps` by walking backward:

```
current = this page
chain = [current.id]
while current.discoveredVia !== 'seed':
  parent = byPath.get(`${session}:${current.discoveredVia}`)
  if parent is undefined: break        // defensive: stop short rather than throw
  chain.unshift(parent.id)
  current = parent
```

capped at a fixed `MAX_CHAIN_HOPS = 50` constant local to `builder.ts` as a defensive ceiling — `buildMap()` takes only `ClassifiedPage[]` and stays decoupled from crawl config (it has no existing dependency on `explorer/config.ts` and shouldn't gain one just for this guard). The tree invariant means this should never trigger against real crawler output; it only guards against a malformed fixture or future crawler change producing a cycle.

### Schema changes (`explorer/map/schema.ts`)

- `SCHEMA_VERSION` bumps `'1.0'` → `'1.1'` (semantic change to `MapFlow.steps`, per the roadmap's additive-versioning discipline).
- `MapFlow.steps: string[]` — type unchanged; now holds the full root-to-leaf chain instead of a single ID.
- `MapFlow.name: string` — becomes the chain's page **paths** joined with `" -> "` (e.g. `"/ -> /es/h-woman.html -> /es/shop-cart.html"`) instead of `"${pageType} (${session})"`. Deterministic, human-readable, and doesn't depend on classification accuracy.
- `MapFlow.type` / `MapFlow.priority` — unchanged logic, now derived from the **last** page in the chain (previously the only page).
- `MapFlow.id` — unchanged: `makeId('flow', pageId)`, keyed only on the endpoint page. One page still has exactly one flow ID, regardless of chain depth.

### Edge cases

- **Seed pages** (`discoveredVia === 'seed'`): chain is `[thisPage.id]` — identical to today's output, no regression for the shallowest pages.
- **Missing parent in the index:** chain reconstruction stops at the last resolvable page rather than throwing. This should not occur with the current crawler's tree invariant, but keeps `buildMap()` a pure, total function over whatever `ClassifiedPage[]` it's given (including hand-built unit-test fixtures that don't model a full crawl).
- **Cross-session chains:** impossible by construction — `anon` and `auth` crawl in separate `Frontier`/session scopes, and the lookup key includes `session`, so a chain never crosses sessions.

### Rollout

After implementation and unit tests are green, re-run a live crawl (`pnpm explore --session both --update`) to refresh the committed `coverage/functional-map.json` with real schema-1.1 multi-step flows — the map should not sit on stale schema-1.0 data once the logic that produces it has changed.

---

## Testing

Offline only (Vitest), extending `explorer/map/builder.unit.test.ts`:
- A 3-page chain fixture (A via `'seed'`, B via A's path, C via B's path) asserting the flow ending at C has `steps: [idA, idB, idC]` and `name` reflecting the full path chain.
- The existing single-hop test (page discovered directly via `'seed'`) continues to pass unchanged — it's the degenerate 1-page-chain case.
- A defensive case: a page whose `discoveredVia` points to a path absent from the input still produces a valid (shorter) flow instead of throwing.

## Non-goals

- Coverage annotations / `MapFlow.coveredBy` (M5).
- Curated/named business journeys distinct from discovered navigation paths (a possible future layer once page-type classification is more reliable — not needed now).
- Any change to the crawler, extractors, or `PageExtraction`.
- Deduplicating prefix flows (e.g. the flow ending at an intermediate hub page is a strict prefix of a longer flow through it) — every page keeps its own flow entry, matching today's 1:1 behavior.
