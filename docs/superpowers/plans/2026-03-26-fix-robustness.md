# Fix Robustness & Mock Data Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `coherent fix` robust against stale file lists, invalid mock data, and missing shared component validation.

**Architecture:** Four changes: (1) add mock data rules to AI prompts, (2) harden fix.ts pipeline — rebuild file lists after mutations, include shared components, per-file try/catch, (3) new `validateMockData` utility for static detection of invalid dates in generated code, (4) optional `tsc --noEmit` compile check as final diagnostic.

**Tech Stack:** TypeScript, vitest, ESM modules

**Spec:** `docs/superpowers/specs/2026-03-26-fix-robustness-design.md`

---

### Task 1: Mock data rules in AI prompts

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/src/agents/design-constraints.test.ts` (if not exists, add to existing):

```ts
import { describe, it, expect } from 'vitest'
import { CORE_CONSTRAINTS, RULES_DATA_DISPLAY } from './design-constraints.js'

describe('design-constraints mock data rules', () => {
  it('CORE_CONSTRAINTS includes mock data ISO rule', () => {
    expect(CORE_CONSTRAINTS).toContain('ISO 8601')
    expect(CORE_CONSTRAINTS).toContain('MOCK/SAMPLE DATA')
  })
  it('RULES_DATA_DISPLAY distinguishes rendered vs source dates', () => {
    expect(RULES_DATA_DISPLAY).toContain('Dates in rendered output')
    expect(RULES_DATA_DISPLAY).toContain('Dates in source data')
  })
  it('RULES_DATA_DISPLAY includes mock data section', () => {
    expect(RULES_DATA_DISPLAY).toContain('MOCK DATA IN COMPONENTS')
    expect(RULES_DATA_DISPLAY).toContain('NEVER store display strings')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/agents/design-constraints.test.ts`
Expected: FAIL — CORE_CONSTRAINTS doesn't contain 'MOCK/SAMPLE DATA'

- [ ] **Step 3: Add mock data rules to CORE_CONSTRAINTS**

In `packages/cli/src/agents/design-constraints.ts`, find the end of the CONTENT section in `CORE_CONSTRAINTS` (after line `- ALWAYS: Real, contextual content. Realistic metric names, values, dates.`). Add:

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

- [ ] **Step 4: Amend DATA FORMATTING in RULES_DATA_DISPLAY**

Find the existing bullet:
```
- Dates: use relative for recent ("2 hours ago", "Yesterday"), absolute for older ("Jan 26, 2026"). Never ISO format in UI.
```

Replace with:
```
- Dates in rendered output: use relative for recent ("2 hours ago"), absolute for older ("Jan 26, 2026"). Never show raw ISO in the UI.
- Dates in source data (mock arrays, state): ALWAYS store as ISO 8601 strings. Compute display format at render time.
```

- [ ] **Step 5: Add MOCK DATA section to RULES_DATA_DISPLAY**

After the DATA FORMATTING section, add:

```
MOCK DATA IN COMPONENTS:
- All date/time values in sample data arrays MUST be valid ISO 8601 strings.
- Render with: new Date(item.date).toLocaleDateString(), Intl.RelativeTimeFormat, or date-fns if imported.
- NEVER store display strings ("2 hours ago", "Yesterday") in data — always compute from ISO date.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/agents/design-constraints.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Run full suite**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts packages/cli/src/agents/design-constraints.test.ts
git commit -m "feat: add mock data ISO rules to AI prompts"
```

---

### Task 2: Mock data validator utility

**Files:**
- Create: `packages/cli/src/utils/mock-data-validator.ts`
- Create: `packages/cli/src/utils/mock-data-validator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/utils/mock-data-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateMockData } from './mock-data-validator.js'

describe('validateMockData', () => {
  it('detects new Date("2 hours ago")', () => {
    const code = `const x = new Date("2 hours ago")`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].fixable).toBe(true)
  })

  it('detects new Date(\'yesterday\')', () => {
    const code = `const x = new Date('yesterday')`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('passes new Date("2024-06-15T10:30:00Z")', () => {
    const code = `const x = new Date("2024-06-15T10:30:00Z")`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('passes new Date() with no args', () => {
    const code = `const x = new Date()`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('passes Date.now()', () => {
    const code = `const x = Date.now()`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('detects timestamp: "2 hours ago" in object', () => {
    const code = `const items = [{ timestamp: "2 hours ago", user: "John" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].fixable).toBe(true)
  })

  it('detects createdAt: "yesterday"', () => {
    const code = `const data = { createdAt: "yesterday" }`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('detects date: "last week"', () => {
    const code = `const items = [{ date: "last week" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('passes timestamp: "2024-01-15T10:30:00Z"', () => {
    const code = `const items = [{ timestamp: "2024-01-15T10:30:00Z" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('produces valid ISO replacement for invalid dates', () => {
    const code = `const x = new Date("2 hours ago")`
    const issues = validateMockData(code)
    expect(issues[0].replacement).toBeDefined()
    const replaced = code.slice(0, issues[0].replacement!.start) + issues[0].replacement!.text + code.slice(issues[0].replacement!.end)
    expect(replaced).toMatch(/new Date\("\d{4}-\d{2}-\d{2}T/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/mock-data-validator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validateMockData**

Create `packages/cli/src/utils/mock-data-validator.ts`:

```ts
export interface MockDataIssue {
  line: number
  column: number
  message: string
  fixable: boolean
  replacement?: { start: number; end: number; text: string }
}

function generateRecentIsoDate(offsetHours: number = 0): string {
  const d = new Date()
  d.setHours(d.getHours() - offsetHours)
  return d.toISOString()
}

function getLineAndCol(code: string, index: number): { line: number; column: number } {
  const lines = code.slice(0, index).split('\n')
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 }
}

export function validateMockData(code: string): MockDataIssue[] {
  const issues: MockDataIssue[] = []
  let offset = 0

  const dateCtorRe = /new Date\(["']([^"']+)["']\)/g
  let m: RegExpExecArray | null
  while ((m = dateCtorRe.exec(code)) !== null) {
    const dateStr = m[1]
    if (isNaN(new Date(dateStr).getTime())) {
      const { line, column } = getLineAndCol(code, m.index)
      const valueStart = m.index + m[0].indexOf(dateStr)
      const valueEnd = valueStart + dateStr.length
      issues.push({
        line,
        column,
        message: `Invalid Date: new Date("${dateStr}") will throw at runtime`,
        fixable: true,
        replacement: {
          start: valueStart,
          end: valueEnd,
          text: generateRecentIsoDate(offset++),
        },
      })
    }
  }

  const mockFieldRe = /(?:timestamp|date|createdAt|updatedAt|time|startDate|endDate|dueDate)\s*:\s*["']((?:\d+\s+(?:hours?|minutes?|days?|weeks?|months?|years?)\s+ago)|yesterday|today|last\s+\w+|just\s+now|recently)["']/gi
  while ((m = mockFieldRe.exec(code)) !== null) {
    const dateStr = m[1]
    const { line, column } = getLineAndCol(code, m.index)
    const fullMatch = m[0]
    const quoteChar = fullMatch.includes("'") ? "'" : '"'
    const valueStart = m.index + fullMatch.indexOf(dateStr)
    const valueEnd = valueStart + dateStr.length
    issues.push({
      line,
      column,
      message: `Mock data "${dateStr}" is a display string, not a valid Date — use ISO 8601`,
      fixable: true,
      replacement: {
        start: valueStart,
        end: valueEnd,
        text: generateRecentIsoDate(offset++),
      },
    })
  }

  return issues
}

export function applyMockDataFixes(code: string, issues: MockDataIssue[]): string {
  const fixable = issues.filter(i => i.fixable && i.replacement).sort((a, b) => b.replacement!.start - a.replacement!.start)
  let result = code
  for (const issue of fixable) {
    const r = issue.replacement!
    result = result.slice(0, r.start) + r.text + result.slice(r.end)
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/utils/mock-data-validator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full suite**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/mock-data-validator.ts packages/cli/src/utils/mock-data-validator.test.ts
git commit -m "feat: add mock data validator for invalid dates"
```

---

### Task 3: Fix pipeline hardening

**Files:**
- Modify: `packages/cli/src/commands/fix.ts`

- [ ] **Step 1: Change `const` to `let` for mutable file lists**

In `packages/cli/src/commands/fix.ts`, find:
```ts
const allTsxFiles = listTsxFiles(appDir)
```
Change to:
```ts
let allTsxFiles = listTsxFiles(appDir)
```

Find:
```ts
const userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```
Change to:
```ts
let userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```

- [ ] **Step 2: Add file list rebuild after layout repair**

After the `try/catch` block that contains Step 4b (layout repair, `ensurePlanGroupLayouts`, sidebar generation, file moves, etc.) — find the closing `} catch (err) {` and its `}`. After this entire try/catch block, add:

```ts
// ─── Rebuild file lists after mutations ──────────────────
allTsxFiles = listTsxFiles(appDir)
userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
```

- [ ] **Step 3: Include shared components in validation scope**

Right after the rebuild, add:

```ts
const sharedTsxFiles = listTsxFiles(resolve(projectRoot, 'components', 'shared'))
const allValidationFiles = [...userTsxFiles, ...sharedTsxFiles]
```

- [ ] **Step 4: Update quality auto-fix loop to use allValidationFiles**

Find the quality auto-fix loop (Step 5):
```ts
for (const file of userTsxFiles) {
```
Change to:
```ts
for (const file of allValidationFiles) {
```

- [ ] **Step 5: Add per-file try/catch to quality auto-fix loop**

Wrap the body of the quality auto-fix loop in try/catch:

```ts
for (const file of allValidationFiles) {
  try {
    const content = readFileSync(file, 'utf-8')
    // ... existing autoFixCode logic ...
  } catch (err) {
    remaining.push(`${relative(projectRoot, file)}: quality fix error — ${err instanceof Error ? err.message : 'unknown'}`)
  }
}
```

- [ ] **Step 6: Add per-file try/catch to syntax fix loop**

Same pattern for the syntax fix loop (Step 4):

```ts
for (const file of userTsxFiles) {
  try {
    // ... existing syntax fix logic ...
  } catch (err) {
    remaining.push(`${relative(projectRoot, file)}: syntax fix error — ${err instanceof Error ? err.message : 'unknown'}`)
  }
}
```

- [ ] **Step 7: Update validation report to use allValidationFiles and add try/catch**

Find the validation loop (Step 6):
```ts
for (const file of allTsxFiles) {
```
Change to:
```ts
for (const file of allValidationFiles) {
```

Wrap in try/catch. For shared components, suppress page-level rules (NO_H1, MULTIPLE_H1):

```ts
const isSharedComponent = file.includes('components/shared/')
// ... existing filtering ...
if (isSharedComponent) {
  filteredIssues = filteredIssues.filter(i => i.type !== 'NO_H1' && i.type !== 'MULTIPLE_H1')
}
```

- [ ] **Step 8: Add mock data validation step (Step 5b)**

After the quality auto-fix loop and before the validation report loop, add:

```ts
// ─── Step 5b: Validate mock data ──────────────────
try {
  const { validateMockData, applyMockDataFixes } = await import('../utils/mock-data-validator.js')
  let mockFixed = 0
  for (const file of allValidationFiles) {
    try {
      const content = readFileSync(file, 'utf-8')
      const mockIssues = validateMockData(content)
      if (mockIssues.length > 0) {
        const fixed = applyMockDataFixes(content, mockIssues)
        if (fixed !== content && !dryRun) {
          const result = safeWrite(file, fixed, projectRoot, backups)
          if (result.ok) {
            mockFixed++
            modifiedFiles.push(file)
          }
        } else if (dryRun) {
          mockFixed++
        }
      }
    } catch (fileErr) {
      remaining.push(`${relative(projectRoot, file)}: mock data fix error — ${fileErr instanceof Error ? fileErr.message : 'unknown'}`)
    }
  }
  if (mockFixed > 0) {
    const verb = dryRun ? 'Would fix' : 'Fixed'
    fixes.push(`${verb} mock data in ${mockFixed} file(s)`)
    console.log(chalk.green(`  ✔ ${verb} mock data: ${mockFixed} file(s)`))
  }
} catch (importErr) {
  console.log(chalk.dim('  ⊘ mock-data-validator not available, skipping'))
}
```

- [ ] **Step 9: Add TypeScript compile check (last step)**

After Step 6 (validation report), before the output summary, add:

```ts
// ─── Step 7: TypeScript compile check ──────────────────
try {
  const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
  if (existsSync(tsconfigPath)) {
    const { execSync } = await import('child_process')
    const output = execSync('npx tsc --noEmit --pretty 2>&1', {
      cwd: projectRoot,
      timeout: 30000,
      encoding: 'utf-8',
    })
    fixes.push('TypeScript compilation clean')
    console.log(chalk.green('  ✔ TypeScript compilation clean'))
  }
} catch (err) {
  const output = ((err as any).stdout || '') + ((err as any).stderr || '')
  const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'))
  if (errorLines.length > 0) {
    for (const line of errorLines.slice(0, 10)) {
      remaining.push(line.trim())
    }
    if (errorLines.length > 10) remaining.push(`... and ${errorLines.length - 10} more TypeScript errors`)
    console.log(chalk.yellow(`  ⚠ TypeScript: ${errorLines.length} error(s)`))
  }
}
```

- [ ] **Step 10: Run full suite**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "feat: harden fix pipeline — rebuild file lists, shared scope, mock validation, tsc check"
```

---

### Task 4: Final verification + version bump + publish

**Files:**
- Modify: `packages/core/package.json` (version)
- Modify: `packages/cli/package.json` (version)

- [ ] **Step 1: Run full CI**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```
Expected: ALL PASS

- [ ] **Step 2: Version bump**

Check current versions with `node -p "require('./packages/cli/package.json').version"` and bump patch:

```bash
cd packages/core && npm version patch --no-git-tag-version
cd ../cli && npm version patch --no-git-tag-version
```

- [ ] **Step 3: Commit and push**

```bash
NEW_VER=$(node -p "require('./packages/cli/package.json').version")
git add -A
git commit -m "v${NEW_VER}: fix robustness — mock data validation, pipeline hardening, tsc check"
git push
```

- [ ] **Step 4: Publish**

```bash
cd packages/core && pnpm publish --no-git-checks --access public
cd ../cli && pnpm publish --no-git-checks --access public
```

- [ ] **Step 5: Verify**

```bash
NEW_VER=$(node -p "require('./packages/cli/package.json').version")
npm install -g @getcoherent/cli@$NEW_VER
coherent fix
```

Verify: no ENOENT crash, mock data issues detected, tsc check runs.
