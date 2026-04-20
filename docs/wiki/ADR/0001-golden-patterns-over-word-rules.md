# ADR 0001 — Golden patterns over word-based rules

**Status:** Accepted
**Date:** 2026-04-19
**Shipped in:** v0.7.0

## Context

Coherent's design-constraints.ts grew to ~5400 tokens of rules like:

> FILTER BAR / TOOLBAR: ONE row on desktop: `<div className="flex flex-wrap items-center gap-3 mb-4">...`. Search flex-1. All controls h-10. Search icon inside relative wrapper with pl-9 on Input.

These are precise rules. The AI still got filter bars wrong **three times in two days**:

- PJ-006a: duplicated Categories filter (Select + Button for same dimension).
- PJ-006b: search icon rendered as sibling of Input (ended up above the field).
- PJ-006c: heights mismatched (h-8 vs h-10 mixed).

Each failure was a loose interpretation of the same rule. The LLM read "flex-wrap items-center gap-3" as "use some flex" and improvised the rest.

## Decision

Shift from **word-based rules the AI interprets** to **golden pattern references the AI copies verbatim**.

Starting v0.7.0:

1. Canonical patterns live at `packages/cli/templates/patterns/*.tsx`. These are real, working TSX files — documentation for humans AND the ground truth the AI points at.

2. `src/agents/golden-patterns.ts` inlines pattern content as strings and exposes `pickGoldenPatterns(message)` — selects the relevant patterns based on keyword match.

3. Every chat prompt includes matching golden patterns under a "GOLDEN PATTERN REFERENCES (copy STRUCTURE exactly)" heading.

4. Word-based rules stay, but become **constraints on deviation** rather than full recipes: "use the shadcn Button variant, prefer h-10 height" — the pattern file is the concrete demonstration.

## Consequences

### Wins

- The three filter-bar failure modes could not have happened if AI copied the pattern. Each detail (search icon absolute, pl-9, h-10, min-w-[240px]) is in the pattern source.
- Token cost is scoped: patterns load only when keyword matches. Base prompt cost grows only ~50-100 tokens per loaded pattern.
- Human contributors can read the patterns directly — no rule-interpretation required. If you want to know what a correct filter bar looks like, open the file.

### Costs

- Patterns duplicated between `.tsx` source files and inline strings in `golden-patterns.ts`. Future release adds codegen to sync them.
- New pattern = new file + new inline string + new keyword regex. Three touch points; easy to forget one.
- Patterns are pseudo-code (JSX fragments with `{/* ... */}` placeholders) — not actual imports that tree-shake away unused examples. That's fine for documentation but means tests can't execute them.

### Measured effect

(To be backfilled after v0.7.0 is in user hands for a week. Current: three filter-bar regressions across v0.6.98, v0.6.99, v0.6.100. Target: zero filter-bar regressions in v0.7.x without re-introducing new failure classes.)

## Why not...

- **Full code-gen from schema?** JSON-schema-driven UI generation is fragile and produces generic output — the thing Coherent specifically avoids. Patterns preserve designer intent.

- **More specific word rules?** Tried it. Word rules of arbitrary specificity get interpreted loosely. The LLM is pattern-completing at temperature, not executing a spec.

- **Inline patterns in CORE_CONSTRAINTS?** Would add ~1200 tokens to every prompt regardless of relevance. Current approach (keyword-scoped) scopes cost to actual need.

## References

- Bug that prompted: PJ-006 in `docs/PATTERNS_JOURNAL.md`.
- Code: `packages/cli/templates/patterns/`, `packages/cli/src/agents/golden-patterns.ts`.
- Changelog: `docs/CHANGELOG.md` → v0.7.0.
