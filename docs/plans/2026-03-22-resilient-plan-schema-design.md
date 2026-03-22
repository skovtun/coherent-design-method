# Resilient Plan Schema Design

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Plan schema resilience + warning noise reduction

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

`updateArchitecturePlan` is called outside of a spinner context, so direct `console.warn` is safe. Diagnostics cover **both** failure modes:

1. **`safeParse` validation failure** (AI returns JSON but schema rejects it):

```typescript
if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
  console.warn(chalk.dim(`  Plan update validation failed: ${issues}`))
  // fall through to deterministic merge
}
```

2. **API/parse error** (network failure, invalid JSON):

```typescript
catch (err) {
  console.warn(chalk.dim(`  Plan update error: ${err instanceof Error ? err.message : String(err)}`))
  // fall through to deterministic merge
}
```

Both paths log the specific reason before falling through to the deterministic merge fallback. This is a different mechanism from `generateArchitecturePlan`'s collect-and-return pattern because `updateArchitecturePlan` runs without an active spinner.

### 4. Reduce Warning Noise in `warnInlineDuplicates`

When no plan is available (`plan = null`), `warnInlineDuplicates` falls back to a token-overlap algorithm that checks every shared component against every page. The current threshold (`overlap >= 12 && sharedTokens.size >= 10`) is too low — generic UI tokens like `className`, `flex`, `Card`, `Button`, `items-center`, `p-6` trigger false positives on every page.

**Observed in log:** FeatureCard, PricingCard, TestimonialCard warn on **every** page including Login, Reset Password, Dashboard — ~50 false positives per run.

#### Fix: higher threshold + overlap ratio

Replace:
```typescript
if (overlap >= 12 && sharedTokens.size >= 10) {
```

With:
```typescript
const overlapRatio = overlap / sharedTokens.size
if (overlap >= 20 && overlapRatio >= 0.6) {
```

This requires both a high absolute overlap count (20+) AND that 60%+ of the shared component's tokens appear in the page. Generic UI tokens contribute to `overlap` but the ratio check ensures the match is meaningful.

**Why not filter generic tokens?** Maintaining a stopword list is fragile and would need constant updates as Tailwind/shadcn evolve. The ratio approach is self-calibrating.

### 5. Fix Duplicate Auto-Scaffold Entries

The log shows `Tasks/new → /tasks/new` listed twice in the auto-scaffold report, and both `Register (/register)` and `Signup (/signup)` exist as separate pages.

#### 5a. Deduplicate scaffold report

In the auto-scaffold reporting section of `split-generator.ts`, deduplicate entries by route before printing:

```typescript
const uniqueScaffolded = [...new Map(scaffolded.map(s => [s.route, s])).values()]
```

#### 5b. Extend `deduplicatePages` to auto-scaffolded pages

The existing `deduplicatePages` with `AUTH_SYNONYMS` only runs on the initial page list (Phase 1). Auto-scaffolded pages (created via `inferRelatedPages` and auto-scaffold) bypass this check. Apply the same deduplication before creating auto-scaffold pages:

- Before scaffolding, check if a synonym route already exists in the planned pages
- e.g., if `/register` exists, skip `/signup` (and vice versa)

## Files Changed

| File | Change |
|---|---|
| `packages/cli/src/commands/chat/plan-generator.ts` | Synonym maps, schema transforms, defaults, diagnostic logging, `PlanResult` return type |
| `packages/cli/src/commands/chat/plan-generator.test.ts` | Tests for synonym normalization, defaults, diagnostic warnings, `updateArchitecturePlan` schema relaxation |
| `packages/cli/src/commands/chat/split-generator.ts` | Adapt to `PlanResult` return type, log warnings after spinner, deduplicate scaffold report |
| `packages/cli/src/commands/chat/utils.ts` | Raise token-overlap threshold in `warnInlineDuplicates` |
| `packages/cli/src/commands/chat/utils.test.ts` | Test new overlap threshold behavior |

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
7. **`updateArchitecturePlan` with relaxed schema** — verify that `updateArchitecturePlan` benefits from the same schema relaxations
8. **Token-overlap threshold** — verify that a shared component with 12 generic token matches no longer triggers a warning; verify that 20+ matches with 60%+ ratio still triggers
9. **Scaffold deduplication** — verify duplicate routes are removed from scaffold report

## Risks

- **Over-permissive transforms**: A synonym map could incorrectly normalize a legitimate value. Mitigation: maps only contain clearly synonymous terms; unknown values pass through to strict validation.
- **Future enum values**: If new layout types are added, synonym maps need updating. Mitigation: maps are co-located with the schema definition.
- **Higher overlap threshold may miss real duplicates**: Raising from 12 to 20 could cause genuine near-duplicates to slip through. Mitigated by: (a) when plan exists, threshold is irrelevant (plan-aware path is used); (b) the 0.6 ratio ensures semantic similarity, not just token count.
