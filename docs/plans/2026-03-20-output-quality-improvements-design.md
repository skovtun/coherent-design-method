# Output Quality Improvements — Design Document

> Date: 2026-03-20
> Scope: 7 fixes to improve `coherent chat` output quality, reduce noise, and eliminate false positives.

## Context

Analysis of a real `coherent chat` run generating a 15-page ProjectFlow SaaS app revealed systematic issues in the CLI output pipeline. These range from incorrect version display to false validation warnings and incomplete auto-fixes.

## Problem Summary

| ID | Severity | Problem |
|----|----------|---------|
| A | Critical | `CLI_VERSION = '0.1.0'` hardcoded in `versions.ts`, out of sync with `package.json` (0.5.3) |
| B | Critical | Pages with empty `pageCode` in split-generator path have no retry mechanism |
| C | High | BROKEN_INTERNAL_LINK fires per-page during creation → false positives for later pages |
| D | Medium | Pre-flight component install message prints once per page instead of once total |
| E | Medium | `autoFixCode` misses color names (red, green, yellow, pink, orange, fuchsia, lime) and shade ranges (300, 400, 900) |
| F | Medium | AI auto-fix threshold (`>= 5` errors) too high — most pages with 1-4 errors skip auto-fix |
| G | Low | Native `<select>` elements not auto-fixed to shadcn Select component |

## Designs

### A. CLI_VERSION — single source of truth

**Current:** `packages/core/src/versions.ts` exports `CLI_VERSION = '0.1.0'` (manually maintained).

**Design:** Remove the hardcoded constant. Read version from `package.json` at runtime.

```typescript
// packages/core/src/versions.ts
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Read from package.json at import time
const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
export const CLI_VERSION: string = pkg.version
```

If `versions.ts` is in `core` but the CLI version lives in `cli/package.json`, the consumer (`update-notifier.ts` in `cli`) should read its own `package.json` instead. Evaluate during implementation which package owns the version.

**Test:** Unit test asserting `CLI_VERSION` matches `package.json`.

---

### B. Retry for empty pages in split-generator

**Current:** `splitGeneratePages` (Phase 4) generates each page via a separate AI call. If `pageCode` comes back empty, the page is created without code. No retry.

The non-split path in `chat.ts:276-301` has retry logic, but it never runs because the split path is used for >= 4 pages.

**Design:** After Phase 4 completes, collect pages without `pageCode` and retry each one individually (same pattern as the existing retry in `chat.ts`).

```typescript
// In splitGeneratePages, after remainingRequests are collected:
const emptyPages = allRequests.filter(
  r => r.type === 'add-page' && !(r.changes as any)?.pageCode
)
if (emptyPages.length > 0) {
  for (const req of emptyPages) {
    const page = req.changes as any
    const retryResult = await parseModification(
      `Create a page called "${page.name}" at route "${page.route}". Generate complete pageCode.`,
      modCtx, provider, parseOpts,
    )
    const codePage = retryResult.requests.find(r => r.type === 'add-page')
    if (codePage?.changes?.pageCode) {
      const idx = allRequests.indexOf(req)
      if (idx !== -1) allRequests[idx] = codePage
    }
  }
}
```

Limit: one retry attempt per page. If still empty after retry, keep the warning.

---

### C. Deferred BROKEN_INTERNAL_LINK validation

**Current:** `validatePageQuality(code, validRoutes)` runs inside `applyModification` immediately after each page is written. `validRoutes` only contains pages created so far.

**Design:** Two-phase validation.

1. **During creation:** Run `validatePageQuality(code)` WITHOUT `validRoutes` — skip link validation entirely.
2. **After all modifications + auto-scaffold:** Run a single deferred link validation pass over all created/updated page files.

Implementation in `chat.ts`:

```typescript
// After the main modification loop AND auto-scaffold:
const allRoutes = updatedConfig.pages.map(p => p.route)
for (const filePath of allCreatedPageFiles) {
  const code = readFileSync(filePath, 'utf-8')
  const linkIssues = validatePageQuality(code, allRoutes)
    .filter(i => i.type === 'BROKEN_INTERNAL_LINK')
  if (linkIssues.length > 0) {
    // print warnings
  }
}
```

In `modification-handler.ts`, stop passing `validRoutes` to `validatePageQuality` in the `add-page` and `update-page` cases. The function already works without it (link checks are skipped when `validRoutes` is undefined).

