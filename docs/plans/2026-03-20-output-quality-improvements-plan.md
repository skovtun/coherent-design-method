# Output Quality Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 issues in `coherent chat` output: incorrect version display, missing retry for empty pages, false broken-link warnings, noisy pre-flight output, incomplete color auto-fix, high AI-fix threshold, and missing native select auto-fix.

**Architecture:** All changes are in `packages/cli` and `packages/core`. Each task is independent and testable. Order: trivial fixes first, then progressively more involved changes.

**Tech Stack:** TypeScript, Vitest, Zod, Node.js fs, pnpm

---

### Task 1: Fix CLI_VERSION — single source of truth

**Files:**
- Modify: `packages/core/src/versions.ts:23`
- Modify: `packages/cli/src/utils/update-notifier.ts:5,96`
- Modify: `packages/cli/src/index.ts:12`
- Test: `packages/core/src/versions.test.ts` (create if needed)

**Step 1: Write the failing test**

Create `packages/core/src/versions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { CLI_VERSION } from './versions'

describe('CLI_VERSION', () => {
  it('matches the version in packages/cli/package.json', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'cli', 'package.json'), 'utf-8'))
    expect(CLI_VERSION).toBe(pkg.version)
  })

  it('is a valid semver string', () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/core test -- --run src/versions.test.ts`
Expected: FAIL — `CLI_VERSION` is `'0.1.0'` but `package.json` is `'0.5.3'`

**Step 3: Write minimal implementation**

In `packages/core/src/versions.ts`, replace line 23:

```typescript
// Before:
export const CLI_VERSION = '0.1.0' // Sync with packages/cli/package.json

// After:
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readCliVersion(): string {
  try {
    const pkgPath = resolve(__dirname, '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const CLI_VERSION = readCliVersion()
```

**Important:** After build, `__dirname` resolves to `packages/core/dist/`. So `../package.json` points to `packages/core/package.json`. Both `core` and `cli` share the same version (bumped together), so reading `core`'s `package.json` is correct. Verify this during implementation — if `core/package.json` and `cli/package.json` versions diverge, the approach must change to have `cli` pass its own version.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @getcoherent/core test -- --run src/versions.test.ts`
Expected: PASS

**Step 5: Run full build + typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: exit 0

**Step 6: Commit**

```bash
git add packages/core/src/versions.ts packages/core/src/versions.test.ts
git commit -m "fix: read CLI_VERSION from package.json instead of hardcoding"
```

---

### Task 2: Consolidate pre-flight component install

**Files:**
- Modify: `packages/cli/src/commands/chat.ts:354-480`

**Step 1: Write the failing test**

This is a refactor of existing behavior — no new tests needed. The change is: collect all needed component IDs across ALL page requests in a single pass, then install once and print once (instead of per-page).

**Step 2: Refactor the pre-flight loop**

In `packages/cli/src/commands/chat.ts`, replace the per-page loop (lines 354-480) with:

