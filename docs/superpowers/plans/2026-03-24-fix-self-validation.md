# Fix Self-Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `coherent fix` never break files it touches, detect already-broken files, and eliminate false "unused component" warnings.

**Architecture:** Add three protection layers to fix.ts: (1) in-memory backup with automatic rollback, (2) TypeScript-based TSX parse validation, (3) post-transform incremental edit verification. Fix `isUsedInLayout` to scan all route group layouts. Replace silent `catch {}` with logged warnings.

**Tech Stack:** TypeScript compiler API (from user's project node_modules), vitest, existing `verifyIncrementalEdit` from quality-validator.

---

### Task 1: `isValidTsx` + `safeWrite` utilities in fix.ts

**Files:**
- Create: `packages/cli/src/commands/fix-validation.ts`
- Test: `packages/cli/src/commands/fix-validation.test.ts`
- (Wired into `fix.ts` in Task 3)

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/commands/fix-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isValidTsx, safeWrite } from './fix-validation.js'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('isValidTsx', () => {
  const projectRoot = process.cwd().replace(/\/packages\/cli$/, '')

  it('returns true for valid TSX', () => {
    const code = `'use client'\nexport default function Page() {\n  return <div>Hello</div>\n}\n`
    expect(isValidTsx(code, projectRoot)).toBe(true)
  })

  it('returns false for broken JSX tag', () => {
    const code = `'use client'\nexport default function Page() {\n  return (\n    <\n    />\n  )\n}\n`
    expect(isValidTsx(code, projectRoot)).toBe(false)
  })

  it('returns false for unbalanced braces', () => {
    const code = `export default function Page() {\n  return <div>{unclosed</div>\n`
    expect(isValidTsx(code, projectRoot)).toBe(false)
  })

  it('returns true when typescript is not resolvable', () => {
    expect(isValidTsx('broken <', '/nonexistent/path')).toBe(true)
  })

  it('skips validation for non-TSX content', () => {
    const css = `:root { --primary: #000; }`
    expect(isValidTsx(css, projectRoot, '.css')).toBe(true)
  })
})

describe('safeWrite', () => {
  const tmpDir = join(tmpdir(), 'fix-validation-test')
  const projectRoot = process.cwd().replace(/\/packages\/cli$/, '')

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes valid content successfully', () => {
    const filePath = join(tmpDir, 'good.tsx')
    writeFileSync(filePath, 'export default function Old() { return <div/> }', 'utf-8')
    const backups = new Map<string, string>()
    const result = safeWrite(filePath, 'export default function New() { return <div/> }', projectRoot, backups)
    expect(result.ok).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toContain('New')
  })

  it('rolls back broken content and restores original', () => {
    const filePath = join(tmpDir, 'bad.tsx')
    const original = 'export default function Page() { return <div/> }'
    writeFileSync(filePath, original, 'utf-8')
    const backups = new Map<string, string>()
    const result = safeWrite(filePath, '<\n />', projectRoot, backups)
    expect(result.ok).toBe(false)
    expect(readFileSync(filePath, 'utf-8')).toBe(original)
  })

  it('captures backup only on first write', () => {
    const filePath = join(tmpDir, 'multi.tsx')
    writeFileSync(filePath, 'const a = 1', 'utf-8')
    const backups = new Map<string, string>()
    safeWrite(filePath, 'export default function A() { return <div/> }', projectRoot, backups)
    safeWrite(filePath, 'export default function B() { return <div/> }', projectRoot, backups)
    expect(backups.get(filePath)).toBe('const a = 1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/commands/fix-validation.test.ts`
Expected: FAIL — module `./fix-validation.js` does not exist

- [ ] **Step 3: Create the fix-validation module**

Create `packages/cli/src/commands/fix-validation.ts`:

```typescript
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

let cachedTs: any = null
let cachedProjectRoot: string | null = null

export function isValidTsx(code: string, projectRoot: string, ext: string = '.tsx'): boolean {
  if (ext !== '.tsx' && ext !== '.ts') return true
  try {
    if (!cachedTs || cachedProjectRoot !== projectRoot) {
      const req = createRequire(join(projectRoot, 'package.json'))
      cachedTs = req('typescript')
      cachedProjectRoot = projectRoot
    }
    const sf = cachedTs.createSourceFile(
      'check.tsx', code, cachedTs.ScriptTarget.Latest, false, cachedTs.ScriptKind.TSX
    )
    const diagnostics = (sf as any).parseDiagnostics
    return !diagnostics || diagnostics.length === 0
  } catch {
    return true
  }
}

export function safeWrite(
  filePath: string,
  newContent: string,
  projectRoot: string,
  backups: Map<string, string>,
): { ok: boolean } {
  if (!backups.has(filePath)) {
    try { backups.set(filePath, readFileSync(filePath, 'utf-8')) } catch { /* new file */ }
  }
  const ext = filePath.slice(filePath.lastIndexOf('.'))
  writeFileSync(filePath, newContent, 'utf-8')
  if (!isValidTsx(newContent, projectRoot, ext)) {
    const original = backups.get(filePath)
    if (original) writeFileSync(filePath, original, 'utf-8')
    return { ok: false }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/commands/fix-validation.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All 561+ tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/fix-validation.ts packages/cli/src/commands/fix-validation.test.ts
git commit -m "feat: add isValidTsx and safeWrite utilities for fix self-validation"
```

---

### Task 2: Update `isUsedInLayout` to scan route group layouts

**Files:**
- Modify: `packages/cli/src/utils/component-integrity.ts:107-116`

- [ ] **Step 1: Write failing test**

There is no existing test file for `component-integrity.ts`. Create `packages/cli/src/utils/component-integrity.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isUsedInLayout } from './component-integrity.js'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('isUsedInLayout', () => {
  const tmpRoot = join(tmpdir(), 'component-integrity-test')

  beforeEach(() => {
    mkdirSync(join(tmpRoot, 'app', '(app)'), { recursive: true })
    mkdirSync(join(tmpRoot, 'app', '(public)'), { recursive: true })
    mkdirSync(join(tmpRoot, 'app', '(auth)'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('finds component in root layout', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), `import { Header } from '@/components/shared/header'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'Header')
    expect(result).toEqual(['app/layout.tsx'])
  })

  it('finds component in route group layout', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), 'export default function Layout({ children }) { return children }', 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(app)', 'layout.tsx'), `import { AppSidebar } from '@/components/shared/sidebar'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'AppSidebar')
    expect(result).toEqual(['app/(app)/layout.tsx'])
  })

  it('finds component in multiple layouts', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), `import { ThemeProvider } from 'next-themes'`, 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(public)', 'layout.tsx'), `import { Header } from '@/components/shared/header'\nimport { Footer } from '@/components/shared/footer'`, 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(app)', 'layout.tsx'), `import { Header } from '@/components/shared/header'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'Header')
    expect(result).toContain('app/(public)/layout.tsx')
    expect(result).toContain('app/(app)/layout.tsx')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when component not in any layout', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), 'export default function L({ children }) { return children }', 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'NonExistent')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/utils/component-integrity.test.ts`