---

### D. Consolidated pre-flight component install

**Current:** In `chat.ts:354-384`, a `for` loop iterates over page requests. Each page checks for missing components and prints the install message individually.

**Design:** Collect all needed component IDs across all pages first, compute a single set of missing components, install once, print once.

```typescript
// Before:
for (const pageRequest of pageRequests) {
  // per-page install + print
}

// After:
const allNeeded = new Set<string>()
for (const pageRequest of pageRequests) {
  // collect needed IDs into allNeeded
}
const missing = [...allNeeded].filter(id => !cm.read(id))
if (missing.length > 0) {
  console.log('🔍 Pre-flight check: Installing missing components...')
  for (const id of missing) { /* install */ }
}
```

---

### E. Complete RAW_COLOR auto-fix coverage

**Current:** `autoFixCode` in `quality-validator.ts:666-735` handles accent colors `(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber)` and neutrals `(zinc|slate|gray|neutral|stone)`. Missing: `red`, `green`, `yellow`, `pink`, `orange`, `fuchsia`, `lime`. Also missing shade ranges: 300, 400, 900 for bg/text/border.

**Design:** Expand the regex and mapping:

| Color | Mapping |
|-------|---------|
| red | destructive / destructive-foreground |
| green | primary (success context) |
| yellow, orange, amber | warning (muted with accent) |
| pink, fuchsia, rose | accent / primary |
| lime | primary (success context) |

Complete all shade mappings:

| Shade | bg → | text → | border → |
|-------|------|--------|----------|
| 50-200 | bg-primary/10 or bg-muted | text-muted-foreground | border-border |
| 300-400 | bg-primary/20 | text-muted-foreground | border-primary/30 |
| 500-700 | bg-primary | text-primary-foreground | border-primary |
| 800-950 | bg-muted | text-foreground | border-border |

---

### F. Lower AI auto-fix threshold

**Current:** `modification-handler.ts:624`: `if (errors.length >= 5 && aiProvider)`.

**Design:** Lower to `>= 2`. One error could be noise; two errors is a pattern worth fixing.

```typescript
if (errors.length >= 2 && aiProvider) {
```

---

### G. NATIVE_SELECT auto-fix + prompt prevention

**Design (two layers):**

**Layer 1 — Prompt prevention:** Add to `modifier.ts` surgical rules:

```
- NEVER use native HTML <select>. Always use Select, SelectTrigger, SelectContent, SelectItem from @/components/ui/select.
```

**Layer 2 — Auto-fix in `autoFixCode`:** Pattern-match native `<select>` and replace with shadcn Select. This is more complex than `<button> → <Button>` because `<select>` has `<option>` children that map to `SelectItem`. Implementation:

1. Find `<select ...>...</select>` blocks.
2. Extract `<option>` values and labels.
3. Replace with `<Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{items}</SelectContent></Select>`.
4. Add import for Select components.

If the regex replacement is too fragile for complex selects, fall back to just flagging + AI auto-fix (threshold is now 2, so it will trigger).

## Task Order

1. **A** — CLI_VERSION (trivial, high impact, zero risk)
2. **D** — Pre-flight consolidation (isolated, clean output)
3. **F** — Lower threshold (one-line change)
4. **E** — RAW_COLOR coverage (expand existing code)
5. **G** — NATIVE_SELECT (prompt + autofix)
6. **C** — Deferred link validation (architectural, touches chat.ts + modification-handler)
7. **B** — Split-generator retry (touches AI pipeline, needs careful testing)

## Risks

- **E (RAW_COLOR):** Over-aggressive replacement could break intentional color usage (e.g., status indicators). Mitigation: preserve context-aware skipping (terminal blocks, code blocks).
- **G (NATIVE_SELECT):** Regex replacement of `<select>` is fragile for complex forms with onChange handlers. Mitigation: only replace simple cases; rely on AI auto-fix (threshold lowered to 2) for complex ones.
- **C (Deferred validation):** Users lose per-page feedback during creation. Mitigation: keep all non-link validations per-page; only defer BROKEN_INTERNAL_LINK.
- **B (Retry):** Extra AI call per empty page adds latency and cost. Mitigation: cap at 1 retry; already accepted pattern in non-split path.
