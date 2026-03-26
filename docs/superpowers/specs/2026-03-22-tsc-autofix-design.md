# TypeScript Auto-Fix: Generation-Time Validation & Post-Hoc Repair

## Problem

~90% of `coherent chat` generations have errors. The most common are TypeScript type mismatches between AI-generated data and component interfaces: wrong field names, incorrect union types, missing required props. These cause runtime crashes (e.g., `Error: Invalid time value`) that `coherent fix` currently only reports but cannot repair.

## Solution

A shared `tsc-autofix` module that both `coherent fix` (post-hoc) and `coherent chat` (generation-time) use to detect and repair TypeScript errors. Two-pass architecture: deterministic fixers handle common patterns (~80%), AI fallback handles the rest.

## Architecture

### New modules

```
packages/cli/src/utils/
  tsc-error-parser.ts    (~80 lines)  — parse tsc output → structured errors
  tsc-autofix.ts         (~200 lines) — deterministic fixers + orchestration
  tsc-ai-fix.ts          (~150 lines) — AI fallback for remaining errors
```

### Interfaces

```typescript
// tsc-error-parser.ts
interface TscError {
  file: string           // relative path, e.g. "app/(app)/dashboard/page.tsx"
  line: number
  col: number
  code: string           // "TS2322"
  message: string        // full error message (may be multi-line)
  relatedFiles: string[] // files mentioned in "declared here" / "expected type"
}

function parseTscOutput(output: string): TscError[]

// tsc-autofix.ts
interface TscFixResult {
  fixed: string[]        // files that were successfully fixed
  remaining: TscError[]  // errors that could not be fixed deterministically
}

function runTscCheck(projectRoot: string, timeout?: number): TscError[]
function applyDeterministicFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>
): Promise<TscFixResult>

// tsc-ai-fix.ts
interface TscAiFixResult {
  fixed: string[]
  failed: TscError[]
}

function applyAiFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>,
  aiProvider?: AIProviderInterface
): Promise<TscAiFixResult>
```

### `runTscCheck` specification

Runs the TypeScript compiler and returns structured errors:

1. Execute `npx tsc --noEmit 2>&1` via `execSync` with `cwd: projectRoot`
2. `tsc` exits with code 1 on errors — catch the thrown error and read `stdout`/`stderr` from the error object
3. Pass combined output to `parseTscOutput()`
4. Timeout: 30 seconds (configurable). On timeout, return empty array and log warning
5. If `tsconfig.json` does not exist, return empty array

### Backup lifecycle

Both `applyDeterministicFixes` and `applyAiFixes` accept a `backups: Map<string, string>` parameter (same pattern as existing `safeWrite` in `fix-validation.ts`). The caller creates the map, passes it to both functions, and uses it for rollback if needed. In `fix.ts`, this is the existing `backups` map. In `modification-handler.ts`, a fresh map is created per page.

## Deterministic Fixers

Three fixers, each handling one tsc error pattern. All write through `safeWrite` with backup. Two safety layers protect against regressions:

1. **Syntax guard:** `isValidTsx()` — ensures the fixer didn't produce unparseable code. This catches broken JSX, missing brackets, etc.
2. **Type guard:** Re-run `tsc` after fixes — ensures error count did not increase. This catches type regressions.

If either guard fails, rollback via `safeWrite`.

### Error deduplication

Before applying fixes, deduplicate errors by `(file, code, line)`. tsc often reports the same root cause as multiple errors (e.g., a wrong field name in an array `.map()` produces N errors for N items). Fix unique root causes, then re-run tsc to see which errors resolved.

### Fixer 1: Property missing — field rename (TS2322 / TS2741)

**Trigger:** `Property 'timestamp' is missing in type '{ ...; time: string; }'`

**Logic:**
1. Extract expected field name from error message (`timestamp`)
2. Try to extract actual field names from the type literal in the error message
3. If field names not present in the error (tsc may reference a type name instead of inlining fields), read the source file at the error location and extract field names from the object literal on that line
4. Find a close match: exact substring (`time` ⊂ `timestamp`) or Levenshtein distance within a relative threshold: `distance ≤ max(1, floor(fieldName.length * 0.4))`. This gives distance 1 for 3-char names, distance 2 for 5-char names, distance 3 for 8+ char names. Substring check takes priority (always safe).
5. Read the file, find the object literal near the error line, rename the field
6. Write via `safeWrite`

**Principle:** Fix the DATA (page), not the INTERFACE (component). Component interfaces are the contract.

### Fixer 2: String not assignable to union (TS2322)

**Trigger:** `Type 'string' is not assignable to type '"active" | "completed" | "paused"'`

**Logic:**
1. Extract union variants from error message
2. Read the file, find the value at the error line
3. If the value matches a variant case-insensitively → replace with correct case
4. If the value is a plain string in an array literal → add `as const` to the array or type-assert the field
5. Write via `safeWrite`

### Fixer 3: Missing required prop — event handler (TS2741)

**Trigger:** `Property 'onToggle' is missing in type '...' but required`

**Logic:**
1. Extract the prop name from the error message
2. If name starts with `on` (event handler) → add `propName={() => {}}` to the JSX element at the error line
3. If not an event handler → pass to AI (cannot guess data values)
4. Write via `safeWrite`

## AI Fallback

For errors not handled by deterministic fixers.

### Prerequisites

- `aiProvider` must be provided AND `aiProvider.editPageCode` must be defined
- If either is missing, skip AI fixes and return all errors as `failed`