Expected: FAIL — `isUsedInLayout` returns `boolean`, not `string[]`

- [ ] **Step 3: Update `isUsedInLayout` implementation**

In `packages/cli/src/utils/component-integrity.ts`, replace the function (lines 107-116):

```typescript
export function isUsedInLayout(projectRoot: string, componentName: string): string[] {
  const appDir = join(projectRoot, 'app')
  const layoutPaths = [join(appDir, 'layout.tsx')]

  if (existsSync(appDir)) {
    try {
      for (const entry of readdirSync(appDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('(') && entry.name.endsWith(')')) {
          layoutPaths.push(join(appDir, entry.name, 'layout.tsx'))
        }
      }
    } catch { /* appDir not readable */ }
  }

  const matched: string[] = []
  for (const lp of [...new Set(layoutPaths)]) {
    try {
      if (readFileSync(lp, 'utf-8').includes(componentName)) {
        matched.push(relative(projectRoot, lp))
      }
    } catch { /* file doesn't exist */ }
  }
  return matched
}
```

Add `relative` to imports if not already imported (check existing imports at top of file).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/component-integrity.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Update callers**

In `packages/cli/src/commands/fix.ts`, update two usages:

**Line ~445-446** (section 6b):
```typescript
// Before:
const inLayout = isUsedInLayout(project.root, entry.name)
const fullActual = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn

// After:
const layoutPaths = isUsedInLayout(project.root, entry.name)
const fullActual = [...new Set([...actualUsedIn, ...layoutPaths])]
```

**Line ~489-490** (section 6d):
```typescript
// Before:
const inLayout = isUsedInLayout(project.root, entry.name)
if (actualUsedIn.length === 0 && !inLayout) {

// After:
const layoutPaths2 = isUsedInLayout(project.root, entry.name)
if (actualUsedIn.length === 0 && layoutPaths2.length === 0) {
```

