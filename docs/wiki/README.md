# Coherent Platform Wiki

Karpathy-style LLM wiki for the Coherent platform itself — facts and decisions that compound across development sessions so we (human + Claude) don't re-derive them from scratch each time.

## Contents

- [**ADR/**](./ADR/) — Architectural Decision Records. One file per significant design shift, with context, decision, and consequences.
- [**PATTERNS_JOURNAL.md**](../PATTERNS_JOURNAL.md) — Append-only log of AI-output failure patterns we've observed in the wild, root causes, and how we responded. Format: bug → cause → rule/validator → version.
- [**MODEL_PROFILE.md**](./MODEL_PROFILE.md) — Empirical notes on how Claude Sonnet 4 behaves with Coherent's prompts. Updates when a systematic pattern shows up across multiple runs.
- [**RULES_MAP.md**](./RULES_MAP.md) — Living index of every rule in `design-constraints.ts` with origin bug, validator, golden pattern, and version history.

## Not here (intentionally)

- `docs/CHANGELOG.md` — release chronology. Complements the wiki; doesn't replace it.
- `.coherent/wiki/decisions.md` in generated projects — per-project design decisions for the user's Next.js app. Different audience.
- `~/.claude/projects/.../memory/` — my own Claude Code memory across sessions. Personal, not shared.

## How to use

**Starting a new session working on Coherent?**
Read `PATTERNS_JOURNAL.md` first. Most bugs you'll encounter are variations of something we've already seen. Look for the PJ-NNN entry before debugging from scratch.

**About to add a rule to `design-constraints.ts`?**
Check `RULES_MAP.md` to see if a related rule already exists. Add a row when you ship.

**Seeing AI behave strangely?**
Check `MODEL_PROFILE.md`. If the behavior is there, you know the mitigation. If it's new, add an observation with today's date.

**Making a structural change (new subsystem, architecture refactor)?**
Write an ADR in `ADR/NNNN-short-slug.md`. Use 0001 as template.

## How to maintain

- Append, don't delete. When a rule is deprecated, mark it with a date, don't remove the row.
- Link entries to the bug that prompted them.
- Don't let this turn into a CHANGELOG clone. CHANGELOG answers "what changed in this release". Wiki answers "why things are the way they are".
