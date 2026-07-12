# R9 — Reference Retrieval Before Generation (design doc)

**Status:** draft · **Date:** 2026-07-11 · **Backlog:** R9 (deferred, codex-flagged as competitive threat) · **Depends on:** R7 benchmark harness

---

## 1. Problem & why now

Codex 2026-05-06: *"A constraint system without references risks becoming a taste rulebook. A constraint system plus retrieval plus rendered audit is defensible."*

Coherent today tells the AI what **not** to do (bans, validators) and what the design **decisions** are (tokens, atmosphere). It never shows it what **good** looks like for *this* request. That's the gap Refero attacks from the stronger, taste-first side: they sell real product screens for agents to study before building.

This doc is the on-thesis answer to the recurring "should we integrate 21st.dev / copy-a-site tools?" question. The answer is **not** raw component import (re-imports slop, bypasses the validator — see R5 rejection). The answer is **retrieval as inspiration context, gated through the constraint system**: show real screens, copy *decisions* not *markup*.

## 2. Thesis fit (the line we must not cross)

| On-thesis (do) | Off-thesis (never) |
|---|---|
| Retrieve real screens as *inspiration context* | Paste real screens' markup into output |
| Extract density/layout-grammar/palette signals | Copy component trees / class strings |
| Every retrieved influence still passes `coherent check` | Ship anything the validator would reject |
| "Show, don't tell" prompting | Cargo-cult structure transplant |

`extract` (Tool 1) already proves the pattern in miniature: it lifts *tokens* from a real URL and feeds the engine. R9 generalizes it from "one site's tokens" to "a curated corpus of screens, retrieved per request."

## 3. Architecture

```
request ("logistics dispatch board, dense, keyboard-first")
   │
   ├─ 1. classify → { domain, density, atmosphere, page_type }
   │
   ├─ 2. retrieve  → top 3-5 reference screens from corpus (semantic + filter)
   │
   ├─ 3. distill   → each ref → structured signal, NOT raw HTML
   │                  { layout_grammar, density, spacing_rhythm, palette_role_map,
   │                    interaction_model, data_artifacts } + 1 short prose "why it works"
   │
   ├─ 4. inject    → distilled signals as an INSPIRATION block in the page prompt
   │                  (token-budgeted; capped like contextual RULES_ blocks)
   │
   └─ 5. generate → existing pipeline → existing validators (unchanged gate)
```

Key decision: **step 3 distills to signal, never passes raw markup downstream.** This is what keeps it on-thesis and keeps token cost bounded. The corpus stores raw screens for *human curation*; the pipeline only ever sees the distilled tuple.

## 4. Corpus

- **Source options (ranked):** (a) license a real-screen corpus (Refero/Mobbin-style) — fastest, legal clarity is the cost; (b) build our own by running `extract` over a curated allowlist of exemplary public sites — reuses shipped infra, we own the data; (c) hybrid: seed with (b), augment with (a) if pull justifies.
- **Tagging schema** (mirrors R8 structured anchor): `domain`, `density`, `atmosphere`, `layout_grammar`, `interaction_model`, `data_artifacts[]`.
- **Quality bar:** curated, not community-dumped. R5's warning stands — "community-contributed = quality variance → dilutes ship-quality-by-default." Every corpus entry is a deliberate exemplar.

## 5. Retrieval

- Semantic embeddings over the request + tag filters (domain/density hard filters, atmosphere soft rank).
- Reuse or extend the existing TF-IDF/wiki-index machinery as a v0 before reaching for a vector DB — cheaper, already in-tree.
- Cap: 3-5 refs. Token-budgeted against the existing constraint budget (`check-constraint-budget.mjs`) — inspiration block competes for the same budget as contextual RULES_ blocks; must not blow the 4-block discipline's spirit.

## 6. Licensing (the real blocker)

- Corpus of real product screens = legal/licensing exposure. This is why R9 is multi-quarter, not a sprint.
- Distill-to-signal (step 3) materially reduces exposure: we don't redistribute markup, we extract non-copyrightable design *facts* (this palette, this density). Get counsel to confirm before any corpus ships.
- Own-corpus path (4b) via `extract` over public sites still needs a `robots.txt` / ToS check — `extract` already has `robots-check`; reuse it at ingestion time.

## 7. Phasing

1. **R7 first (hard gate).** Without the benchmark harness we cannot prove retrieval beats no-retrieval — it'd be vibes-vs-vibes, exactly the trap codex demolished. R7 is the prerequisite, not optional.
2. **v0 — own corpus, narrow.** 20-40 hand-curated screens in 2-3 domains where CDM is weakest (B2B/logistics/healthcare per R7 stratification). Distill offline. Inject. Measure against R7 baseline.
3. **v1 — retrieval quality.** If v0 moves the benchmark, invest in embeddings + broader corpus.
4. **v2 — licensed corpus** only if own-corpus proves the mechanism and pull justifies the legal spend.

## 8. Relationship to other backlog items

- **R8 (structured anchor)** — shares the tag schema. R9's distilled signal *is* essentially an anchor derived from a real screen. Build the schema once, both consume it.
- **W1 (retrieval telemetry)** — R9 needs W1's measurement to know if injected refs reach *and influence* the prompt. Ship W1 alongside.
- **Tool 1 `extract`** — the ingestion engine for own-corpus path. Already shipped, already thesis-aligned.

## 9. Open questions

1. Own-corpus vs licensed — decide after R7 v0 proves the mechanism cheaply.
2. Distillation: deterministic extractor (like `extract`) vs LLM pass? Start deterministic, add LLM `--semantic` only if signal quality demands.
3. Does the inspiration block help most at Phase 3 (home/style-establishing) only, or every page? Hypothesis: Phase 3 gives the most leverage per token. Test in R7.

---

**One-line thesis:** R9 = "show the AI real screens, extract the *decisions*, throw away the *markup*, still gate on validators." It is `extract` generalized to a curated corpus — the defensible version of every "copy a style" ask, and the reason we don't need 21st.dev.