In `packages/cli/src/commands/check.ts`, update all three usages (~lines 291-309):
```typescript
// Before (line 291-292):
const inLayout = isUsedInLayout(projectRoot, entry.name)
const totalUsage = actualUsedIn.length + (inLayout ? 1 : 0)

// After:
const layoutPaths = isUsedInLayout(projectRoot, entry.name)
const totalUsage = actualUsedIn.length + layoutPaths.length

// Before (line 296):
const fullActual = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn

// After:
const fullActual = [...new Set([...actualUsedIn, ...layoutPaths])]

// Before (line 309):
const usageDesc = inLayout ? `layout + ${actualUsedIn.length} page(s)` : `${actualUsedIn.length} page(s)`

// After:
const usageDesc = layoutPaths.length > 0 ? `layout(${layoutPaths.length}) + ${actualUsedIn.length} page(s)` : `${actualUsedIn.length} page(s)`
```

In `packages/cli/src/utils/component-integrity.ts`, update `reconcileComponents` (~lines 304-305):
```typescript
// Before:
const inLayout = isUsedInLayout(projectRoot, entry.name)
const fullUsedIn = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn

// After:
const layoutPaths = isUsedInLayout(projectRoot, entry.name)
const fullUsedIn = [...new Set([...actualUsedIn, ...layoutPaths])]
```

- [ ] **Step 6: Run full test suite + typecheck**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: All pass (build, typecheck, 561+ tests)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/utils/component-integrity.ts packages/cli/src/utils/component-integrity.test.ts packages/cli/src/commands/fix.ts packages/cli/src/commands/check.ts
git commit -m "fix: isUsedInLayout scans route group layouts, returns paths

Eliminates false 'unused' warnings for Header, Footer, AppSidebar,
ThemeToggle when used in (app)/(public)/(auth) layouts.
Updates all callers: fix.ts, check.ts, reconcileComponents."
```

---

### Task 3: Integrate `safeWrite` into fix.ts + transparent errors

**Files:**
- Modify: `packages/cli/src/commands/fix.ts` (multiple locations)

- [ ] **Step 1: Add imports and tracking variable**

At top of `fix.ts`, add `relative` to the path import and the new import:
```typescript
import { resolve, join, relative } from 'path'
import { safeWrite } from './fix-validation.js'
```

Merge `verifyIncrementalEdit` into the existing quality-validator import (line 45):
```typescript
import { validatePageQuality, formatIssues, autoFixCode, verifyIncrementalEdit } from '../utils/quality-validator.js'
```

Inside `fixCommand`, after `const remaining: string[] = []` (line 98), add:
```typescript
const backups = new Map<string, string>()
const modifiedFiles: string[] = []
```

- [ ] **Step 2: Replace `writeFileSync` calls with `safeWrite`**

Replace all `writeFileSync` calls that write TSX content with `safeWrite`. Key locations:

**Step 4 — syntax fix (~line 226):**
```typescript
// Before:
if (!dryRun) writeFileSync(file, fixed, 'utf-8')

// After:
if (!dryRun) {
  const result = safeWrite(file, fixed, projectRoot, backups)
  if (result.ok) modifiedFiles.push(file)
  else console.log(chalk.yellow(`  ⚠ Syntax fix rolled back for ${relative(projectRoot, file)} (parse error)`))
}
```

**Step 4b — layout writes** — all `writeFileSync` calls writing `.tsx` files within the `try` block (lines 237-347). For each:
```typescript
// Pattern: replace writeFileSync(path, code, 'utf-8') with:
const result = safeWrite(path, code, projectRoot, backups)
if (!result.ok) {
  console.log(chalk.yellow(`  ⚠ Layout write rolled back for ${relative(projectRoot, path)} (parse error)`))
}
```

Keep `writeFileSync` for non-TSX files (e.g., if any `.css` writes exist — none currently).

**Step 5 — quality auto-fix (~line 362):**
```typescript
// Before:
writeFileSync(file, autoFixed, 'utf-8')

// After:
const result = safeWrite(file, autoFixed, projectRoot, backups)
if (result.ok) modifiedFiles.push(file)
else console.log(chalk.yellow(`  ⚠ Quality fix rolled back for ${relative(projectRoot, file)} (parse error)`))
```

- [ ] **Step 3: Fix `catch {}` blocks**

**Plan loading (~line 349):**
```typescript
// Before:
} catch {
  /* no plan or layout error — skip */
}

// After:
} catch (err) {
  console.log(chalk.yellow(`  ⚠ Layout repair skipped: ${err instanceof Error ? err.message : 'unknown error'}`))
}
```

**Manifest parsing (~line 494):**
```typescript
// Before:
} catch {
  /* no manifest */
}

