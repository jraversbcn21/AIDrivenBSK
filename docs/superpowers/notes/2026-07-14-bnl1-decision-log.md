# B-NL1 — Decision Log (NL instruction interface, `pnpm ask`)

**Date:** 2026-07-14
**Mode:** autonomous execution, same pattern as Phases 6–9. Scope Q&A with Jorge (four decisions) is design §2's table; this log records the implementation-level decisions beneath them.
**Companion design:** `docs/superpowers/specs/2026-07-14-bnl1-intent-interface-design.md`
**Model:** full cycle on Fable 5 (standing policy).

---

## D1. Sub-project name: `intent/`, command `pnpm ask`

- **Question:** what's the ninth agent directory called?
- **Chosen:** `intent/` — the agent's job is resolving *intent* to a flow; the user-facing verb is `ask` (command), matching the repo's role-noun dirs with imperative commands (learning/→learn).
- **Discarded:** `asker/` (awkward), `nl/` (cryptic), folding into `builder/` (the interface is not the generator — Jorge's surface decision).

## D2. Resolver signals: name-tokens + type targets, nothing else in v1

- **Question:** which map fields feed the score?
- **Chosen:** `MapFlow.name` URL-tokens (+25 each) and a `PageType`/`flow.type` target from the synonym dictionary (+40); tie-breaks shorter-chain-first then name. `MIN_SCORE = 25`. All weights one exported const (the risk-scorer precedent).
- **Reason:** those are the only intent-bearing fields the map has today (flow names ARE URL chains — the audit's own observation); a type hit is stronger than one URL token because it survives URL churn.
- **Discarded:** element-label matching (drags 4k elements into a flow-level question, noisy); coverage-status as a scoring signal (whether a flow is covered is *reported*, not used to bias resolution — the user asked for a flow, not for an uncovered one).

## D3. Auto-pick rule: MIN_SCORE + 1.5× clear-winner margin

- **Question:** when does the tool decide alone vs. ask back?
- **Chosen:** pick when the best candidate ≥ MIN_SCORE **and** (it is the only qualifier, or best ≥ 1.5 × runner-up). Otherwise list top-5 with scores/reasons and instruct `--flow <id>`.
- **Reason:** deterministic and explainable; the 1.5 margin encodes "clearly better", not "barely better" — a QA should never get a silently-arbitrary pick between near-ties.
- **Discarded:** absolute-score-only threshold (two flows at 65/64 would auto-pick arbitrarily); always-ask (Jorge rejected: two steps for obvious matches).

## D4. Synonym dictionary is code, ES-first, deliberately small

- **Question:** where does "carrito → cesta/Cart" live and how big is it?
- **Chosen:** a `SYNONYMS` const in `intent/resolve.ts` (~10 domain entries grounded in the real map's vocabulary: carrito/checkout/login/inicio/producto/categoría/rebajas/búsqueda/hombre/mujer/zapatos…). Growing it is a one-line PR.
- **Reason:** the map's vocabulary is small and stable (URL slugs + 9 page types); a tiny curated dictionary beats both a giant generic one (noise) and an LLM (non-determinism) at this scale. This is exactly the gap the future `llm` mode would fill — the seam mirrors `ClassifierMode` (`rules | llm | auto`), registered in the design, not built.
- **Discarded:** external JSON config (invites per-machine divergence — the D10-Phase-6 rule); embeddings (infrastructure for a 10-entry problem).

## D5. `selectJourneyByFlowId` shares internals with `selectJourneys`

- **Question:** duplicate the journey-construction logic or refactor?
- **Chosen:** extract the per-flow construction (chain, checkout guard, `loadedSignalFor`, `mapGeneratedAt`) into a private helper used by both; `selectJourneys`' output stays byte-identical (existing tests lock it). The checkout route guard applies to explicit asks too — **a targeted request cannot bypass the `checkoutAllowed` safety doctrine.**
- **Discarded:** copy-paste (the M7 shared-vocabulary lesson in miniature); exporting builder internals wholesale (the injection point the backlog named is one function, so one function is what's added).

## D6. `pnpm ask` writes drafts WITHOUT pruning

- **Question:** F10 made `build-tests` prune stale drafts by default. Does `ask` prune too?
- **Chosen:** no — `ask` is a *targeted addition* to the current working set; pruning would delete the user's other in-review drafts as a side effect of asking a question. Regeneration sweeps (`build-tests`) prune; conversations don't.
- **Discarded:** prune-everywhere consistency for its own sake (the two commands have different contracts: regenerate-the-set vs add-one).

## D7. Ambiguity exits 0; no-match exits 1

- **Question:** exit-code semantics for the two non-generating outcomes.
- **Chosen:** an ambiguity list is a *successful conversation step* (the tool did its job: it narrowed 165 flows to 5 and told you how to proceed) ⇒ 0. A no-match produced nothing actionable ⇒ 1. The D15 checkout blind spot gets its own explicit message (the map has no Checkout flow to find — crawler never reaches checkout by link-following), not a bare "not found".
- **Reason:** scripts consuming `ask` need to distinguish "ready to follow up" from "dead end"; and an honest, *explained* blind spot builds exactly the trust a bare failure erodes.

## Iteration log (max-8 loop)

**Same-failure iterations consumed: 0 of 8.** Every module passed first-run: resolver 9/9, args 5/5, `selectJourneyByFlowId` 4/4 (with `selectJourneys`' 18 pre-existing tests untouched and green through the shared-helper refactor).

## Verification results (2026-07-14)

- `pnpm test:unit` — **381/381** (363 + 18 new). Typecheck/lint clean.
- **Live, all four conversation shapes against the real committed map:**
  - `pnpm ask prueba el carrito` → **ambiguous, correctly**: the map holds two session-twin Cart flows (anon/auth, identical journey, both scored 65) and the 1.5× rule refused to pick arbitrarily between two genuinely different tests; both listed as "ALREADY COVERED by tests/cart/add-to-cart.spec.ts" with the `--flow` follow-up printed. *Live finding, recorded: session-variant twins make exact ties common on this map — a future v1.1 could group them in the display; auto-picking between them would be wrong, so the current behavior stands.*
  - `pnpm ask prueba el checkout` → the explicit **D15 blind-spot message** ("the crawler never reaches checkout by link-following"), exit 1. Honest, not a bare not-found.
  - `pnpm ask prueba zapatos` → ambiguous, 34 qualifiers, top-5 listed with scores/reasons.
  - `pnpm ask genera un test del pantalon bombacho barrel` → **auto-picked at 75** (3 token hits incl. the singular→plural prefix match "pantalon"→"pantalones"), draft generated in the same command.
  - `pnpm ask --flow flow_0e406081fa85 --run` → generated + executed live: **5/5 passed (2.6m)** against DES.
- **Coverage-status nuance observed live:** the bombacho flow didn't show "ALREADY COVERED" despite the promoted `tests/mujer/` spec — `coveredBy` lags until the next `pnpm test` + `pnpm plan --update` re-annotation. Expected pipeline behavior (annotation is evidence-driven), noted for the user guide, not a defect.

## Exit-gate status

- Suite completa en verde: **met** — 381/381 unit + the live `--run` above.
- Decision log revisado por el responsable humano: **met — reviewed and approved by Jorge (2026-07-14, same day: "El documento esta correcto"). Gate closed. With B-NL1 closed, the platform roadmap has no open gates and no registered milestones — use-and-maintain mode.**
