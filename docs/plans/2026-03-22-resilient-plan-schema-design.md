# Resilient Plan Schema Design

**Date:** 2026-03-22
**Status:** Approved
**Scope:** `packages/cli/src/commands/chat/plan-generator.ts` + tests

## Problem

Phase 2 of `coherent chat` ("Architecture plan generation") fails silently and consistently. The `generateJSON` API call succeeds, but the AI response fails Zod schema validation because the schema uses strict `z.enum()` values that don't tolerate synonym variations commonly returned by AI models (Claude, OpenAI).

When `ArchitecturePlanSchema.safeParse(raw)` returns `{ success: false }`, the error is completely swallowed — no logging, no diagnostics. The function returns `null`, and the user sees only `⚠ Phase 2/6 — Plan generation failed (continuing without plan)` with no way to understand why.

## Root Cause

Three compounding issues:

1. **Strict enums** — `z.enum(['header', 'sidebar', 'both', 'none'])` rejects valid synonyms like `"horizontal"`, `"top"`, `"nav"` that AI models commonly produce.
2. **Required fields without defaults** — Fields like `props`, `description`, `usedBy` are required with no defaults. If the AI omits any single field, the entire plan is discarded.
3. **Silent failure** — Both `generateArchitecturePlan` and its caller in `split-generator.ts` swallow all errors without diagnostics.

## Solution

### 1. Enum Normalization via Transform

Each enum field gets a synonym map. Pattern: `z.string().transform(normalize).pipe(z.enum([...]))`.

#### `RouteGroupSchema.layout`

```
Synonyms → Canonical:
  "horizontal", "top", "nav", "navbar", "topbar", "top-bar" → "header"
  "vertical", "left", "side", "drawer"                      → "sidebar"
  "full", "combined"                                        → "both"
  "empty", "minimal", "clean"                               → "none"
```

#### `PageNoteSchema.type`

```
Synonyms → Canonical:
  "landing", "public", "home", "website", "static"          → "marketing"
  "application", "dashboard", "admin", "panel", "console"   → "app"
  "authentication", "login", "register", "signin", "signup" → "auth"
```

Note: `"public"` maps to `"marketing"` because in the plan context it refers to unauthenticated landing/marketing pages, not "public API". This is the dominant AI interpretation given the prompt context.

#### `PlannedComponentSchema.type`

```
Synonyms → Canonical:
  "component", "ui", "element", "block"     → "widget"
  "page-section", "hero", "feature", "area" → "section"
```

Each map is a `Record<string, string>`. The normalize function: `(v: string) => MAP[v.trim().toLowerCase()] ?? v.trim().toLowerCase()`. The `.trim()` guards against whitespace-padded values. If the value is already canonical, it passes through unchanged. If it's an unknown synonym not in the map, the downstream `z.enum()` inside `.pipe()` will still reject it — but the most common AI variations are covered.

The Zod chain works as: input string → `.transform(normalize)` produces a normalized string → `.pipe(z.enum([...]))` validates the normalized string against the allowed values.

### 2. Safe Defaults

| Field | Current | New |
|---|---|---|
| `PlannedComponent.props` | `z.string()` (required) | `z.string().default('{}')` |
| `PlannedComponent.description` | `z.string()` (required) | `z.string().default('')` |
| `PlannedComponent.usedBy` | `z.array(z.string())` (required) | `z.array(z.string()).default([])` |
| `PageNote.sections` | `z.array(z.string())` (required) | `z.array(z.string()).default([])` |
| `ArchitecturePlan.sharedComponents` | `z.array(...).max(8)` (required) | `z.array(...).max(8).default([])` |
| `ArchitecturePlan.pageNotes` | `z.record(...)` (required) | `z.record(...).default({})` |

These defaults mean a partially valid AI response can still produce a usable plan. A plan with groups but no sharedComponents is still valuable — it drives navigation layout.

### 3. Diagnostic Logging

Diagnostics are collected as strings and returned alongside the result, rather than emitting `console.warn` directly. This avoids garbled output when an `ora` spinner is active in the caller (`split-generator.ts`).

#### Approach: collect-and-return

`generateArchitecturePlan` returns `{ plan, warnings }` instead of just `plan`:

```typescript
interface PlanResult {
  plan: ArchitecturePlan | null
  warnings: string[]
}
```

Inside the function, warnings accumulate:

```typescript
const warnings: string[] = []

// on safeParse failure:
if (!parsed.success) {
  warnings.push(`Validation (attempt ${attempt + 1}): ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
}

// on catch:
catch (err) {
  warnings.push(`Error (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`)
}

return { plan, warnings }
```

The caller in `split-generator.ts` logs warnings **after** stopping the spinner:

```typescript
const { plan: generatedPlan, warnings } = await generateArchitecturePlan(...)
plan = generatedPlan
if (plan) {
  spinner.succeed('Phase 2/6 — Architecture plan created')
} else {
  spinner.warn('Phase 2/6 — Plan generation failed (continuing without plan)')
}
for (const w of warnings) {
  console.log(chalk.dim(`  ${w}`))
}
```

This ensures no output during spinner animation.

#### `updateArchitecturePlan`

Same pattern: the `catch` block before the deterministic merge logs a warning. Since `updateArchitecturePlan` always returns a plan (via merge fallback), warnings are informational:

```typescript
catch (err) {
  console.warn(chalk.dim(`  Plan update via AI failed, using deterministic merge: ${err instanceof Error ? err.message : String(err)}`))
}
```

`updateArchitecturePlan` is called outside of a spinner context, so direct `console.warn` is safe here.

## Files Changed

| File | Change |
|---|---|
| `packages/cli/src/commands/chat/plan-generator.ts` | Synonym maps, schema transforms, defaults, diagnostic logging, `PlanResult` return type |
| `packages/cli/src/commands/chat/plan-generator.test.ts` | Tests for synonym normalization, defaults, diagnostic warnings, and `updateArchitecturePlan` schema relaxation |
| `packages/cli/src/commands/chat/split-generator.ts` | Adapt to `PlanResult` return type, log warnings after spinner |

## What Does NOT Change

- `ArchitecturePlan` TypeScript type — output types remain identical (transforms normalize inputs, not outputs)
- All consumers of `loadPlan`, `savePlan`, `getPageType`, `getPageGroup` — unchanged
- The `PLAN_SYSTEM_PROMPT` — unchanged; transforms handle AI non-compliance

## Testing

1. **Synonym normalization** — verify each synonym map entry normalizes correctly (all three enums)
2. **Whitespace trimming** — verify `" sidebar "` normalizes to `"sidebar"`
3. **Unknown values** — verify that truly invalid values (e.g., `layout: "foobar"`) still fail validation
4. **Missing fields with defaults** — verify a plan with missing `props`, `description`, `sharedComponents`, `pageNotes` still parses
5. **Diagnostic warnings** — verify `generateArchitecturePlan` returns warnings array on validation failure
6. **End-to-end** — verify a realistic Claude response with mixed synonyms parses successfully
7. **`updateArchitecturePlan` with relaxed schema** — verify that `updateArchitecturePlan` benefits from the same schema relaxations (synonym normalization and defaults)

## Risks

- **Over-permissive transforms**: A synonym map could incorrectly normalize a legitimate value. Mitigation: maps only contain clearly synonymous terms; unknown values pass through to strict validation.
- **Future enum values**: If new layout types are added, synonym maps need updating. Mitigation: maps are co-located with the schema definition.