### Context gathering

For each file with remaining errors:
1. Read the file content
2. Read related files (interfaces referenced in tsc error messages via "declared here")
3. Build prompt with:
   - The file code
   - Specific tsc error messages with line numbers
   - Related interface files labeled "Reference interfaces — DO NOT modify these"

### Execution

1. Call `editPageCode(code, prompt, fileName)` for each file
2. **Syntax guard:** `isValidTsx()` — if invalid, rollback
3. **Type guard:** Re-run `tsc`, filter to this file — if error count increased, rollback via `safeWrite`

### Limits

- No API key or no `editPageCode` → skip AI, report remaining errors
- Max 5 files per AI pass (cost control — each call is ~1-2k tokens input + output; 5 files ≈ $0.05-0.10)
- One AI pass, no iterations
- 30-second timeout per AI call
- Message to user when AI is used: "Using AI to fix N TypeScript error(s)..."
- Message when no API key: "N TypeScript errors remaining. Configure API key for auto-fix."

## Integration: `coherent fix` (Step 7)

Replace current report-only Step 7 with:

```
Step 7a: Run tsc --noEmit → parse errors
Step 7b: Deduplicate errors
Step 7c: Apply deterministic fixes
Step 7d: Apply AI fixes (if errors remain + AI available)
Step 7e: Final tsc --noEmit → report any remaining errors
```

Each sub-step logs progress:
- `✔ TypeScript: fixed 3 error(s) deterministically`
- `✔ TypeScript: fixed 1 error(s) via AI`
- `⚠ TypeScript: 2 error(s) remaining (need manual fix)`
- or `✔ TypeScript compilation clean`

## Integration: `coherent chat` (generation-time)

`modification-handler.ts` already has a quality correction loop:
1. AI generates page code
2. `autoFixCode()` applied
3. `validatePageQuality()` checks
4. If quality errors → feed back to AI → `autoFixCode()` again

Add tsc validation after step 2, before step 3:

```
2a. autoFixCode() applied
2b. Write file to disk (needed for tsc to resolve imports)
2c. Run full-project tsc --noEmit, filter output to this file only
    → If 0 errors: done, proceed to step 3
    → If errors: continue to 2d
2d. applyDeterministicFixes(). Record bestErrorCount = min(2c count, post-2d count)
    → If 0 errors: done, proceed to step 3
    → If errors remain: continue to 2e
2e. Feed remaining errors back to same AI (already in context):
    "The code you generated has these TypeScript errors: [...]. Fix them."
2f. autoFixCode() on the AI-corrected version
2g. Re-run tsc filtered to this file.
    → If error count > bestErrorCount: revert to best snapshot (post-2d version)
    → Otherwise: accept the result
```

This reuses the same `tsc-error-parser` and deterministic fixers. The AI correction uses the SAME AI provider instance that generated the code (already has context), so quality should be high.

**tsc invocation note:** `tsc --noEmit` always type-checks the full project (per tsconfig.json). You cannot pass a single file argument because tsc ignores tsconfig when files are specified explicitly. Instead, run `tsc --noEmit` on the full project and filter `parseTscOutput()` results to only errors matching the current file path.

**Performance:** Full-project `tsc --noEmit` takes 3-8 seconds on typical generated apps. This is acceptable during `coherent chat` since page generation already takes 5-30 seconds per page. The tsc check runs once per page, not per fix attempt.

**Concurrency:** tsc-autofix operates on one file at a time during `coherent chat` and is called sequentially per page. If `coherent chat` parallelizes page generation in the future, tsc checking would need to be serialized since `tsc --noEmit` reads the full project.

## Testing Strategy

### tsc-error-parser.test.ts (~12 tests)
- Parse single error line
- Parse multi-line error with "declared here" reference
- Parse error with multiple related files
- Handle empty output (no errors)
- Handle malformed output gracefully
- Parse error with inline type literal (field names visible)
- Parse error with named type reference (field names not visible)

### tsc-autofix.test.ts (~18 tests)
- Fixer 1: rename field when substring match exists
- Fixer 1: rename field via Levenshtein match
- Fixer 1: skip when no close match found
- Fixer 1: read field names from source when not in error message
- Fixer 1: respect relative Levenshtein threshold (reject short-name false positives)
- Fixer 2: fix case-insensitive union match
- Fixer 2: skip when value doesn't match any variant
- Fixer 3: add no-op handler for `on*` props
- Fixer 3: skip non-event props (pass to AI)
- Deduplication: multiple errors from same root cause
- Integration: multiple errors in one file
- Integration: errors across multiple files
- Safety: rollback on invalid TSX after fix (syntax guard)
- Safety: rollback when error count increases (type guard)
- Adversarial: line numbers shifted by prior edits in same file
- Adversarial: multiple object literals on same line

### tsc-ai-fix.test.ts (~7 tests)
- Skip when no AI provider available
- Skip when aiProvider.editPageCode is undefined
- Call editPageCode with correct prompt structure (includes related interfaces)
- Rollback when AI output is invalid TSX (syntax guard)
- Rollback when error count increases after AI fix (type guard)
- Respect max 5 files limit
- Return metrics: { fixed, failed } counts

## What This Does NOT Cover

- Fixing errors inside shared component implementations (only fixes pages/data)
- Runtime errors not caught by tsc (e.g., logic bugs)
- Visual/layout issues (handled by existing quality-validator)
- Adding new component interfaces (only fixes usage to match existing interfaces)
