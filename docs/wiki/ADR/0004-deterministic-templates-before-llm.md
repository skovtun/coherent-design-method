---
id: ADR-0004
type: adr
status: accepted
date: 2026-04-21
confidence: verified
shipped_in: [0.7.23]
---

# ADR 0004 — Deterministic templates before LLM for vetted shared components

**Status:** Accepted
**Date:** 2026-04-21
**Shipped in:** v0.7.23

## Context

`generateSharedComponentsFromPlan` (Phase 4.5 of the six-phase generation
pipeline) sends every `plan.sharedComponents` entry to the LLM and trusts it to
return correct TSX. For most component shapes this is fine — the AI builds a
reasonable card, toolbar, or section from the props contract.

For **charts**, it isn't fine. PJ-002 tracked the "Chart visualization would
go here" class of regression: the AI cops out with a text stub or an empty
`<div className="h-[300px] bg-muted"/>` instead of real recharts. Coherent
layered fixes across eight releases:

- **v0.6.99** — CORE anti-placeholder rule, `RULES_DATA_DISPLAY` golden
  pattern, plan-level `ensureChartComponentInPlan` auto-injection.
- **v0.7.0** — golden pattern library, keyword-scoped injection.
- **v0.7.17** — `CHART_PLACEHOLDER` autofix (animated skeleton bars). Cosmetic
  fallback, explicitly flagged as not-prevention.

`CHART_PLACEHOLDER` still fires in practice (per `IDEAS_BACKLOG.md#F9`). Three
years of LLM iteration later, the model still picks the placeholder when
generating a known-shape component under prompt pressure. Prevention via
prompt engineering has diminishing returns for this specific shape.

## Decision

For **vetted component shapes** — shapes Coherent already has a complete,
tested TSX reference for — emit the reference verbatim from
`deterministic-templates.ts` and **drop the component from the LLM prompt
entirely**. The LLM is never asked to regenerate something we already have.

v0.7.23 ships this for `StatsChart` (plus chart/graph-named data-display
components). Future candidates: `FilterBar`, `EmptyState`, `StatCard` — all
already have golden patterns under `packages/cli/templates/patterns/` and the
same "AI keeps getting this slightly wrong" failure mode.

### Contract

A deterministic template must:

- Compile standalone against a Next.js + shadcn project.
- Use only semantic tokens (`var(--chart-N)`, `bg-muted`, `text-primary`, …).
- Survive every error-severity rule in `validatePageQuality` with no raw
  colors, no `CHART_PLACEHOLDER`, no `CHART_EMPTY_BOX`.
- Match the `PlannedComponent.props` contract declared in `plan-generator.ts`
  for that component name, so pages can use it the way the plan advertised.

Matching is intentionally narrow. Exact name (`StatsChart`), or a compound
`[X]Chart` / `[X]Graph` name with `type: data-display`. False negatives fall
through to the LLM path (safe). False positives would silently override a
plan author's intent — avoided by strict matching.

## Consequences

**Positive:**

- Zero AI variance at the source for StatsChart — CHART_PLACEHOLDER becomes
  structurally impossible for plans that go through
  `generateSharedComponentsFromPlan`. PJ-002 moves from "mitigated at multiple
  layers" to "prevented at the source".
- One less LLM round-trip when the plan only requests vetted shapes. Cost +
  latency win at the margin (most plans mix shapes, so the round-trip still
  happens for the rest).
- Golden patterns under `packages/cli/templates/patterns/` gain a runtime
  user (previously documentation-only). Updating a template now actually
  ships via the template module — `chart-card.tsx` and the runtime
  `STATS_CHART_TEMPLATE` need to stay in sync, a concrete accountability
  rather than a rule the AI is supposed to follow.

**Negative:**

- The template is frozen per release. A plan author who wants a pie chart
  with a custom legend gets the baked-in layout. Mitigation: narrow matching
  (author-custom names fall through to LLM); shadcn ChartContainer still
  accepts ref overrides at call sites; v0.7.x is opinionated by design.
- Two sources of truth for StatsChart-shaped code: `templates/patterns/`
  (documentation + AI retrieval corpus) and `deterministic-templates.ts`
  (runtime emission). They can drift. Accepted for v0.7.23 to ship the
  prevention layer; consolidation (generate one from the other) is tracked
  as follow-up.

**Why not keep iterating on prompt engineering?**

We already did, across eight releases (v0.6.99 → v0.7.17). Each iteration
moved the bug but didn't eliminate it. The root cause is: "the LLM is
generating a known-shape component under prompt pressure." Removing the
generation call for known shapes removes the root cause. That's the
simplest and most durable fix available.

**Why not ship a React library?**

Coherent deliberately doesn't ship a component library — users own the code,
and a library would reverse that. Emitting the template *into the user's
tree* at generation time preserves ownership while still removing variance.