```typescript
    // Pre-flight component check — collect ALL needed components across all pages
    const pageRequests = normalizedRequests.filter(
      (r): r is ModificationRequest & { type: 'add-page' } => r.type === 'add-page',
    )
    const preflightInstalledIds: string[] = []
    const allNpmImportsFromPages = new Set<string>()
    const allNeededComponentIds = new Set<string>()

    for (const pageRequest of pageRequests) {
      const page = pageRequest.changes as PageDefinition & {
        sections?: Array<{ componentId?: string; props?: { fields?: Array<{ component?: string }> } }>
        pageCode?: string
      }

      // Collect from sections
      page.sections?.forEach(
        (section: { componentId?: string; props?: { fields?: Array<{ component?: string }> } }) => {
          if (section.componentId) allNeededComponentIds.add(section.componentId)
          if (section.props?.fields && Array.isArray(section.props.fields)) {
            section.props.fields.forEach((field: { component?: string }) => {
              if (field.component) allNeededComponentIds.add(field.component)
            })
          }
        },
      )

      // Collect from pageCode imports
      if (typeof page.pageCode === 'string' && page.pageCode.trim() !== '') {
        const importMatches = page.pageCode.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
        for (const m of importMatches) {
          if (m[1]) allNeededComponentIds.add(m[1])
        }
        extractNpmPackagesFromCode(page.pageCode).forEach(p => allNpmImportsFromPages.add(p))
      }

      // Collect from template previews
      const pageAny = page as Record<string, unknown>
      if (pageAny.pageType && pageAny.structuredContent) {
        const tmplFn = getTemplateForPageType(pageAny.pageType as string)
        if (tmplFn) {
          try {
            const preview = tmplFn(pageAny.structuredContent as Record<string, unknown>, {
              route: page.route || '/preview',
              pageName: (page.name || 'Page').replace(/\s+/g, ''),
            })
            const tmplImports = preview.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
            for (const m of tmplImports) {
              if (m[1]) allNeededComponentIds.add(m[1])
            }
            extractNpmPackagesFromCode(preview).forEach(p => allNpmImportsFromPages.add(p))
          } catch {
            /* template generation failed */
          }
        }
      }
    }

    // Filter invalid IDs
    const INVALID_COMPONENT_IDS = new Set(['ui', 'shared', 'lib', 'utils', 'hooks', 'app', 'components'])
    for (const id of INVALID_COMPONENT_IDS) allNeededComponentIds.delete(id)

    // Install all missing components in one batch
    const missingComponents = [...allNeededComponentIds].filter(id => !cm.read(id))
    if (missingComponents.length > 0) {
      spinner.stop()
      console.log(chalk.cyan('\n🔍 Pre-flight check: Installing missing components...\n'))

      for (const componentId of missingComponents) {
        if (isShadcnComponent(componentId)) {
          try {
            const shadcnDef = await installShadcnComponent(componentId, projectRoot)
            if (shadcnDef) {
              const result = await cm.register(shadcnDef)
              if (result.success) {
                preflightInstalledIds.push(shadcnDef.id)
                console.log(chalk.green(`   ✨ Auto-installed ${shadcnDef.name} component`))
                dsm.updateConfig(result.config)
                cm.updateConfig(result.config)
                pm.updateConfig(result.config)
              }
            }
          } catch (error) {
            console.log(chalk.red(`   ❌ Failed to install ${componentId}:`))
            console.log(chalk.red(`      ${error instanceof Error ? error.message : error}`))
          }
        } else {
          console.log(chalk.yellow(`   ⚠️  Component ${componentId} not available`))
        }
      }
      spinner.start('Applying modifications...')
    }
```

