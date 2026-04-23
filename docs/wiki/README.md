# Coherent Platform Wiki

Karpathy-style LLM wiki for the Coherent platform itself — facts and decisions that compound across development sessions so we (human + Claude) don't re-derive them from scratch each time.

## Contents

- [**ADR/**](./ADR/) — Architectural Decision Records. One file per significant design shift, with YAML frontmatter, context, decision, consequences, why-nots.
- [**PATTERNS_JOURNAL.md**](./PATTERNS_JOURNAL.md) — Append-only log of AI-output failure patterns observed in the wild, root causes, and how we responded. Each entry has `### PJ-NNN — Title` heading with YAML frontmatter (id, type, confidence, status, date, fixed_in, evidence). IDs assigned in observation order (sequential, three-digit zero-padded).
- [**MODEL_PROFILE.md**](./MODEL_PROFILE.md) — Empirical notes on how Claude Sonnet 4 behaves with Coherent's prompts. Updates when a systematic pattern shows up across multiple runs.
- [**RULES_MAP.md**](./RULES_MAP.md) — Living index of every rule in `design-constraints.ts` with origin bug, validator, golden pattern, and version history. Has auto-generated and hand-maintained sections.
- [**IDEAS_BACKLOG.md**](./IDEAS_BACKLOG.md) — Open / deferred / shipped ideas. Each open/deferred idea is `### ID — Title` with YAML frontmatter so retrieval can rank by status/target. Shipped items use `####` so they don't bloat retrieval.
- [**BENCH.yaml**](./BENCH.yaml) — retrieval quality benchmark. `coherent wiki bench` checks precision@1 ≥ 0.8.

## Memory feedback loop

Two sides, connected by curator-in-the-loop:

**Write side** (captures raw observed state):
- `coherent fix --journal` → `.coherent/fix-sessions/TIMESTAMP.yaml` (one session per run, per-severity validator tallies + sample paths)
- `coherent wiki reflect` → appends structured PJ / model-note / idea entries to wiki files

**Read side** (retrieves captured state):
- `coherent wiki index` → rebuilds TF-IDF cache at `.coherent/wiki-index.json`
- `coherent wiki search <q>` → top-5 matches with scores
- `coherent journal list` / `aggregate` → ranks validators across all captured sessions
- At chat-time, `coherent chat` internally retrieves relevant wiki snippets and injects them into the prompt

**Curator loop:** after a significant session, run `coherent journal aggregate` → see top validators → decide which deserve a PJ entry → `coherent wiki reflect` → commit. Next session's AI gets it via retrieval.

See ADR-0002 for architecture rationale.

## Not here (intentionally)

- `docs/CHANGELOG.md` — release chronology. Complements the wiki; doesn't replace it.
- `.coherent/wiki/decisions.md` in generated projects — per-project design decisions for the user's Next.js app. Different audience (see `design-memory.ts`).
- `~/.claude/projects/.../memory/` — my own Claude Code memory across sessions. Personal, not shared.

## How to use

**Starting a new session working on Coherent?**
CLAUDE.md requires reading `PATTERNS_JOURNAL.md`, `RULES_MAP.md`, `MODEL_PROFILE.md`, `IDEAS_BACKLOG.md`, and any new ADRs first. Most bugs you'll encounter are variations of something already seen.

**About to add a rule to `design-constraints.ts`?**
Check `RULES_MAP.md` to see if a related rule already exists. Run `node packages/cli/scripts/generate-rules-map.mjs` after edits to refresh the auto-generated section.

**Seeing AI behave strangely?**
Check `MODEL_PROFILE.md`. If the behavior is there, you know the mitigation. If new, add an observation with today's date via `coherent wiki reflect`.

**Making a structural change (new subsystem, architecture refactor)?**
Write an ADR in `ADR/NNNN-short-slug.md`. Use ADR-0001 / ADR-0002 / ADR-0003 as templates. YAML frontmatter required (id, date, status, confidence, shipped_in).

**End of a significant work session?**
1. `coherent fix --journal` (if the session touched any project).
2. `coherent journal aggregate` — see top validators.
3. `coherent wiki reflect` — capture bugs / model notes / ideas.
4. Commit wiki changes alongside feature commits.

**Before pushing?**
`coherent wiki audit` — catches stub files, missing PJ fix/evidence/confidence, RULES_MAP superseded_by issues, missing CLAUDE.md wiki references.

## How to maintain

- **Append, don't delete.** When a rule is deprecated, mark with date + reason; don't remove the row.
- **Link entries** to the bug that prompted them (sha references, PJ-NNN cross-refs).
- **Each indexable entry needs frontmatter** — id, type, confidence, date. Without `date:` the freshness-decay in `retrieve()` is neutral (1.0) — old entries don't get downweighted.
- **ID schemes stay canonical.** PJ-NNN sequential (three-digit). ADR-NNNN (four-digit). Idea prefixes by cluster (F/M/N/W/J/A/R).
- **Don't let this turn into a CHANGELOG clone.** CHANGELOG answers "what changed in this release". Wiki answers "why things are the way they are".

## Tooling reference

| Command | Purpose | Where it reads / writes |
|---------|---------|-------------------------|
| `coherent wiki reflect` | Capture new PJ / model note / idea via $EDITOR | Appends to wiki files |
| `coherent wiki audit` | Check wiki hygiene | Reads all wiki files; exit 1 on errors |
| `coherent wiki index` | Rebuild TF-IDF cache | Writes `.coherent/wiki-index.json` |
| `coherent wiki search <q>` | Query the index | Reads cache, prints top-K |
| `coherent wiki bench` | Retrieval quality benchmark | Reads BENCH.yaml; exit 1 if precision@1 < 0.8 |
| `coherent fix --journal` | Capture fix session for later aggregation | Writes `.coherent/fix-sessions/*.yaml` |
| `coherent journal list` | List captured fix sessions | Reads fix-sessions/ |
| `coherent journal aggregate` | Rank validators by recurrence across sessions | Reads fix-sessions/ |
