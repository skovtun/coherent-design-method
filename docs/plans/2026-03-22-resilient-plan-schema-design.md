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
  "horizontal", "top", "nav", "navbar"      → "header"
  "vertical", "left", "side"                → "sidebar"
  "full", "combined"                        → "both"
  "empty", "minimal", "clean"               → "none"
```

#### `PageNoteSchema.type`

```
Synonyms → Canonical:
  "landing", "public", "home", "website"    → "marketing"
  "application", "dashboard", "admin", "panel" → "app"
  "authentication", "login", "register", "signin", "signup" → "auth"
```

#### `PlannedComponentSchema.type`

```
Synonyms → Canonical:
  "component", "ui", "element", "block"     → "widget"
  "page-section", "hero", "feature", "area" → "section"
```

Each map is a `Record<string, string>`. The normalize function: `(v: string) => MAP[v.toLowerCase()] ?? v.toLowerCase()`. If the value is already canonical, it passes through. If it's an unknown synonym not in the map, `z.enum().pipe()` will still reject it — but the most common AI variations are covered.

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

Inside `generateArchitecturePlan`, when `safeParse` fails:

```typescript
if (!parsed.success) {
  const issues = parsed.error.issues
    .map(i => `${i.path.join('.')}: ${i.message}`)
    .join('; ')
  console.warn(chalk.dim(`  Plan validation (attempt ${attempt + 1}): ${issues}`))
}
```

Inside the `catch` block:

```typescript
catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(chalk.dim(`  Plan generation error (attempt ${attempt + 1}): ${msg}`))
  if (attempt === 1) return null
}
```

This uses `chalk.dim` for quiet output that doesn't alarm users but provides essential diagnostics for debugging. `ora` spinners support interleaved `console.warn` output.

## Files Changed

| File | Change |
|---|---|
| `packages/cli/src/commands/chat/plan-generator.ts` | Synonym maps, schema transforms, defaults, diagnostic logging |
| `packages/cli/src/commands/chat/plan-generator.test.ts` | Tests for synonym normalization, defaults, and diagnostic paths |

## What Does NOT Change

- `split-generator.ts` — no changes needed; the `catch` block there remains as backup
- `ArchitecturePlan` TypeScript type — output types remain identical (transforms normalize inputs, not outputs)
- All consumers of `loadPlan`, `savePlan`, `getPageType`, `getPageGroup` — unchanged
- The `PLAN_SYSTEM_PROMPT` — unchanged; transforms handle AI non-compliance

## Testing

1. **Synonym normalization** — verify each synonym map entry normalizes correctly
2. **Unknown values** — verify that truly invalid values (e.g., `layout: "foobar"`) still fail validation
3. **Missing fields with defaults** — verify a plan with missing `props`, `description`, `sharedComponents` still parses
4. **Diagnostic logging** — verify `console.warn` is called on validation failure
5. **End-to-end** — verify a realistic Claude response with mixed synonyms parses successfully

## Risks

- **Over-permissive transforms**: A synonym map could incorrectly normalize a legitimate value. Mitigation: maps only contain clearly synonymous terms; unknown values pass through to strict validation.
- **Future enum values**: If new layout types are added, synonym maps need updating. Mitigation: maps are co-located with the schema definition.