Keep the npm package install section below (it's already separate).

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: 128/128 pass (no behavioral change, just output consolidation)

**Step 4: Build verification**

Run: `pnpm build && pnpm typecheck`
Expected: exit 0

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat.ts
git commit -m "refactor: consolidate pre-flight component install into single batch"
```

---

### Task 3: Lower AI auto-fix threshold from 5 to 2

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:624`

**Step 1: Write the failing test**

No new test — this is a one-line threshold change. The existing quality tests verify autofix behavior.

**Step 2: Change the threshold**

In `packages/cli/src/commands/chat/modification-handler.ts`, find both `errors.length >= 5` occurrences (one in `add-page` around line 624, potentially one in `update-page`). Replace with `errors.length >= 2`:

```typescript
// Before:
if (errors.length >= 5 && aiProvider) {

// After:
if (errors.length >= 2 && aiProvider) {
```

**Step 3: Run tests + build**

Run: `pnpm test && pnpm build && pnpm typecheck`
Expected: all pass

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "fix: lower AI auto-fix threshold from 5 to 2 errors"
```

---

### Task 4: Expand RAW_COLOR auto-fix coverage

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts:666-735`
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('autoFixCode — extended color coverage', () => {
  it('replaces red colors with destructive tokens', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-red-500 text-red-100 border-red-600">Error</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-red-500')
    expect(fixed).not.toContain('text-red-100')
    expect(fixed).not.toContain('border-red-600')
  })

  it('replaces green colors with success tokens', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-green-500 text-green-600">Success</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-green-500')
    expect(fixed).not.toContain('text-green-600')
  })

  it('replaces yellow/orange colors', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-yellow-500 text-orange-600">Warning</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-yellow-500')
    expect(fixed).not.toContain('text-orange-600')
  })

  it('replaces pink/fuchsia/lime colors', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-pink-500 text-fuchsia-400 border-lime-600">Colorful</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-pink-500')
    expect(fixed).not.toContain('text-fuchsia-400')
    expect(fixed).not.toContain('border-lime-600')
  })

  it('handles shade 300 and 400 for bg', async () => {
    const code = `'use client'\nexport default function Page() {\n  return <div className="bg-blue-300 bg-emerald-400">Shades</div>\n}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('bg-blue-300')
    expect(fixed).not.toContain('bg-emerald-400')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run src/utils/quality-validator.test.ts`
Expected: FAIL — red, green, yellow, orange, pink, fuchsia, lime, and shades 300/400 not handled

**Step 3: Write minimal implementation**

In `packages/cli/src/utils/quality-validator.ts`, expand the `accentColorRe` regex (line 666) to include ALL accent colors:

```typescript
// Before:
const accentColorRe = /\b(bg|text|border)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber)-(\d+)\b/g

// After:
const accentColorRe = /\b(bg|text|border)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber|red|green|yellow|pink|orange|fuchsia|lime)-(\d+)\b/g
```

Also expand the shade mappings to cover 300-400:

```typescript
result = result.replace(accentColorRe, (m, prefix: string, color: string, shade: string) => {
  if (colorMap[m]) {
    hadColorFix = true
    return colorMap[m]
  }
  const n = parseInt(shade)
  const isDestructive = color === 'red'
  if (prefix === 'bg') {
    if (n >= 500 && n <= 700) {
      hadColorFix = true
      return isDestructive ? 'bg-destructive' : 'bg-primary'
    }
    if (n >= 100 && n <= 200) {
      hadColorFix = true
      return isDestructive ? 'bg-destructive/10' : 'bg-primary/10'
    }
    if (n >= 300 && n <= 400) {
      hadColorFix = true
      return isDestructive ? 'bg-destructive/20' : 'bg-primary/20'
    }
    if (n >= 800) {
      hadColorFix = true
      return 'bg-muted'
    }
  }
  if (prefix === 'text') {
    if (n >= 400 && n <= 600) {
      hadColorFix = true
      return isDestructive ? 'text-destructive' : 'text-primary'
    }
    if (n >= 100 && n <= 300) {
      hadColorFix = true
      return 'text-foreground'
    }
    if (n >= 700) {
      hadColorFix = true
      return 'text-foreground'
    }
  }
  if (prefix === 'border') {
    hadColorFix = true
    return isDestructive ? 'border-destructive' : 'border-primary'
  }
  return m
})
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @getcoherent/cli test -- --run src/utils/quality-validator.test.ts`
Expected: PASS

**Step 5: Run full CI**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all pass

**Step 6: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "fix: expand RAW_COLOR auto-fix to cover all Tailwind color names and shade ranges"
```

---

### Task 5: Add NATIVE_SELECT prompt prevention + auto-fix

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts:324-341` (prompt rules)
- Modify: `packages/cli/src/utils/quality-validator.ts` (autoFixCode)
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('autoFixCode — native select replacement', () => {
  it('replaces simple native <select> with shadcn Select', async () => {
    const code = `'use client'
import { Button } from '@/components/ui/button'
export default function Page() {
  return (
    <div>
      <select className="border rounded p-2">
        <option value="a">Alpha</option>
        <option value="b">Beta</option>
      </select>
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('<select')
    expect(fixed).not.toContain('<option')
    expect(fixed).toContain('Select')
    expect(fixed).toContain('SelectTrigger')
    expect(fixed).toContain('SelectContent')
    expect(fixed).toContain('SelectItem')
    expect(fixes.some(f => f.includes('select'))).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run src/utils/quality-validator.test.ts`
Expected: FAIL

**Step 3: Implement**

**3a. Prompt prevention** — Add to `packages/cli/src/agents/modifier.ts`, inside the surgical rules section (after line 341):

```
- NEVER use native HTML <select> or <option>. Always use Select, SelectTrigger, SelectValue, SelectContent, SelectItem from @/components/ui/select.
```

**3b. Auto-fix** — Add to `autoFixCode` in `packages/cli/src/utils/quality-validator.ts`, after the color fix section (around line 740):

```typescript
  // Replace native <select> with shadcn Select
  const selectRe = /<select\b[^>]*>([\s\S]*?)<\/select>/g
  let hadSelectFix = false
  fixed = fixed.replace(selectRe, (_match, inner: string) => {
    const options: Array<{ value: string; label: string }> = []
    const optionRe = /<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/g
    let optMatch
    while ((optMatch = optionRe.exec(inner)) !== null) {
      options.push({ value: optMatch[1], label: optMatch[2] })
    }
    if (options.length === 0) return _match
    hadSelectFix = true
    const items = options.map(o => `            <SelectItem value="${o.value}">${o.label}</SelectItem>`).join('\n')
    return `<Select>\n          <SelectTrigger>\n            <SelectValue placeholder="Select..." />\n          </SelectTrigger>\n          <SelectContent>\n${items}\n          </SelectContent>\n        </Select>`
  })
  if (hadSelectFix) {
    fixes.push('<select> → shadcn Select')
    if (!/from\s+['"]@\/components\/ui\/select['"]/.test(fixed)) {
      fixed = fixed.replace(
        /(import\s+\{[^}]*\}\s+from\s+['"]@\/components\/ui\/[^'"]+['"])/,
        `$1\nimport { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'`,
      )
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @getcoherent/cli test -- --run src/utils/quality-validator.test.ts`
Expected: PASS

**Step 5: Full CI**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all pass

**Step 6: Commit**

```bash
git add packages/cli/src/agents/modifier.ts packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "fix: replace native <select> with shadcn Select in auto-fix and AI prompts"
```

---

### Task 6: Defer BROKEN_INTERNAL_LINK validation

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:619-621` (add-page)
- Modify: `packages/cli/src/commands/chat/modification-handler.ts` (update-page, same pattern)
- Modify: `packages/cli/src/commands/chat.ts` (add deferred link validation after auto-scaffold)
- Test: `packages/cli/src/commands/chat.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/commands/chat.test.ts` (or create if logic is testable in isolation):

```typescript
describe('validatePageQuality link deferral', () => {
  it('does not produce BROKEN_INTERNAL_LINK during per-page validation', () => {
    const code = `'use client'\nexport default function Page() {\n  return <a href="/settings">Settings</a>\n}`
    const issues = validatePageQuality(code) // no validRoutes passed
    expect(issues.filter(i => i.type === 'BROKEN_INTERNAL_LINK')).toHaveLength(0)
  })
})
```

This test verifies that when `validRoutes` is not passed, BROKEN_INTERNAL_LINK is not checked. This should already pass (existing behavior). The real change is to stop passing `validRoutes` during per-page creation.

**Step 2: Remove `validRoutes` from per-page validation**

In `packages/cli/src/commands/chat/modification-handler.ts`, find lines where `validatePageQuality(codeToWrite, validRoutes)` is called inside `add-page` and `update-page` cases. Change to `validatePageQuality(codeToWrite)` (no second argument).

```typescript
// In add-page case (~line 619-621):
// Before:
const validRoutes = dsm.getConfig().pages.map((p: any) => p.route)
const issues = validatePageQuality(codeToWrite, validRoutes)

// After:
const issues = validatePageQuality(codeToWrite)
```

Remove the `validRoutes` variable if no longer used.

**Step 3: Add deferred link validation in chat.ts**

After the auto-scaffold section (around line 464), add a single-pass link validation:

```typescript
    // Deferred BROKEN_INTERNAL_LINK validation — run after ALL pages (including auto-scaffold) exist
    const finalConfig = dsm.getConfig()
    const allRoutes = finalConfig.pages.map((p: any) => p.route).filter(Boolean)
    const createdPageFiles: Array<{ name: string; filePath: string }> = []

    for (const result of results) {
      if (!result.success) continue
      for (const mod of result.modified) {
        if (mod.startsWith('app/') && mod.endsWith('/page.tsx')) {
          createdPageFiles.push({
            name: mod,
            filePath: resolve(projectRoot, mod),
          })
        }
      }
    }

    if (createdPageFiles.length > 0 && allRoutes.length > 0) {
      const linkIssues: Array<{ page: string; issues: any[] }> = []
      for (const { name, filePath } of createdPageFiles) {
        try {
          const code = readFileSync(filePath, 'utf-8')
          const issues = validatePageQuality(code, allRoutes).filter(i => i.type === 'BROKEN_INTERNAL_LINK')
          if (issues.length > 0) {
            linkIssues.push({ page: name, issues })
          }
        } catch {
          // file might not exist
        }
      }
      if (linkIssues.length > 0) {
        console.log(chalk.yellow('\n🔗 Broken internal links:'))
        for (const { page, issues } of linkIssues) {
          for (const issue of issues) {
            console.log(chalk.dim(`   ${page}: ${issue.message}`))
          }
        }
      }
    }
```

**Step 4: Run full CI**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all pass

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/commands/chat/modification-handler.ts
git commit -m "fix: defer BROKEN_INTERNAL_LINK validation until all pages exist"
```

---

### Task 7: Add retry for empty pages in split-generator

**Files:**
- Modify: `packages/cli/src/commands/chat/split-generator.ts:236-239`
- Test: manual verification via `coherent chat` (integration-level)

**Step 1: Write the failing test**

This is an integration-level change (involves AI calls). No unit test is practical. Test by verifying the retry logic structure.

Add to a new or existing test file `packages/cli/src/commands/chat/split-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('split-generator retry logic', () => {
  it('retry section exists in source code', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const source = readFileSync(resolve(__dirname, 'split-generator.ts'), 'utf-8')
    expect(source).toContain('Retrying')
    expect(source).toContain('pageCode')
  })
})
```

**Step 2: Implement retry**

In `packages/cli/src/commands/chat/split-generator.ts`, after line 236 (`const allRequests = [homeRequest, ...remainingRequests]`), add:

```typescript
  // Retry pages that came back without pageCode
  const emptyPages = allRequests.filter(
    r => r.type === 'add-page' && !(r.changes as Record<string, unknown>)?.pageCode,
  )
  if (emptyPages.length > 0 && emptyPages.length <= 5) {
    spinner.text = `Retrying ${emptyPages.length} page(s) without code...`
    for (const req of emptyPages) {
      const page = req.changes as Record<string, unknown>
      const pageName = (page.name as string) || (page.id as string) || 'page'
      const pageRoute = (page.route as string) || `/${pageName.toLowerCase()}`
      try {
        const retryResult = await parseModification(
          `Create ONE page called "${pageName}" at route "${pageRoute}". Context: ${message}. Generate complete pageCode for this single page only.`,
          modCtx,
          provider,
          parseOpts,
        )
        const codePage = retryResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
        if (codePage && (codePage.changes as Record<string, unknown>)?.pageCode) {
          const idx = allRequests.indexOf(req)
          if (idx !== -1) allRequests[idx] = codePage
        }
      } catch {
        // keep the empty version — user will see the warning
      }
    }
  }

  const withCode = allRequests.filter(r => (r.changes as Record<string, unknown>)?.pageCode).length
```

**Step 3: Run full CI**

Run: `pnpm build && pnpm typecheck && pnpm test`
Expected: all pass

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/split-generator.ts
git commit -m "fix: retry pages with empty pageCode in split-generator before giving up"
```

If a test file was created:
```bash
git add packages/cli/src/commands/chat/split-generator.test.ts
```

---

### Final: Full CI verification

After all 7 tasks:

```bash
pnpm build && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, 0 errors, all tests green.
