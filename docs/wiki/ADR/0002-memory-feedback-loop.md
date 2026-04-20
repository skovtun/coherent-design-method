---
id: ADR-0002
type: adr
status: accepted
date: 2026-04-20
confidence: established
shipped_in: [0.7.2, 0.7.3, 0.7.4, 0.7.18, 0.7.19]
supersedes: []
---

# ADR 0002 — Memory feedback loop (platform wiki + fix session journal)

**Status:** Accepted
**Date:** 2026-04-20
**Shipped in:** v0.7.2 (wiki write) · v0.7.3–v0.7.4 (wiki retrieval) · v0.7.18 (journal write) · v0.7.19 (journal aggregate)

## Context

By v0.7.1 Coherent had a rich rule system but no structural memory:

1. Every fix session re-derived "what's broken on this project" from scratch. A validator that fired 30 times across 5 sessions looked identical to a one-off bug — no ranking, no aggregation.
2. `PATTERNS_JOURNAL.md` captured observed failure patterns, but had to be hand-authored from a blank page. High curator friction → entries lagged behind the actual bug stream.
3. `docs/wiki/*` held institutional knowledge (RULES_MAP, MODEL_PROFILE, ADRs) but the AI at generation time had no access to it. Rules reached Claude; accumulated wisdom didn't.
4. The chat pipeline (split-generator.ts) accepted user message + design-constraints + golden patterns. It did not know what past sessions learned. Every project started as if the platform had no prior experience.

The loss of learned signal was the single biggest limiter on rule evolution. Rated **6.5/10** in internal memory capability audit around v0.7.8 — rules were strong, memory was weak.

## Decision

Build a two-sided loop between wiki (human-curated knowledge) and fix sessions (raw observed state).

### Write side — capture

- **v0.7.2** `coherent wiki reflect` + `coherent wiki audit` CLI. Auto-generates parts of RULES_MAP.md from code. Hand-maintained section stays for *why*.
- **v0.7.18** `coherent fix --journal` opt-in flag. Writes YAML summary of each fix run to `.coherent/fix-sessions/TIMESTAMP.yaml`:
  - coherent version in project
  - which auto-fixers fired
  - error/warning/info totals
  - per-severity grouping: validator type, count, up to 5 sample `{path, line}` pairs

### Read side — retrieve

- **v0.7.3–v0.7.4** TF-IDF index over `docs/wiki/*`. `coherent wiki retrieve <query>` surfaces relevant snippets. Chat pipeline reads platform memory at chat-time — AI now sees past lessons before generating.
- **v0.7.19** `coherent journal list` + `coherent journal aggregate`. Aggregate ranks validators by recurrence across ALL captured sessions; flags validators appearing in 3+ sessions as `PATTERNS_JOURNAL.md` candidates.

### Format decisions

- **YAML for journal, not JSON.** Human-scannable, diff-friendly in commits if users choose to check in their `.coherent/fix-sessions/`. Narrow stable shape owned by this repo.
- **Handwritten state-machine parser for YAML, not a library dep.** The shape is narrow and stable; format changes land in one commit with both writer and reader. No 200KB dep for a dozen fields.
- **Sample paths deduplicated, cap at 5 per validator.** Enough for a curator to spot-check without drowning in noise.

## Consequences

### Wins

- Curator starts from prioritized raw material: "CHART_PLACEHOLDER fired in 6 of 11 sessions" is a PJ-entry candidate. Blank-page friction gone.
- AI at generation time now sees platform memory via TF-IDF retrieval. Rules + past-lesson context → fewer regressions of already-seen bugs.
- Smoke-test feedback no longer evaporates. The v0.7.17 CHART_PLACEHOLDER autofix existed because a human looked at journal data and saw the pattern.
- Write side and read side are independently useful: journal aggregate is valuable even without wiki retrieval; wiki retrieval is valuable even without journal.

### Costs

- Two storage locations to reason about: `docs/wiki/*` (curated, in repo) vs `.coherent/fix-sessions/*` (raw, per-project, typically gitignored). Easy to confuse.
- Journal retention is unbounded — no auto-prune yet. Tracked as **J2** in IDEAS_BACKLOG.
- Aggregate output stops short of drafting PJ entries. Human still synthesizes "root cause" and "fix" fields. **J1** (`journal reflect`) closes that.
- Wiki retrieval hit-rate is not measured — we don't know if retrieved snippets actually influenced generation. Tracked as **W1**.
- Narrow handwritten YAML parser is a liability if format evolves beyond its assumptions. Acceptable because writer and reader ship together — but any contributor changing the format needs to touch both sides.

### Measured effect

Rating bumped from 6.5/10 (v0.7.8) to unmeasured-but-qualitatively-better (v0.7.19). Next measurement: compare fix-session validator distributions across v0.7.1 and v0.7.20 on the same test project.

## Why not...

- **In-memory session state?** The whole point is persistence across sessions and across users. In-memory dies with the process.
- **SQLite / Redis?** Heavyweight for flat append-only logs. YAML + TF-IDF handles current volume (thousands of entries) trivially.
- **Embedding-based retrieval (vector store)?** Considered. TF-IDF was sufficient for tested queries and has zero deps. Vector retrieval is open option when the wiki corpus grows past TF-IDF's effective range (heuristic: ~500 short docs).
- **Auto-draft PJ entries directly (skip aggregate → reflect split)?** Risk: auto-drafted hypotheses with no human gate would pollute the journal with noise. Split keeps curation authority with a human.
- **LLM-in-the-loop for aggregate synthesis?** Overkill. Validator recurrence is a counting problem, not a reasoning problem. Counts are authoritative; interpretation is human.

## References

- CHANGELOG entries: v0.7.2, v0.7.3, v0.7.4, v0.7.18, v0.7.19.
- Open follow-ups: **J1** (journal reflect), **J2** (retention policy), **W1** (retrieval telemetry), **W2** (stale-entry detector) — all in IDEAS_BACKLOG.md.
- Related ADR: ADR-0001 (golden patterns). Golden patterns feed rule evolution; memory loop measures whether that evolution lands.
