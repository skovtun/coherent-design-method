# Fix Self-Validation Design

> `coherent fix` should never break files it touches, and should detect when files are already broken.

## Problem

`coherent fix` performs regex-based transformations on TSX files (syntax fixes, layout surgery, sidebar regeneration, quality auto-fixes) without verifying the output is valid. When a regex goes wrong, the file becomes unparseable, causing 500 errors on `coherent preview`. The user has no way to recover except manual intervention.

Additionally, shared components used in route group layouts (`(app)`, `(public)`) are falsely reported as "unused" because `isUsedInLayout` only checks `app/layout.tsx`.

## Chosen Approach: Hybrid (backup + parse check + incremental verify)

Three layers of protection, each progressively deeper:

1. **Backup & rollback** — in-memory backup before every file write; automatic restore if parse check fails.
2. **TSX parse validation** — use TypeScript compiler API from the user's project to verify syntax after each transformation (~1ms per file, no type-checking).
3. **Incremental edit verification** — run `verifyIncrementalEdit` on changed files to catch missing imports, exports, and `use client` directives.

No new npm dependencies. TypeScript is always present in Next.js + TS projects. Graceful degradation if unavailable.

## Design

### 1. `safeWrite` — backup & rollback wrapper

All file writes in `fix.ts` go through `safeWrite` instead of direct `writeFileSync`.

```typescript
// Single module-level import shared by safeWrite + isValidTsx
import { createRequire } from 'module'

const backups = new Map<string, string>()

function safeWrite(
  filePath: string,
  newContent: string,
  projectRoot: string,
): { ok: boolean } {
  if (!backups.has(filePath)) {
    try { backups.set(filePath, readFileSync(filePath, 'utf-8')) } catch { /* new file */ }
  }
  writeFileSync(filePath, newContent, 'utf-8')
  if (!isValidTsx(newContent, projectRoot)) {
    const original = backups.get(filePath)
    if (original) writeFileSync(filePath, original, 'utf-8')
    return { ok: false }
  }
  return { ok: true }
}
```

Properties:
- In-memory only — no disk cleanup needed.
- Backup captured once per file (first write wins).
- On parse failure: restore original, return `{ ok: false }`, caller logs warning.
- New files (no original) skip rollback but still validate.
- Both `safeWrite` and `isValidTsx` are synchronous — `createRequire` is imported at module level.

### 2. `isValidTsx` — lightweight parse check

Uses the module-level `createRequire` import (shared with `safeWrite`) to resolve TypeScript from the user's project. This avoids ESM `require()` issues — the codebase is ESM and bare `require()` is not available.

```typescript
function isValidTsx(code: string, projectRoot: string): boolean {
  try {
    const req = createRequire(join(projectRoot, 'package.json'))
    const ts = req('typescript')
    const sf = ts.createSourceFile(
      'check.tsx', code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX
    )
    const diagnostics = (sf as any).parseDiagnostics
    return !diagnostics || diagnostics.length === 0
  } catch {
    return true // TS unavailable — don't block
  }
}
```

Properties:
- Parse only, no type-check — ~1ms per file.
- Uses `createRequire` for ESM compatibility.
- `parseDiagnostics` is an internal TS API — accessed via `(sf as any)` cast. This is intentional; the public API requires creating a full `Program` which is too heavy.
- Returns `true` if TS is unavailable — graceful degradation, never blocks.
- Catches: broken JSX tags, unbalanced brackets, invalid syntax.

### 3. `isUsedInLayout` — scan all route group layouts, return paths

Current implementation checks only `app/layout.tsx` and returns `boolean`. New implementation scans all `app/(*)/layout.tsx` files dynamically and returns the matched layout path(s):

