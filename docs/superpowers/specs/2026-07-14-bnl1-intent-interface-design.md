# B-NL1 — Natural-language instruction interface (`pnpm ask`) (design)

**Date:** 2026-07-14
**Status:** Scope approved by Jorge (four decisions, this session): **deterministic resolver + LLM seam** · **own command `pnpm ask`** · **auto-pick with threshold, else list** · **generate by default, `--run` opt-in**. Same working pattern as Phases 6–9. Companion decision log: `docs/superpowers/notes/2026-07-14-bnl1-decision-log.md`.
**Backlog:** §E, B-NL1 — "resolves a natural-language instruction against the flow names/paths already known to the Explorer's map, and triggers generation of that specific flow as a one-off override of the normal priority ranking — it bridges the ranking, it does not replace it." Injection point verified there: `selectJourneys()` in `builder/`.
**North Star:** Autonomy + Reasoning (the roadmap's own assignment for this item).

---

## 1. What this is

A new top-level sub-project, `intent/` (`pnpm ask`, the ninth agent directory):

```
pnpm ask "prueba el carrito"
  → resolves the text against the map's flows (deterministic scoring, explainable)
  → clear winner: picks it, reports its coverage status, generates the draft spec
    via the Builder's own machinery (tests/generated/, review-and-promote contract)
  → ambiguous: lists the top candidates with scores/reasons; re-run with --flow <id>
  → no match: says so honestly (incl. the D15 checkout blind spot), exits non-zero
  → --run: additionally executes pnpm test:generated to see it pass live
```

It **bridges** the planner's ranking for one targeted request; it never replaces it.

## 2. Confirmed scope decisions (Jorge, 2026-07-14)

| Decision | Choice |
|---|---|
| Resolver | **Deterministic v1**: normalized token matching + ES domain-synonym dictionary against `MapFlow.name`/`type`/leaf `pageType`. No LLM call; the config seam for a future `llm` mode mirrors the explorer's existing `rules \| llm \| auto` pattern — registered, not built. |
| Surface | **Own command `pnpm ask`** (`intent/cli.ts`) — the human interface stays separate from the generator; can grow into bot/API surfaces later. |
| Ambiguity | **Auto-pick with a threshold** (clear winner: best ≥ MIN_SCORE and ≥ 1.5× the runner-up, or sole qualifier); otherwise list top-5 with scores and reasons and instruct `--flow <id>`. |
| Action | **Generate the draft by default** (Builder contract: gitignored `tests/generated/`, human promotes); `--run` opt-in executes `pnpm test:generated` right after. |

## 3. The resolver (`intent/resolve.ts`) — deterministic and explainable

1. **Normalize**: lowercase + strip diacritics (the healer's proven normalizer).
2. **Strip stopwords**: test-speak (prueba/testea/verifica/genera/quiero…), articles/prepositions, and the words `flujo/flow/spec/test` themselves — what remains are the intent tokens.
3. **Expand synonyms** (domain dictionary, ES-first): each token maps to URL-token targets and/or a `PageType` target. Examples grounded in the real map: `carrito/carro/cart → {cesta, cart, shop} + type:Cart` · `checkout/pago/compra → type:Checkout` · `login/sesión/acceso → {logon, login}` · `inicio/home → {woman, home} + type:Home` · `producto/detalle → type:PDP` · `categoría/listado → type:PLP` · `rebajas/ofertas/sale → {rebajas, sale}` · `búsqueda/buscar → {search, q} + type:Search`.
4. **Score every flow** (all weights in one exported const):
   - **+25 per query token** matched in the flow's `name` URL-tokens (normalized, deduped);
   - **+40 for a type hit**: a synonym's `PageType` target equals the flow's `type`;
   - tie-breaks: fewer steps first (the most direct route to the intent), then name.
5. **Verdict**: `MIN_SCORE = 25` (one real signal). Auto-pick per §2's rule. Below threshold ⇒ no-match, with up to 3 sub-threshold suggestions and — when the query's type-target was `Checkout` and the map holds no Checkout flow — the explicit D15 explanation instead of a bare "not found".
6. Every match carries `reasons[]` (which tokens/types hit) — same explainability bar as the risk scorer and the healer.

## 4. Builder injection (`builder/select.ts`) — the backlog's designed seam

New `selectJourneyByFlowId(map, flowId)`: builds the same `JourneyInput` that `selectJourneys` builds for a proposal (chain from the flow's steps, `loadedSignalFor` leaf signal, `mapGeneratedAt`), but keyed directly by flowId — bypassing the ranking, exactly as backlog §E specified. Internals shared with `selectJourneys` (extracted private helper; output-identical for the existing path, locked by the existing tests). **The checkout route guard applies unchanged** — an explicit ask cannot bypass the `checkoutAllowed` safety doctrine.

## 5. CLI (`intent/cli.ts` — `pnpm ask`)

- Positional args join into the query; flags: `--flow <id>` (skip resolution — the ambiguity follow-up), `--run`, `--top <n>` (list size, default 5), `--map <path>`.
- On a pick (auto or `--flow`): report the flow, its **coverage status** (`coveredBy` — "already covered by tests/cart/add-to-cart.spec.ts" is itself valuable QA information), generate via `TemplateGenerator`, write into `tests/generated/` **without pruning** (a targeted addition must not delete the user's other current drafts; F10's prune stays a `build-tests` regeneration behavior).
- `--run`: spawn `pnpm test:generated` (child process, inherited stdio — the orchestrator's pattern).
- Exit codes: no-match ⇒ 1; ambiguous list ⇒ 0 (a successful conversation step, with the follow-up instruction); generation/probe failures propagate.

## 6. Deliberately NOT in scope

- The LLM resolution mode (seam registered via config shape only, mirroring `ClassifierMode`).
- Interaction-spec generation by intent (v1 resolves to navigation flows; the interaction machinery stays must-capture-driven).
- Any bot/API surface (the CLI is the v1 surface; the resolver is pure and reusable).
- Fixing D15 (checkout unreachable by crawling) — B-NL1 answers honestly about the blind spot; filling it is D15's own milestone.

## 7. Testing & validation plan

- **Unit (TDD):** resolver (synonyms incl. carrito→Cart, diacritic insensitivity, stopwords, auto-pick vs ambiguous-list threshold rule, tie-breaks, no-match, the D15 checkout message); `selectJourneyByFlowId` (happy path, unknown flow, checkout guard, missing page id, existing `selectJourneys` output unchanged); args.
- **Gate:** full unit + typecheck + lint.
- **Live (the milestone's success criteria, all four conversation shapes):** `"prueba el carrito"` → resolves to the Cart flow and reports it's already covered; `"prueba pantalones bombacho"` → resolves to the just-promoted flow; `"prueba el checkout"` → honest D15 no-match, exit 1; an ambiguous query (e.g. `"prueba zapatos"`) → top-5 list; and one `--run` pass green against DES.
