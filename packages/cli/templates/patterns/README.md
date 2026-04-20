# Golden Patterns

This directory contains reference implementations for common UI patterns. They
are the **ground truth** that `coherent chat` points the AI at when generating
matching UI.

Each pattern is a complete, self-contained component you can read directly:

- [`filter-bar.tsx`](./filter-bar.tsx) — search + filter selects + date range above a list/table
- [`stat-card.tsx`](./stat-card.tsx) — compact metric card with trend arrow
- [`empty-state.tsx`](./empty-state.tsx) — friendly no-data message + primary CTA
- [`chart-card.tsx`](./chart-card.tsx) — shadcn Chart + recharts (area/bar/line)

## Why golden patterns instead of word-based rules

Word-based rules ("filter bar should be one row with flex-wrap") get
interpreted by the LLM. In practice, interpretation is loose — three different
filter-bar regressions in two days prompted this library.

A complete code example removes interpretation. The AI either copies it
verbatim or adapts it. Either way, structure is preserved.

## Contract

These files are not imported by the CLI or copied into generated projects.
They are documentation for the AI (via prompt injection) and for humans
reading `design-constraints.ts` asking "what does a correct version look like?"

If you update a pattern, the next release automatically updates the rule
reference in `CORE_CONSTRAINTS` / `RULES_DATA_DISPLAY` / etc.
