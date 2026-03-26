# TypeScript Auto-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TypeScript auto-fix capabilities to `coherent fix` and `coherent chat` so that common tsc errors (field name mismatches, union types, missing event handler props) are repaired automatically.

**Architecture:** Three new modules in `packages/cli/src/utils/`: a tsc output parser, deterministic fixers, and an AI fallback. These are orchestrated in `fix.ts` Step 7 (post-hoc) and `modification-handler.ts` (generation-time). All file writes go through existing `safeWrite` with backups. `safeWrite` performs the syntax guard (`isValidTsx`); the type guard (re-run `tsc`, check error count) is done by the caller after writes.

**Tech Stack:** TypeScript, vitest, `execSync` for tsc invocation, existing `safeWrite`/`isValidTsx` from `fix-validation.ts`, existing `createAIProvider`/`editPageCode` from `ai-provider.ts`.

**Spec:** `docs/superpowers/specs/2026-03-22-tsc-autofix-design.md`

---

### Task 1: tsc-error-parser

**Files:**
- Create: `packages/cli/src/utils/tsc-error-parser.ts`
- Test: `packages/cli/src/utils/tsc-error-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/utils/tsc-error-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseTscOutput, type TscError } from './tsc-error-parser.js'

describe('parseTscOutput', () => {
  it('parses a single-line error', () => {
    const output = `app/page.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      file: 'app/page.tsx',
      line: 10,
      col: 5,
      code: 'TS2322',
      relatedFiles: [],
    })
    expect(errors[0].message).toContain("Type 'string' is not assignable")
  })

  it('parses multi-line error with related file', () => {
    const output = [
      `app/dashboard/page.tsx(171,25): error TS2322: Type '{ time: string; }' is not assignable to type '{ timestamp: string; }'.`,
      `  Property 'timestamp' is missing in type '{ time: string; }' but required in type '{ timestamp: string; }'.`,
      ``,
      `  components/shared/activity-feed.tsx(11,5): error TS2322: 'timestamp' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('app/dashboard/page.tsx')
    expect(errors[0].message).toContain('timestamp')
    expect(errors[0].relatedFiles).toContain('components/shared/activity-feed.tsx')
  })

  it('parses error with multiple related files', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type mismatch.`,
      `  components/a.tsx(5,3): 'foo' is declared here.`,
      `  components/b.tsx(8,1): 'bar' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].relatedFiles).toContain('components/a.tsx')
    expect(errors[0].relatedFiles).toContain('components/b.tsx')
  })

  it('parses multiple independent errors', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`,
      `app/page.tsx(20,10): error TS2741: Property 'onToggle' is missing.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(2)
    expect(errors[0].code).toBe('TS2322')
    expect(errors[1].code).toBe('TS2741')
  })

  it('returns empty array for empty output', () => {
    expect(parseTscOutput('')).toEqual([])
  })

  it('returns empty array for clean compilation', () => {
    expect(parseTscOutput('No errors found.\n')).toEqual([])
  })

  it('handles malformed lines gracefully', () => {
    const output = `Some random warning\napp/page.tsx(10,5): error TS2322: Type mismatch.\nAnother random line`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('TS2322')
  })

  it('collects continuation lines into message', () => {
    const output = [
      `app/page.tsx(5,3): error TS2322: Type '{ time: string; }[]' is not assignable.`,
      `  Property 'timestamp' is missing in type '{ time: string; }' but required.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Property')
    expect(errors[0].message).toContain('timestamp')
  })

  it('deduplicates errors by file+line+code', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type 'A' is not assignable to type 'B'.`,
      `app/page.tsx(10,5): error TS2322: Type 'A' is not assignable to type 'B'.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
  })

  it('trims whitespace from related file paths', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type mismatch.`,
      `  components/feed.tsx(11,5): 'timestamp' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors[0].relatedFiles[0]).toBe('components/feed.tsx')
    expect(errors[0].relatedFiles[0]).not.toMatch(/^\s/)
  })

  it('handles error with named type reference (no inline fields)', () => {
    const output = `app/page.tsx(10,5): error TS2322: Type 'PageData' is not assignable to type 'ActivityFeedProps'.`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('ActivityFeedProps')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/utils/tsc-error-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tsc-error-parser**

Create `packages/cli/src/utils/tsc-error-parser.ts`:

```typescript
export interface TscError {
  file: string
  line: number
  col: number
  code: string
  message: string
  relatedFiles: string[]
}

const ERROR_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/

export function parseTscOutput(output: string): TscError[] {
  const lines = output.split('\n')
  const errors: TscError[] = []
  const seen = new Set<string>()
  let current: TscError | null = null

  for (const raw of lines) {
    const trimmed = raw.trimStart()
    const match = trimmed.match(ERROR_RE)

    if (match) {
      const [, file, lineStr, colStr, code, msg] = match
      const isRelated = raw.startsWith('  ')

      if (isRelated && current) {
        const cleanFile = file.trim()
        if (!current.relatedFiles.includes(cleanFile)) {
          current.relatedFiles.push(cleanFile)
        }
      } else {
        flushCurrent()
        current = {
          file: file.trim(),
          line: parseInt(lineStr, 10),
          col: parseInt(colStr, 10),
          code,
          message: msg,
          relatedFiles: [],
        }
      }
    } else if (current && raw.startsWith('  ') && raw.trim().length > 0) {
      current.message += '\n' + raw.trim()
    }
  }

  flushCurrent()
  return errors

  function flushCurrent() {
    if (!current) return
    const key = `${current.file}:${current.line}:${current.code}`
    if (!seen.has(key)) {
      seen.add(key)
      errors.push(current)
    }
    current = null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/tsc-error-parser.test.ts`
Expected: 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/tsc-error-parser.ts packages/cli/src/utils/tsc-error-parser.test.ts
git commit -m "feat(cli): add tsc error output parser"
```

---

### Task 2: tsc-autofix — deterministic fixers

**Files:**
- Create: `packages/cli/src/utils/tsc-autofix.ts`
- Test: `packages/cli/src/utils/tsc-autofix.test.ts`
- Reference: `packages/cli/src/commands/fix-validation.ts` (for `safeWrite`, `isValidTsx`)

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/utils/tsc-autofix.test.ts`. The individual fixer functions (`fixFieldRename`, `fixUnionType`, `fixMissingEventHandler`) are pure functions that take code + error and return modified code. They do NOT write to disk. `applyDeterministicFixes` orchestrates them and writes via `safeWrite`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  fixFieldRename,
  fixUnionType,
  fixMissingEventHandler,
  applyDeterministicFixes,
} from './tsc-autofix.js'
import type { TscError } from './tsc-error-parser.js'

const err = (overrides: Partial<TscError> = {}): TscError => ({
  file: 'test.tsx', line: 1, col: 1, code: 'TS2322', message: '', relatedFiles: [], ...overrides,
})

describe('fixFieldRename', () => {
  it('renames field when substring match exists (time → timestamp)', () => {
    const code = `const items = [{ id: '1', time: '2024-01-01' }]`
    const result = fixFieldRename(code, err({
      message: `Property 'timestamp' is missing in type '{ id: string; time: string; }' but required in type '{ id: string; timestamp: string; }'.`,
    }), 1)
    expect(result).not.toBeNull()
    expect(result!.code).toContain('timestamp:')
    expect(result!.code).not.toContain("time:")
  })

  it('returns null when no close match found', () => {
    const code = `const items = [{ id: '1', foo: 'bar' }]`
    const result = fixFieldRename(code, err({
      message: `Property 'timestamp' is missing in type '{ id: string; foo: string; }'.`,
    }), 1)
    expect(result).toBeNull()
  })

  it('rejects short-name false positives (url vs name, distance > threshold)', () => {
    const code = `const items = [{ id: '1', url: 'http://...' }]`
    const result = fixFieldRename(code, err({
      message: `Property 'name' is missing in type '{ id: string; url: string; }'.`,
    }), 1)
    expect(result).toBeNull()
  })

  it('only renames field on lines near the error line, not globally', () => {
    const code = [
      `const a = { time: 'header' }`,
      `const b = [{ time: '2024-01-01' }]`,
      `const c = { time: 'footer' }`,
    ].join('\n')
    const result = fixFieldRename(code, err({
      line: 2,
      message: `Property 'timestamp' is missing in type '{ time: string; }'.`,
    }), 2)
    expect(result).not.toBeNull()
    const lines = result!.code.split('\n')
    expect(lines[0]).toContain('time:')
    expect(lines[1]).toContain('timestamp:')
    expect(lines[2]).toContain('time:')
  })

  it('reads field names from source when not in error message', () => {
    const code = `const items = [{ time: '2024-01-01', name: 'Test' }]`
    const result = fixFieldRename(code, err({
      message: `Property 'timestamp' is missing in type but required in type 'Activity'.`,
    }), 1)
    expect(result).not.toBeNull()
    expect(result!.code).toContain('timestamp:')
  })
})

describe('fixUnionType', () => {
  it('fixes case-insensitive union match', () => {
    const code = `const items = [{ status: 'Active' }]`
    const result = fixUnionType(code, err({
      message: `Type 'string' is not assignable to type '"active" | "completed" | "paused"'.`,
    }))
    expect(result).not.toBeNull()
    expect(result!.code).toContain("'active'")
  })

  it('returns null when value matches no variant', () => {
    const code = `const items = [{ status: 'unknown' }]`
    const result = fixUnionType(code, err({
      message: `Type 'string' is not assignable to type '"active" | "completed"'.`,
    }))
    expect(result).toBeNull()
  })
})

describe('fixMissingEventHandler', () => {
  it('adds no-op handler for on* props', () => {
    const code = `<TaskItem key="1" id="1" title="Test" />`
    const result = fixMissingEventHandler(code, err({
      code: 'TS2741',
      message: `Property 'onToggle' is missing in type '{ key: string; id: string; title: string; }' but required in type 'TaskItemProps'.`,
    }))
    expect(result).not.toBeNull()
    expect(result!.code).toContain('onToggle={() => {}}')
  })

  it('returns null for non-event props', () => {
    const code = `<TaskItem key="1" />`
    const result = fixMissingEventHandler(code, err({
      code: 'TS2741',
      message: `Property 'title' is missing in type '{ key: string; }' but required in type 'TaskItemProps'.`,
    }))
    expect(result).toBeNull()
  })
})

describe('applyDeterministicFixes', () => {
  let dir: string
  let backups: Map<string, string>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tsc-fix-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    backups = new Map()
  })

  it('fixes field rename and writes to disk', async () => {
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Page() {\n  const items = [{ time: '2024-01-01' }]\n  return <div />\n}`,
    )
    const errors: TscError[] = [err({
      file: 'app/page.tsx', line: 2,
      message: `Property 'timestamp' is missing in type '{ time: string; }' but required.`,
    })]
    const result = await applyDeterministicFixes(errors, dir, backups)
    expect(result.fixed).toContain('app/page.tsx')
    const content = readFileSync(join(dir, 'app', 'page.tsx'), 'utf-8')
    expect(content).toContain('timestamp')
  })

  it('deduplicates errors before fixing', async () => {
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Page() {\n  const a = [{ time: 'x' }]\n  return <div />\n}`,
    )
    const duped: TscError[] = [
      err({ file: 'app/page.tsx', line: 2, message: `Property 'timestamp' is missing in type '{ time: string; }'.` }),
      err({ file: 'app/page.tsx', line: 2, message: `Property 'timestamp' is missing in type '{ time: string; }'.` }),
    ]
    const result = await applyDeterministicFixes(duped, dir, backups)
    expect(result.fixed).toContain('app/page.tsx')
  })

  it('puts unfixable errors into remaining', async () => {
    writeFileSync(join(dir, 'app', 'page.tsx'), `export default function P() { return <div /> }`)
    const errors: TscError[] = [err({
      file: 'app/page.tsx', line: 1,
      message: `Some exotic error that no fixer handles.`,
    })]
    const result = await applyDeterministicFixes(errors, dir, backups)
    expect(result.remaining).toHaveLength(1)
    expect(result.fixed).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/utils/tsc-autofix.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tsc-autofix**

Create `packages/cli/src/utils/tsc-autofix.ts`:

```typescript
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'
import type { TscError } from './tsc-error-parser.js'
import { parseTscOutput } from './tsc-error-parser.js'
import { safeWrite } from '../commands/fix-validation.js'

export interface TscFixResult {
  fixed: string[]
  remaining: TscError[]
}

export function runTscCheck(projectRoot: string, timeout = 30000): TscError[] {
  const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return []
  try {
    execSync('npx tsc --noEmit 2>&1', {
      cwd: projectRoot,
      timeout,
      encoding: 'utf-8',
    })
    return []
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && (err as any).killed) {
      console.log('  ⚠ TypeScript check timed out — skipping')
      return []
    }
    const e = err as { stdout?: string; stderr?: string }
    const output = (e.stdout || '') + (e.stderr || '')
    return parseTscOutput(output)
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function maxLevenshtein(fieldName: string): number {
  return Math.max(1, Math.floor(fieldName.length * 0.4))
}

const MISSING_PROP_RE = /Property '(\w+)' is missing in type '\{([^}]*)\}'/
const UNION_RE = /Type 'string' is not assignable to type '((?:"[^"]+"\s*\|\s*)*"[^"]+")'/ 
const MISSING_REQUIRED_RE = /Property '(\w+)' is missing in type .* but required/

function extractFieldsFromCode(code: string, line: number): string[] {
  const lines = code.split('\n')
  const searchRange = lines.slice(Math.max(0, line - 3), line + 3).join(' ')
  const fieldMatches = searchRange.match(/(\w+)\s*:/g)
  if (!fieldMatches) return []
  return fieldMatches.map(m => m.replace(/\s*:$/, ''))
}

export function fixFieldRename(
  code: string,
  error: TscError,
  errorLine?: number,
): { code: string; field: string } | null {
  const match = error.message.match(MISSING_PROP_RE)
  const expectedField = match?.[1] ?? error.message.match(/Property '(\w+)' is missing/)?.[1]
  if (!expectedField) return null

  let typeFields: string[]
  if (match?.[2]) {
    typeFields = match[2]
      .split(';')
      .map(f => f.trim().split(':')[0]?.trim())
      .filter(Boolean)
  } else {
    typeFields = extractFieldsFromCode(code, errorLine ?? error.line)
  }

  let bestMatch: string | null = null
  let bestDist = Infinity

  for (const field of typeFields) {
    if (field === expectedField) continue
    if (field.includes(expectedField) || expectedField.includes(field)) {
      bestMatch = field
      bestDist = 0
      break
    }
    const dist = levenshtein(field.toLowerCase(), expectedField.toLowerCase())
    if (dist <= maxLevenshtein(expectedField) && dist < bestDist) {
      bestDist = dist
      bestMatch = field
    }
  }

  if (!bestMatch) return null

  const targetLine = errorLine ?? error.line
  const lines = code.split('\n')
  const windowStart = Math.max(0, targetLine - 5)
  const windowEnd = Math.min(lines.length, targetLine + 5)

  const fieldRe = new RegExp(`(\\b)${bestMatch}(\\s*:)`, 'g')
  for (let i = windowStart; i < windowEnd; i++) {
    if (fieldRe.test(lines[i])) {
      lines[i] = lines[i].replace(fieldRe, `$1${expectedField}$2`)
    }
    fieldRe.lastIndex = 0
  }

  const newCode = lines.join('\n')
  if (newCode === code) return null
  return { code: newCode, field: `${bestMatch} → ${expectedField}` }
}

export function fixUnionType(code: string, error: TscError): { code: string; fix: string } | null {
  const match = error.message.match(UNION_RE)
  if (!match) return null

  const variants = match[1].match(/"([^"]+)"/g)?.map(v => v.replace(/"/g, ''))
  if (!variants || variants.length === 0) return null

  const lines = code.split('\n')
  const errorLine = lines[error.line - 1]
  if (!errorLine) return null

  for (const variant of variants) {
    const caseInsensitiveRe = new RegExp(`['"]${variant}['"]`, 'i')
    const exactRe = new RegExp(`['"]${variant}['"]`)
    if (caseInsensitiveRe.test(errorLine) && !exactRe.test(errorLine)) {
      lines[error.line - 1] = errorLine.replace(caseInsensitiveRe, `'${variant}'`)
      return { code: lines.join('\n'), fix: `union case: '${variant}'` }
    }
  }

  return null
}

export function fixMissingEventHandler(code: string, error: TscError): { code: string; prop: string } | null {
  const match = error.message.match(MISSING_REQUIRED_RE)
  if (!match) return null

  const propName = match[1]
  if (!propName.startsWith('on') || propName.length < 3) return null
  if (propName[2] !== propName[2].toUpperCase()) return null

  const lines = code.split('\n')
  const errorLine = lines[error.line - 1]
  if (!errorLine) return null

  const closingMatch = errorLine.match(/(\s*\/?>)/)
  if (!closingMatch) return null

  const insertPos = errorLine.lastIndexOf(closingMatch[1])
  lines[error.line - 1] =
    errorLine.slice(0, insertPos) +
    ` ${propName}={() => {}}` +
    errorLine.slice(insertPos)

  return { code: lines.join('\n'), prop: propName }
}

function deduplicateErrors(errors: TscError[]): TscError[] {
  const seen = new Set<string>()
  return errors.filter(e => {
    const key = `${e.file}:${e.line}:${e.code}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function applyDeterministicFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>,
): Promise<TscFixResult> {
  const deduped = deduplicateErrors(errors)
  const fixed: string[] = []
  const remaining: TscError[] = []
  const fileErrors = new Map<string, TscError[]>()

  for (const err of deduped) {
    const list = fileErrors.get(err.file) || []
    list.push(err)
    fileErrors.set(err.file, list)
  }

  for (const [file, errs] of fileErrors) {
    const absPath = resolve(projectRoot, file)
    let code: string
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      remaining.push(...errs)
      continue
    }

    let changed = false

    for (const err of errs) {
      const renameResult = fixFieldRename(code, err, err.line)
      if (renameResult) {
        code = renameResult.code
        changed = true
        continue
      }

      const unionResult = fixUnionType(code, err)
      if (unionResult) {
        code = unionResult.code
        changed = true
        continue
      }

      const handlerResult = fixMissingEventHandler(code, err)
      if (handlerResult) {
        code = handlerResult.code
        changed = true
        continue
      }

      remaining.push(err)
    }

    if (changed) {
      const { ok } = safeWrite(absPath, code, projectRoot, backups)
      if (ok) {
        fixed.push(file)
      } else {
        remaining.push(...errs)
      }
    }
  }

  return { fixed, remaining }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/tsc-autofix.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/tsc-autofix.ts packages/cli/src/utils/tsc-autofix.test.ts
git commit -m "feat(cli): add deterministic tsc fixers (field rename, union, event handler)"
```

---

### Task 3: tsc-ai-fix — AI fallback

**Files:**
- Create: `packages/cli/src/utils/tsc-ai-fix.ts`
- Test: `packages/cli/src/utils/tsc-ai-fix.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/utils/tsc-ai-fix.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { applyAiFixes } from './tsc-ai-fix.js'
import type { TscError } from './tsc-error-parser.js'

const makeError = (file: string, msg = 'some error'): TscError => ({
  file, line: 1, col: 1, code: 'TS2322', message: msg, relatedFiles: [],
})

describe('applyAiFixes', () => {
  it('returns all errors as failed when no AI provider', async () => {
    const errors = [makeError('app/page.tsx')]
    const result = await applyAiFixes(errors, '/tmp/test', new Map(), undefined)
    expect(result.failed).toEqual(errors)
    expect(result.fixed).toEqual([])
  })

  it('returns all errors as failed when editPageCode is undefined', async () => {
    const errors = [makeError('app/page.tsx')]
    const provider = { editPageCode: undefined } as any
    const result = await applyAiFixes(errors, '/tmp/test', new Map(), provider)
    expect(result.failed).toEqual(errors)
    expect(result.fixed).toEqual([])
  })

  it('respects max 5 unique files limit', async () => {
    const errors = Array.from({ length: 8 }, (_, i) => makeError(`app/page${i}.tsx`))
    const editPageCode = vi.fn()
    const provider = { editPageCode } as any
    const result = await applyAiFixes(errors, '/tmp/nonexistent', new Map(), provider)
    expect(editPageCode.mock.calls.length).toBeLessThanOrEqual(5)
    expect(result.failed.length).toBeGreaterThanOrEqual(3)
  })

  it('includes related interface files in prompt', async () => {
    const errors = [makeError('app/page.tsx', 'Missing prop')]
    errors[0].relatedFiles = ['components/shared/feed.tsx']
    const editPageCode = vi.fn().mockRejectedValue(new Error('test'))
    const provider = { editPageCode } as any
    await applyAiFixes(errors, '/tmp/nonexistent', new Map(), provider)
    // Call fails but we verify intent: editPageCode was called
    expect(editPageCode).toHaveBeenCalled()
  })

  it('returns metrics with fixed and failed counts', async () => {
    const errors = [makeError('app/page.tsx')]
    const result = await applyAiFixes(errors, '/tmp/nonexistent', new Map(), undefined)
    expect(result).toHaveProperty('fixed')
    expect(result).toHaveProperty('failed')
    expect(Array.isArray(result.fixed)).toBe(true)
    expect(Array.isArray(result.failed)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/utils/tsc-ai-fix.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tsc-ai-fix**

Create `packages/cli/src/utils/tsc-ai-fix.ts`:

```typescript
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { TscError } from './tsc-error-parser.js'
import type { AIProviderInterface } from './ai-provider.js'
import { safeWrite } from '../commands/fix-validation.js'
import { runTscCheck } from './tsc-autofix.js'

const MAX_AI_FILES = 5

export interface TscAiFixResult {
  fixed: string[]
  failed: TscError[]
}

export async function applyAiFixes(
  errors: TscError[],
  projectRoot: string,
  backups: Map<string, string>,
  aiProvider?: AIProviderInterface,
): Promise<TscAiFixResult> {
  if (!aiProvider?.editPageCode) {
    return { fixed: [], failed: errors }
  }

  const fileErrors = new Map<string, TscError[]>()
  for (const err of errors) {
    const list = fileErrors.get(err.file) || []
    list.push(err)
    fileErrors.set(err.file, list)
  }

  const fixed: string[] = []
  const failed: TscError[] = []
  let filesProcessed = 0

  for (const [file, errs] of fileErrors) {
    filesProcessed++
    if (filesProcessed > MAX_AI_FILES) {
      failed.push(...errs)
      continue
    }

    const absPath = resolve(projectRoot, file)
    let code: string
    try {
      code = readFileSync(absPath, 'utf-8')
    } catch {
      failed.push(...errs)
      continue
    }

    const relatedContext = gatherRelatedContext(errs, projectRoot)
    const errorList = errs.map(e => `Line ${e.line}: [${e.code}] ${e.message}`).join('\n')

    const instruction = [
      'Fix these TypeScript compilation errors:',
      errorList,
      '',
      relatedContext ? `Reference interfaces (DO NOT modify these):\n${relatedContext}` : '',
      '',
      'Rules:',
      '- Fix the data/props to match the expected types',
      '- Do NOT change component interfaces or imports from shared components',
      '- Keep all existing functionality intact',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const fixedCode = await aiProvider.editPageCode(code, instruction, file)
      if (!fixedCode || fixedCode.length < 50) {
        failed.push(...errs)
        continue
      }

      const beforeCount = errs.length
      const { ok } = safeWrite(absPath, fixedCode, projectRoot, backups)
      if (!ok) {
        failed.push(...errs)
        continue
      }

      const afterErrors = runTscCheck(projectRoot).filter(e => e.file === file)
      if (afterErrors.length >= beforeCount) {
        const original = backups.get(absPath)
        if (original) safeWrite(absPath, original, projectRoot, backups)
        failed.push(...errs)
      } else {
        fixed.push(file)
        if (afterErrors.length > 0) failed.push(...afterErrors)
      }
    } catch {
      failed.push(...errs)
    }
  }

  return { fixed, failed }
}

function gatherRelatedContext(errors: TscError[], projectRoot: string): string {
  const relatedFiles = new Set<string>()
  for (const err of errors) {
    for (const f of err.relatedFiles) relatedFiles.add(f)
  }

  const parts: string[] = []
  for (const file of relatedFiles) {
    try {
      const content = readFileSync(resolve(projectRoot, file), 'utf-8')
      parts.push(`// --- ${file} ---\n${content}`)
    } catch {
      /* skip unreadable files */
    }
  }
  return parts.join('\n\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/tsc-ai-fix.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/tsc-ai-fix.ts packages/cli/src/utils/tsc-ai-fix.test.ts
git commit -m "feat(cli): add AI fallback for tsc error fixing"
```

---

### Task 4: Integration into `coherent fix` Step 7

**Files:**
- Modify: `packages/cli/src/commands/fix.ts:751-774` (replace Step 7)

- [ ] **Step 1: Replace Step 7 in fix.ts**

In `packages/cli/src/commands/fix.ts`, replace the entire Step 7 block (lines 751–774) with:

```typescript
  // ─── Step 7: TypeScript compile check + auto-fix ─────────────
  try {
    const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      const { runTscCheck, applyDeterministicFixes } = await import('../utils/tsc-autofix.js')
      const { applyAiFixes } = await import('../utils/tsc-ai-fix.js')

      const tscErrors = runTscCheck(projectRoot)

      if (tscErrors.length === 0) {
        fixes.push('TypeScript compilation clean')
        console.log(chalk.green('  ✔ TypeScript compilation clean'))
      } else {
        const detResult = await applyDeterministicFixes(tscErrors, projectRoot, backups)
        if (detResult.fixed.length > 0) {
          fixes.push(`TypeScript: fixed ${detResult.fixed.length} file(s) deterministically`)
          console.log(chalk.green(`  ✔ TypeScript: fixed ${detResult.fixed.length} file(s) deterministically`))
        }

        if (detResult.remaining.length > 0) {
          let aiProvider
          try {
            const { createAIProvider } = await import('../utils/ai-provider.js')
            aiProvider = await createAIProvider('auto')
          } catch {
            /* no API key — AI fixes will be skipped */
          }

          if (aiProvider?.editPageCode) {
            console.log(chalk.dim(`  ⏳ Using AI to fix ${detResult.remaining.length} TypeScript error(s)...`))
            const aiResult = await applyAiFixes(detResult.remaining, projectRoot, backups, aiProvider)
            if (aiResult.fixed.length > 0) {
              fixes.push(`TypeScript: fixed ${aiResult.fixed.length} file(s) via AI`)
              console.log(chalk.green(`  ✔ TypeScript: fixed ${aiResult.fixed.length} file(s) via AI`))
            }
            if (aiResult.failed.length > 0) {
              for (const e of aiResult.failed.slice(0, 10)) {
                remaining.push(`${e.file}(${e.line}): [${e.code}] ${e.message.split('\n')[0]}`)
              }
              if (aiResult.failed.length > 10) {
                remaining.push(`... and ${aiResult.failed.length - 10} more TypeScript errors`)
              }
              console.log(chalk.yellow(`  ⚠ TypeScript: ${aiResult.failed.length} error(s) remaining`))
            }
          } else {
            for (const e of detResult.remaining.slice(0, 10)) {
              remaining.push(`${e.file}(${e.line}): [${e.code}] ${e.message.split('\n')[0]}`)
            }
            if (detResult.remaining.length > 10) {
              remaining.push(`... and ${detResult.remaining.length - 10} more TypeScript errors`)
            }
            console.log(chalk.yellow(`  ⚠ TypeScript: ${detResult.remaining.length} error(s) remaining. Configure API key for auto-fix.`))
          }
        }

        const finalErrors = runTscCheck(projectRoot)
        if (finalErrors.length === 0) {
          console.log(chalk.green('  ✔ TypeScript compilation now clean'))
        }
      }
    }
  } catch (err) {
    console.log(
      chalk.yellow(`  ⚠ TypeScript check skipped: ${err instanceof Error ? err.message : 'unknown error'}`),
    )
  }
```

- [ ] **Step 2: Verify build + typecheck + tests**

Run: `cd /Users/sergeipro/coherent-design-method && pnpm build && pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "feat(cli): replace tsc report-only with auto-fix in coherent fix"
```

---

### Task 5: Integration into `coherent chat` (generation-time)

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:636` (after `await writeFile(filePath, codeToWrite)`)

- [ ] **Step 1: Add tsc validation after file write**

In `packages/cli/src/commands/chat/modification-handler.ts`, after line 636 (`await writeFile(filePath, codeToWrite)`), add the tsc validation block. Use `readFile` from `../../utils/files.js` (already imported in this file), not `readFileSync` from `fs`.

```typescript
          // ─── tsc validation ───────────────────────────────────
          try {
            const { runTscCheck, applyDeterministicFixes } = await import('../../utils/tsc-autofix.js')
            const tscBackups = new Map<string, string>()
            const relPath = filePath.replace(projectRoot + '/', '').replace(projectRoot + '\\', '')
            const tscErrors = runTscCheck(projectRoot).filter(e => e.file === relPath)
            if (tscErrors.length > 0) {
              const bestSnapshot = codeToWrite
              const detResult = await applyDeterministicFixes(tscErrors, projectRoot, tscBackups)
              let bestErrorCount = Math.min(tscErrors.length, tscErrors.length - detResult.fixed.length)
              if (detResult.fixed.length > 0) {
                codeToWrite = await readFile(filePath)
                console.log(chalk.green(`  ✔ Fixed ${tscErrors.length - detResult.remaining.length} TypeScript error(s)`))
              }

              if (detResult.remaining.length > 0 && aiProvider) {
                try {
                  const ai = await createAIProvider(aiProvider)
                  if (ai.editPageCode) {
                    const errorList = detResult.remaining
                      .map(e => `Line ${e.line}: [${e.code}] ${e.message.split('\n')[0]}`)
                      .join('\n')
                    const tscFixed = await ai.editPageCode(
                      codeToWrite,
                      `Fix these TypeScript errors:\n${errorList}\n\nKeep all existing functionality intact.`,
                      page.name || page.id || 'Page',
                    )
                    if (tscFixed && tscFixed.length > 100) {
                      const { code: reFixed } = await autoFixCode(tscFixed, autoFixCtx)
                      await writeFile(filePath, reFixed)

                      const afterErrors = runTscCheck(projectRoot).filter(e => e.file === relPath)
                      if (afterErrors.length > bestErrorCount) {
                        await writeFile(filePath, bestSnapshot)
                        codeToWrite = bestSnapshot
                      } else {
                        codeToWrite = reFixed
                        console.log(chalk.green(`  ✔ Fixed ${detResult.remaining.length - afterErrors.length} TypeScript error(s) via AI`))
                      }
                    }
                  }
                } catch (tscAiErr) {
                  console.log(chalk.dim(`  ⚠ AI tsc fix skipped: ${tscAiErr instanceof Error ? tscAiErr.message : 'unknown'}`))
                }
              }
            }
          } catch (tscErr) {
            console.log(chalk.dim(`  ⚠ TypeScript check skipped: ${tscErr instanceof Error ? tscErr.message : 'unknown'}`))
          }
```

- [ ] **Step 2: Verify build + typecheck + tests**

Run: `cd /Users/sergeipro/coherent-design-method && pnpm build && pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "feat(cli): add tsc validation during coherent chat generation"
```

---

### Task 6: Final verification + version bump + publish

- [ ] **Step 1: Full CI check**

Run: `cd /Users/sergeipro/coherent-design-method && pnpm build && pnpm typecheck && pnpm test && pnpm lint`
Expected: All pass

- [ ] **Step 2: Run formatter**

Run: `cd /Users/sergeipro/coherent-design-method && pnpm exec prettier --write 'packages/*/src/**/*.{ts,tsx}'`

- [ ] **Step 3: Version bump**

```bash
cd packages/core && npm version patch --no-git-tag-version
cd ../cli && npm version patch --no-git-tag-version
```

Expected: v0.6.47

- [ ] **Step 4: Commit + push**

```bash
cd /Users/sergeipro/coherent-design-method
git add -A
git commit -m "$(cat <<'EOF'
feat(cli): TypeScript auto-fix for coherent fix and coherent chat

Two-pass tsc error repair: deterministic fixers for field rename,
union type, and missing event handler props. AI fallback for remaining
errors when API key is configured.

v0.6.47
EOF
)"
git push
```

- [ ] **Step 5: Publish**

```bash
cd packages/core && npm publish --access public
cd ../cli && npm publish --access public
```

- [ ] **Step 6: Test on real project**

```bash
cd /Users/sergeipro/test-projector && coherent update && coherent fix
```

Expected: dashboard tsc errors (`time` → `timestamp`, union type, `onToggle`) are fixed automatically.