```typescript
export function isUsedInLayout(projectRoot: string, componentName: string): string[] {
  const appDir = join(projectRoot, 'app')
  const layoutPaths = [join(appDir, 'layout.tsx')]

  if (existsSync(appDir)) {
    for (const entry of readdirSync(appDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('(') && entry.name.endsWith(')')) {
        layoutPaths.push(join(appDir, entry.name, 'layout.tsx'))
      }
    }
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

**Caller updates required:** All callers currently use `isUsedInLayout` as a boolean and hardcode `'app/layout.tsx'` as the usage path. Must update:

- `fix.ts` (~line 446): `const layoutPaths = isUsedInLayout(project.root, entry.name); const fullActual = [...new Set([...actualUsedIn, ...layoutPaths])]`
- `component-integrity.ts` (~line 304): same pattern — use returned paths instead of hardcoded `'app/layout.tsx'`
- `check.ts`: update any similar usage

This eliminates false "unused" warnings for Header, Footer, AppSidebar, ThemeToggle.

### 4. Transparent error handling

Replace silent `catch {}` blocks in `fix.ts` with logged warnings, except where silence is intentional:

```typescript
} catch (err) {
  console.log(chalk.yellow(
    `  ⚠ Layout repair skipped: ${err instanceof Error ? err.message : 'unknown error'}`
  ))
}
```

Applies to:
- Plan loading / layout repair (line 349) — `"Layout repair skipped: ..."`
- File listing helper (line 79) — keep silent (intentional: permission-denied during traversal is expected)
- Manifest parsing (line 494) — `"Component manifest check skipped: ..."`

### 5. `verifyIncrementalEdit` post-transform

`verifyIncrementalEdit` takes two arguments: `(before: string, after: string)`. The `backups` Map provides the `before` content.

Track modified files throughout steps 4 and 5: declare `const modifiedFiles: string[] = []` before step 4, push `filePath` after each successful write (i.e., when `safeWrite` returns `{ ok: true }` or when a direct `writeFileSync` succeeds). Skip `verifyIncrementalEdit` for files where `backups.has(file)` is false (new files have no meaningful "before" to compare).

After steps 4 and 5 (syntax fix + quality auto-fix), run verification on each modified file:

```typescript
// Add to existing import (line 45):
// import { validatePageQuality, formatIssues, autoFixCode, verifyIncrementalEdit } from '../utils/quality-validator.js'

for (const file of modifiedFiles) {
  const before = backups.get(file) ?? ''
  const after = readFileSync(file, 'utf-8')
  const issues = verifyIncrementalEdit(before, after)
  if (issues.length > 0) {
    remaining.push(`${relative(projectRoot, file)}: ${issues.map(i => i.message).join(', ')}`)
  }
}
```

Key corrections from review:
- Passes both `before` and `after` arguments (not single-arg).
- Maps `VerificationIssue[]` to strings via `.map(i => i.message)`.
- Merges import into existing import statement (line 45), not a separate import.

### 6. Sidebar regeneration by config diff

Instead of triggering on `SidebarTrigger` presence only, check for config mismatches:

```typescript
if (existsSync(sidebarPath)) {
  const current = readFileSync(sidebarPath, 'utf-8')
  const hasWrongName = current.includes('My App') && config.name !== 'My App'
  const hasTrigger = current.includes('SidebarTrigger')
  if (hasWrongName || hasTrigger) {
    const result = safeWrite(sidebarPath, gen.generateSharedSidebarCode(), projectRoot)
    if (result.ok) fixes.push('Regenerated sidebar component')
    else console.log(chalk.yellow('  ⚠ Sidebar regeneration failed validation — restored original'))
  }
}
```

Nav item comparison (checking if sidebar links match config pages) is excluded — future work if needed.

### 7. Cursor rule

Create `.cursor/rules/safe-file-transforms.mdc` to enforce backup+validate pattern for all future `fix.ts` work.

## What's excluded (YAGNI)

- `--verify` flag with full `next build` — too heavy, no demand yet.
- Auto-fix after `coherent chat` — separate feature, different scope.
- Nav item comparison in sidebar — future work.
- File hashing for incremental quality checks — premature optimization.
- Machine-readable report output — no consumers.

## Files to modify

| File | Change |
|------|--------|
| `packages/cli/src/commands/fix.ts` | Add `createRequire` import, `safeWrite`, `isValidTsx`, `modifiedFiles` tracking, replace `writeFileSync` calls, fix `catch {}` blocks (lines 349, 494), add `verifyIncrementalEdit` post-check, improve sidebar regen trigger |
| `packages/cli/src/utils/component-integrity.ts` | Update `isUsedInLayout` to return `string[]`, scan route group layouts |
| `packages/cli/src/commands/check.ts` | Update `isUsedInLayout` caller to handle `string[]` return |
| `.cursor/rules/safe-file-transforms.mdc` | New Cursor rule |

## Testing strategy

- Unit test `isValidTsx` with valid TSX, broken JSX (`<\n />`), broken imports — verify returns `true`/`false`.
- Unit test `isValidTsx` when TypeScript cannot be resolved — verify graceful `true` fallback.
- Unit test updated `isUsedInLayout` with route group layouts — verify returns correct paths.
- Unit test `safeWrite` rollback behavior — verify original restored on parse failure.
- Integration: existing `fix.ts` tests continue to pass.
