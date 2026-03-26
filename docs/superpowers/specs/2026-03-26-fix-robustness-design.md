# Fix Robustness & Mock Data Validation

## Problem

`coherent fix` crashes and misses entire categories of bugs:

1. **ENOENT crash** — `allTsxFiles` is built once (line 139 of fix.ts), then used after file mutations (move `app/page.tsx` → `app/(public)/page.tsx` at Step 4b). Steps 5 and 6 read stale paths → crash.

2. **Invalid mock data** — AI generates `{ timestamp: "2 hours ago" }` instead of ISO strings. `new Date("2 hours ago")` throws "Invalid time value" at runtime. TypeScript can't catch this (`Date` constructor accepts `string`). Our own `RULES_DATA_DISPLAY` constraint says "use relative for recent" without distinguishing rendered output from source data.

3. **Shared components not validated** — fix validates `app/` files but not `components/shared/`. ActivityFeed (a shared component) had the broken mock data.

4. **No compile check** — fix does regex/AST validation but never runs `tsc`. Missing imports, type mismatches, and other TypeScript errors pass through.

## Design

### Change 1: Mock Data Rules in AI Prompts

**File:** `packages/cli/src/agents/design-constraints.ts`

**1a.** Add to `CORE_CONSTRAINTS` (after the CONTENT section, ~line 127):

```
MOCK/SAMPLE DATA (for demo arrays, fake users, fake tasks, etc.):
- Dates: ALWAYS ISO 8601 strings in data ("2024-06-15T10:30:00Z"). 
  Display with date formatting: new Date(item.date).toLocaleDateString() or
  Intl.RelativeTimeFormat, or date-fns if already imported.
  BAD:  { createdAt: "2 hours ago" }
  GOOD: { createdAt: "2024-06-15T10:30:00Z" }
- Images: "/placeholder.svg?height=40&width=40" (Next.js placeholder). Never broken paths.
- IDs: sequential numbers (1, 2, 3) or short slugs ("proj-1"). Never random UUIDs.
```

**1b.** Amend existing DATA FORMATTING bullet in `RULES_DATA_DISPLAY` (~line 593) to clarify rendered vs source:

Change:
```
- Dates: use relative for recent ("2 hours ago", "Yesterday"), absolute for older ("Jan 26, 2026"). Never ISO format in UI.
```
To:
```
- Dates in rendered output: use relative for recent ("2 hours ago"), absolute for older ("Jan 26, 2026"). Never show raw ISO in the UI.
- Dates in source data (mock arrays, state): ALWAYS store as ISO 8601 strings. Compute display format at render time.
```

**1c.** Add after DATA FORMATTING in `RULES_DATA_DISPLAY`:

```
MOCK DATA IN COMPONENTS:
- All date/time values in sample data arrays MUST be valid ISO 8601 strings.
- Render with: new Date(item.date).toLocaleDateString(), Intl.RelativeTimeFormat, or date-fns if imported.
- NEVER store display strings ("2 hours ago", "Yesterday") in data — always compute from ISO date.
```

**Why:** The AI currently gets conflicting signals — "use relative dates" for display vs no guidance on data format. This disambiguates rendered output from source data and avoids mandating `date-fns` (which may not be installed).

### Change 2: Fix Pipeline Hardening

**File:** `packages/cli/src/commands/fix.ts`

#### 2a. Rebuild file lists after mutations

**Current pipeline order in fix.ts:**
1. Step 1: Clear cache
2. Step 2: Install packages
3. Step 3: Install shadcn components (+ Steps 3b-3e: DSM load, placeholder, CSS sync, shared scan)
4. Step 4: Syntax fixes (uses `userTsxFiles` derived from `allTsxFiles`)
5. Step 4b: Layout repair (moves/renames files — `app/page.tsx` → `app/(public)/page.tsx`)
6. Step 4c: Broken layout repair
7. Step 5: Quality auto-fix (uses `userTsxFiles`)
8. Step 6: Validation report (uses `allTsxFiles`)

**Problem:** `allTsxFiles` and `userTsxFiles` are computed once before Step 3 (line 139) but Steps 4b/4c mutate the filesystem. Steps 5 and 6 use stale paths.

**Fix:** After Step 4b/4c completes (after the layout repair `try/catch` block), recompute both:

```ts
allTsxFiles = listTsxFiles(appDir)
userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```

Change initial declarations from `const` to `let`:
```ts
let allTsxFiles = listTsxFiles(appDir)
// ... later ...
let userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```

Note: Step 4 (syntax fixes) runs BEFORE the file mutations, so it uses the original list — this is correct. Only Steps 5+ need the refreshed list.

#### 2b. Include shared components in validation scope

After recomputing file lists, also scan shared components for quality validation:

```ts
const sharedTsxFiles = listTsxFiles(resolve(projectRoot, 'components', 'shared'))
const allValidationFiles = [...userTsxFiles, ...sharedTsxFiles]
```

Use `allValidationFiles` in:
- Quality auto-fix loop (Step 5) — so shared components get `autoFixCode` applied
- Quality validation report (Step 6) — so shared components are reported
- Mock data validation (Change 3)

