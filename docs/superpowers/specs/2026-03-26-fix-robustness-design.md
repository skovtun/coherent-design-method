# Fix Robustness & Mock Data Validation

## Problem

`coherent fix` crashes and misses entire categories of bugs:

1. **ENOENT crash** — `allTsxFiles` is built once (line 139 of fix.ts), then used after file mutations (move `app/page.tsx` → `app/(public)/page.tsx`). Later steps read stale paths → crash.

2. **Invalid mock data** — AI generates `{ timestamp: "2 hours ago" }` instead of ISO strings. `new Date("2 hours ago")` throws "Invalid time value" at runtime. TypeScript can't catch this (`Date` constructor accepts `string`). Our own `RULES_DATA_DISPLAY` constraint says "use relative for recent" without specifying that mock data must be ISO.

3. **Shared components not validated** — fix validates `app/` files but not `components/shared/`. ActivityFeed (a shared component) had the broken mock data.

4. **No compile check** — fix does regex/AST validation but never runs `tsc`. Missing imports, type mismatches, and other TypeScript errors pass through.

## Design

### Change 1: Mock Data Rules in AI Prompts

**File:** `packages/cli/src/agents/design-constraints.ts`

Add to `CORE_CONSTRAINTS` (after the CONTENT section at line 124):

```
MOCK/SAMPLE DATA (for demo arrays, fake users, fake tasks, etc.):
- Dates: ALWAYS ISO 8601 strings in data ("2024-06-15T10:30:00Z"). 
  Display with: formatDistanceToNow(new Date(item.date), { addSuffix: true })
  BAD:  { createdAt: "2 hours ago" }
  GOOD: { createdAt: "2024-06-15T10:30:00Z" }
- Images: "/placeholder.svg?height=40&width=40" (Next.js placeholder). Never broken paths.
- IDs: sequential numbers (1, 2, 3) or short slugs ("proj-1"). Never random UUIDs.
```

Add to `RULES_DATA_DISPLAY` (after the DATA FORMATTING section at line 593):

```
MOCK DATA IN COMPONENTS:
- All date/time values in sample data arrays MUST be valid ISO 8601 strings.
- The component renders them with date-fns (formatDistanceToNow, format) or Intl.DateTimeFormat.
- NEVER store display strings ("2 hours ago", "Yesterday") in data — always compute from ISO date.
```

**Why:** Prevents the bug at source. The AI currently gets conflicting signals — "use relative dates" for display but no guidance on data format. This makes the rule explicit.

### Change 2: Fix Pipeline Hardening

**File:** `packages/cli/src/commands/fix.ts`

#### 2a. Rebuild file lists after mutations

After Step 4b (layout repair) — before Step 4 (syntax fixes) and Step 5 (quality fixes) — rebuild `allTsxFiles`:

```ts
const allTsxFiles = listTsxFiles(appDir)
const userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```

This ensures the syntax fix loop (Step 4) and quality fix loop (Step 5) and validation loop (Step 6) use current paths, not stale ones.

Note: the current code has `allTsxFiles` as `const` — change to `let` at first declaration and reassign after mutations.

#### 2b. Include shared components in validation scope

After rebuilding `allTsxFiles`, also scan shared components:

```ts
const sharedTsxFiles = listTsxFiles(resolve(projectRoot, 'components', 'shared'))
const allValidationFiles = [...userTsxFiles, ...sharedTsxFiles]
```

Use `allValidationFiles` for the quality auto-fix loop (Step 5) and the quality validation report (Step 6).

#### 2c. Per-file try/catch in fix loops

Wrap each file iteration in try/catch so one broken file doesn't crash the entire fix run:

```ts
for (const file of userTsxFiles) {
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

A lightweight static analysis function that finds common mock data issues:

```ts
export interface MockDataIssue {
  line: number
  message: string
  fix?: string  // suggested replacement
}

export function validateMockData(code: string): MockDataIssue[]
```

**Detection rules:**

1. **Invalid Date constructor** — find `new Date("...")` where the string doesn't parse to a valid date. Regex: `new Date\(["']([^"']+)["']\)` → test with `isNaN(new Date(match).getTime())`.

2. **Broken image src** — find `src="..."` or `src='...'` where value is not a URL, not `/placeholder`, not a data URI, not an import. Regex-based path validation.

**Auto-fix (no AI needed):**
- Invalid dates → replace with recent ISO date: `new Date().toISOString()` relative to current time
- Example: `new Date("2 hours ago")` → `new Date("2026-03-26T18:00:00Z")`

**Integration in fix.ts:**
After quality auto-fix (Step 5), run `validateMockData` on all validation files. For fixable issues, apply the replacement. For unfixable issues, add to `remaining`.

### Change 4: TypeScript Compile Check (optional, last step)

**File:** `packages/cli/src/commands/fix.ts`

After all fixes are applied and validated, run `tsc --noEmit` as a final check:

```ts
import { execSync } from 'child_process'

try {
  execSync('npx tsc --noEmit --pretty 2>&1', { 
    cwd: projectRoot, 
    timeout: 30000,
    encoding: 'utf-8' 
  })
  console.log(chalk.green('  ✔ TypeScript compilation clean'))
} catch (err) {
  const output = (err as any).stdout || ''
  const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'))
  for (const line of errorLines.slice(0, 10)) {
    remaining.push(line.trim())
  }
  console.log(chalk.yellow(`  ⚠ TypeScript: ${errorLines.length} error(s) found`))
}
```

**Behavior:**
- Runs only if `tsc` is available (Next.js projects always have it)
- Timeout: 30 seconds (prevents hanging)
- Errors go to `remaining` (reported, not auto-fixed)
- Does NOT require AI — purely informational
- Skipped with `--no-quality` flag (same as quality auto-fix)

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/agents/design-constraints.ts` | Add mock data rules to CORE_CONSTRAINTS and RULES_DATA_DISPLAY |
| `packages/cli/src/commands/fix.ts` | Rebuild file lists after mutations, include shared components, per-file try/catch, tsc check |
| `packages/cli/src/utils/mock-data-validator.ts` | New: validateMockData() function |
| `packages/cli/src/utils/mock-data-validator.test.ts` | New: tests for date and image validation |

## What This Does NOT Cover

- **Visual consistency** (narrow Register vs wide Login) — auth template is already in constraints; this is an AI compliance issue, not a tooling gap.
- **AI-powered repair** — intentionally excluded. Fix stays offline (no API key required). Issues that can't be auto-fixed statically go to `remaining` for the user to address with `coherent chat`.
- **`next build` validation** — too heavy for every fix run (30-60s). The `tsc --noEmit` check covers most of what `next build` would catch.

## Testing

- `mock-data-validator.test.ts`: test invalid dates, valid dates, broken image paths, valid image paths
- Manual: run `coherent chat` to generate a project, then `coherent fix` — verify no ENOENT, verify mock data issues detected
- Existing tests must pass (`pnpm test`)