// After:
} catch (err) {
  const isNotFound = err instanceof Error && ('code' in err && (err as any).code === 'ENOENT')
  if (!isNotFound) {
    console.log(chalk.yellow(`  ⚠ Component manifest check skipped: ${err instanceof Error ? err.message : 'unknown error'}`))
  }
}
```

Keep line 79 (`listTsxFiles`) silent — intentional for traversal errors.

- [ ] **Step 4: Add `verifyIncrementalEdit` post-check**

After step 5 (quality auto-fix), before step 6 (manifest), add:

```typescript
  // ─── Step 5b: Verify incremental edits ──────────────────────────────
  for (const file of modifiedFiles) {
    if (!backups.has(file)) continue
    const before = backups.get(file)!
    const after = readFileSync(file, 'utf-8')
    const issues = verifyIncrementalEdit(before, after)
    if (issues.length > 0) {
      const relPath = relative(projectRoot, file)
      for (const issue of issues) {
        remaining.push(`${relPath}: ${issue.message}`)
      }
    }
  }
```

- [ ] **Step 5: Update sidebar regeneration trigger**

Replace the existing sidebar regeneration block (~lines 313-327) with:

```typescript
        const sidebarComponentPath2 = resolve(projectRoot, 'components', 'shared', 'sidebar.tsx')
        if (existsSync(sidebarComponentPath2)) {
          const sidebarCode = readFileSync(sidebarComponentPath2, 'utf-8')
          const hasWrongName = sidebarCode.includes('My App') && configName !== 'My App'
          const hasTrigger = sidebarCode.includes('SidebarTrigger')
          if (hasWrongName || hasTrigger) {
            if (!dsm) {
              dsm = new DesignSystemManager(project.configPath)
              await dsm.load()
            }
            const { PageGenerator } = await import('@getcoherent/core')
            const gen = new PageGenerator(dsm.getConfig())
            const result = safeWrite(sidebarComponentPath2, gen.generateSharedSidebarCode(), projectRoot, backups)
            if (result.ok) {
              fixes.push('Regenerated sidebar component')
              console.log(chalk.green('  ✔ Regenerated sidebar component'))
            } else {
              console.log(chalk.yellow('  ⚠ Sidebar regeneration failed validation — restored original'))
            }
          }
        }
```

Note: `configName` variable is already defined earlier in the same block (line 304).

- [ ] **Step 6: Run full test suite + typecheck + build**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "feat: integrate safeWrite into fix.ts with rollback + transparent errors

All TSX writes go through safeWrite with parse validation.
Broken transforms auto-rollback and warn. Silent catch blocks
now log warnings. verifyIncrementalEdit runs post-transform."
```

---

### Task 4: Create Cursor rule

**Files:**
- Create: `.cursor/rules/safe-file-transforms.mdc`

- [ ] **Step 1: Create the rule file**

```markdown
---
description: File transformation safety patterns for coherent fix
globs: packages/cli/src/commands/fix.ts
alwaysApply: false
---

# Safe File Transforms

When modifying fix.ts or adding new file transformations:

- Use `safeWrite()` from `./fix-validation.js` instead of `writeFileSync` for all TSX/TS file writes
- `safeWrite` validates TSX syntax after writing and rolls back on failure
- Track modified files in `modifiedFiles` array for post-transform verification
- Never add empty `catch {}` blocks — always log with `chalk.yellow`
- Prefer full component regeneration over regex-based patching
```

- [ ] **Step 2: Commit**

```bash
git add .cursor/rules/safe-file-transforms.mdc
git commit -m "chore: add Cursor rule for safe file transforms in fix.ts"
```

---

### Task 5: Final verification + version bump + publish

- [ ] **Step 1: Run complete verification**

```bash
pnpm build && pnpm typecheck && pnpm test
```

Expected: All pass (build, typecheck, all tests)

- [ ] **Step 2: Version bump**

Bump both `packages/core/package.json` and `packages/cli/package.json` to `0.6.39`.

- [ ] **Step 3: Commit + push + publish**

```bash
git add -A
git commit -m "fix: coherent fix self-validation — backup, parse check, rollback

- safeWrite: in-memory backup + TSX parse validation + auto-rollback
- isValidTsx: TypeScript compiler API parse check (~1ms/file)
- isUsedInLayout: scans route group layouts, returns paths
- Silent catch blocks now log warnings
- verifyIncrementalEdit runs after transforms
- Sidebar regeneration triggers on config mismatch, not just SidebarTrigger"
git push
cd packages/core && pnpm publish --access public --no-git-checks
cd ../cli && pnpm publish --access public --no-git-checks
```

- [ ] **Step 4: Verify published version**

```bash
npm info @getcoherent/cli version
```

Expected: `0.6.39`