Note: `validatePageQuality` rules like `NO_H1` should be suppressed for shared components (they're fragments, not pages). Filter issues by checking if file path includes `components/shared/` and suppress page-level rules.

#### 2c. Per-file try/catch in fix loops

Wrap each file iteration in try/catch so one broken file doesn't crash the entire fix run:

```ts
for (const file of files) {
  try {
    // ... existing fix logic
  } catch (err) {
    remaining.push(`${relative(projectRoot, file)}: fix error — ${err instanceof Error ? err.message : 'unknown'}`)
  }
}
```

Apply to: syntax fix loop (Step 4), quality fix loop (Step 5), validation loop (Step 6).

### Change 3: Mock Data Validation

**File:** `packages/cli/src/utils/mock-data-validator.ts` (new)

A lightweight static analysis function that finds common mock data issues in generated code:

```ts
export interface MockDataIssue {
  line: number
  column: number
  message: string
  fixable: boolean
  replacement?: { start: number; end: number; text: string }
}

export function validateMockData(code: string): MockDataIssue[]
```

**Detection rules:**

1. **Invalid Date constructor with string literal** — find `new Date("...")` or `new Date('...')` where the string doesn't parse to a valid date.
   - Regex: `/new Date\(["']([^"']+)["']\)/g`
   - Test: `isNaN(new Date(capturedString).getTime())`
   - Auto-fix: replace the invalid string with a recent ISO date (e.g., 1-7 days ago, randomized per occurrence for variety)
   - **Limitation:** This catches only string literals passed directly to `new Date()`. It won't catch `new Date(variable)` where the variable holds a bad string. The prompt rules (Change 1) are the primary defense; this is a safety net.

2. **String values in mock arrays that look like relative dates** — scan for patterns like `timestamp: "2 hours ago"`, `date: "yesterday"`, `createdAt: "last week"` in object literals.
   - Regex: `/(?:timestamp|date|createdAt|updatedAt|time)\s*:\s*["']((?:\d+\s+(?:hours?|minutes?|days?|weeks?|months?)\s+ago)|yesterday|today|last\s+\w+)["']/gi`
   - Auto-fix: replace the string value with a recent ISO date
   - **Limitation:** Only catches common English relative date patterns. Won't catch all possible bad values. Best-effort.

**No image src validation** — removed from scope. Too many valid patterns (static files, Next.js Image imports, expressions) make false positives likely. Not worth the complexity.

**Integration in fix.ts:**
After quality auto-fix (Step 5), run `validateMockData` on `allValidationFiles`. For fixable issues, apply replacements via string substitution and `safeWrite`. For unfixable issues, add to `remaining`.

### Change 4: TypeScript Compile Check (report-only, last step)

**File:** `packages/cli/src/commands/fix.ts`

After all fixes and validation, run `tsc --noEmit` as a final diagnostic:

```ts
try {
  const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) throw new Error('no tsconfig')
  
  execSync('npx tsc --noEmit --pretty 2>&1', { 
    cwd: projectRoot, 
    timeout: 30000,
    encoding: 'utf-8' 
  })
  console.log(chalk.green('  ✔ TypeScript compilation clean'))
} catch (err) {
  if (err instanceof Error && err.message === 'no tsconfig') {
    // skip silently — not a TS project
  } else {
    const output = (err as any).stdout || ''
    const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'))
    if (errorLines.length > 0) {
      for (const line of errorLines.slice(0, 10)) {
        remaining.push(line.trim())
      }
      if (errorLines.length > 10) remaining.push(`... and ${errorLines.length - 10} more TypeScript errors`)
      console.log(chalk.yellow(`  ⚠ TypeScript: ${errorLines.length} error(s)`))
    }
  }
}
```

**Behavior:**
- Skipped if no `tsconfig.json` (graceful degradation for JS-only projects)
- Timeout: 30 seconds (prevents hanging on large projects)
- Errors go to `remaining` (report-only, never auto-fixed)
- Does NOT require AI — purely informational
- Always runs as last step (not gated by `--no-quality` — separate concern from quality auto-fix)
- Pre-existing project errors will appear — this is expected and useful

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/agents/design-constraints.ts` | Add mock data rules to CORE_CONSTRAINTS; amend DATA FORMATTING in RULES_DATA_DISPLAY to clarify rendered vs source |
| `packages/cli/src/commands/fix.ts` | `let` for file lists, recompute after 4b/4c, include shared components, per-file try/catch, tsc check |
| `packages/cli/src/utils/mock-data-validator.ts` | New: `validateMockData()` — detects invalid Date literals and relative date strings in mock data |
| `packages/cli/src/utils/mock-data-validator.test.ts` | New: tests for both detection rules and auto-fix output |

## What This Does NOT Cover

- **Visual consistency** (narrow Register vs wide Login) — auth template is already in constraints; this is an AI compliance issue, not a tooling gap.
- **AI-powered repair** — intentionally excluded. Fix stays offline (no API key required). Issues that can't be auto-fixed statically go to `remaining`.
- **`next build` validation** — too heavy for every fix run. `tsc --noEmit` covers TypeScript errors.
- **Image src validation** — too many valid patterns, high false-positive risk. Removed from scope.
- **Variable-based Date issues** (`new Date(item.timestamp)` where `item.timestamp` is bad) — can't be caught statically. Prompt rules (Change 1) are the primary defense.

## Testing

- `mock-data-validator.test.ts`:
  - Detects `new Date("2 hours ago")` as invalid
  - Detects `{ timestamp: "yesterday" }` as invalid
  - Passes `new Date("2024-06-15T10:30:00Z")` as valid
  - Passes `new Date()` (no args) as valid
  - Auto-fix produces valid ISO date strings
- Manual: run `coherent chat` to generate a project, then `coherent fix` — verify no ENOENT, verify mock data issues detected
- Existing tests must pass (`pnpm test`)
