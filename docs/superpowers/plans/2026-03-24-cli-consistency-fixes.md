# CLI Consistency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 CLI issues: app name placeholder, CSS variable sync, no-op token skip, shadow color detection, and broken layout repair.

**Architecture:** All changes are isolated to existing files. `toTitleCase` added to `strings.ts`. `fixGlobalsCss` updated for v3/v4 inline style handling. `fix.ts` gets unconditional DSM loading, placeholder detection, CSS sync, and layout repair. `updateToken` gets no-op check. `quality-validator.ts` gets `shadow-*` support.

**Tech Stack:** TypeScript, vitest, ESM modules

**Spec:** `docs/superpowers/specs/2026-03-24-app-name-placeholder-fix-design.md`

---

### Task 1: `toTitleCase` utility + tests

**Files:**
- Modify: `packages/cli/src/utils/strings.ts`
- Create: `packages/cli/src/utils/strings.test.ts` (if not exists, else Modify)

- [ ] **Step 1: Write failing tests**

Create or update `packages/cli/src/utils/strings.test.ts`:

```ts
import { toTitleCase } from './strings.js'

describe('toTitleCase', () => {
  it('converts kebab-case', () => {
    expect(toTitleCase('my-cool-app')).toBe('My Cool App')
  })
  it('converts snake_case', () => {
    expect(toTitleCase('test_projector')).toBe('Test Projector')
  })
  it('converts single word', () => {
    expect(toTitleCase('taskflow')).toBe('Taskflow')
  })
  it('converts camelCase', () => {
    expect(toTitleCase('myCoolApp')).toBe('My Cool App')
  })
  it('normalizes ALL_CAPS', () => {
    expect(toTitleCase('MY-APP')).toBe('My App')
  })
  it('strips @scope prefix', () => {
    expect(toTitleCase('@org/my-app')).toBe('My App')
  })
  it('returns fallback for empty string', () => {
    expect(toTitleCase('')).toBe('My App')
  })
  it('returns fallback for whitespace', () => {
    expect(toTitleCase('   ')).toBe('My App')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/strings.test.ts`
Expected: FAIL — `toTitleCase` is not exported

- [ ] **Step 3: Implement `toTitleCase`**

In `packages/cli/src/utils/strings.ts`, add:

```ts
export function toTitleCase(slug: string): string {
  let s = slug.trim()
  if (!s) return 'My App'
  s = s.replace(/^@[^/]+\//, '')
  if (!s) return 'My App'
  const words = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean)
  if (words.length === 0) return 'My App'
  return words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/strings.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/strings.ts packages/cli/src/utils/strings.test.ts
git commit -m "feat: add toTitleCase utility for app name derivation"
```

---

### Task 2: `createMinimalConfig` accepts `appName` + init derives name

**Files:**
- Modify: `packages/cli/src/utils/minimal-config.ts`
- Modify: `packages/cli/src/commands/init.ts`

- [ ] **Step 1: Write failing test for `createMinimalConfig`**

Find existing tests or create inline verification. Check current `createMinimalConfig` signature:

Run: `grep -n 'export function createMinimalConfig' packages/cli/src/utils/minimal-config.ts`

Then in a new test or inline check, verify:

```ts
// In minimal-config.test.ts or add to existing test
import { createMinimalConfig } from './minimal-config.js'

describe('createMinimalConfig', () => {
  it('uses provided appName', () => {
    const config = createMinimalConfig('Test Projector')
    expect(config.name).toBe('Test Projector')
  })
  it('uses appName in page description', () => {
    const config = createMinimalConfig('TaskFlow')
    expect(config.pages[0].description).toBe('Welcome to TaskFlow')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/utils/minimal-config.test.ts`
Expected: FAIL — `createMinimalConfig` doesn't accept argument

- [ ] **Step 3: Update `createMinimalConfig` to accept `appName`**

In `packages/cli/src/utils/minimal-config.ts`:
- Change function signature: `export function createMinimalConfig(appName: string = 'My App')`
- Replace `name: 'My App'` with `name: appName`
- Replace `description: 'Welcome to My App'` with `` description: `Welcome to ${appName}` ``

- [ ] **Step 4: Update `init.ts` to derive and pass name**

In `packages/cli/src/commands/init.ts`:
- Add import: `import { toTitleCase } from '../utils/strings.js'`
- Add import: `import { basename } from 'path'`
- Before calling `createMinimalConfig`, derive name:

```ts
let appName: string | undefined
if (name) {
  appName = toTitleCase(name)
} else {
  try {
    const pkgPath = join(projectPath, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (typeof pkg.name === 'string' && pkg.name) {
        appName = toTitleCase(pkg.name)
      }
    }
  } catch { /* ignore */ }
  if (!appName) appName = toTitleCase(basename(projectPath))
}
```

Note: verify the actual variable name for project directory in `init.ts` — it may be `projectPath`, `targetDir`, or similar. Use whichever is correct.

- Pass `appName` to `createMinimalConfig(appName)`

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run packages/cli/src/utils/minimal-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/minimal-config.ts packages/cli/src/commands/init.ts
git commit -m "feat: derive app name from directory in init, remove My App default"
```

---

### Task 3: No-op token skip in `updateToken`

**Files:**
- Modify: `packages/core/src/managers/DesignSystemManager.ts`
- Modify: `packages/core/src/managers/DesignSystemManager.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/core/src/managers/DesignSystemManager.test.ts`, add to the `updateToken` describe block:

```ts
it('skips no-op when value unchanged', async () => {
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  const result = await dsm.updateToken('colors.light.primary', dsm.getConfig().tokens.colors.light.primary)
  expect(result.success).toBe(true)
  expect(result.modified).toEqual([])
  expect(result.message).toContain('already set')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/managers/DesignSystemManager.test.ts -t "skips no-op"`
Expected: FAIL — `modified` is not empty

- [ ] **Step 3: Add no-op check**

In `packages/core/src/managers/DesignSystemManager.ts`, after line 149 (`const oldValue = current[lastPart]`), add:

```ts
if (String(oldValue) === String(value)) {
  return {
    success: true,
    modified: [],
    config: this.config,
    message: `Token ${path} is already set to ${value}, skipped`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/managers/DesignSystemManager.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/managers/DesignSystemManager.ts packages/core/src/managers/DesignSystemManager.test.ts
git commit -m "fix: skip no-op token updates when value unchanged"
```

---

### Task 4: `shadow-*` in quality validator

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/cli/src/utils/quality-validator.test.ts`, add:

```ts
// Note: use the correct API — validatePageQuality (sync, returns QualityIssue[])
// Issues use `.type` not `.rule`
import { validatePageQuality, autoFixCode } from './quality-validator.js'

describe('RAW_COLOR_RE shadow detection', () => {
  it('detects shadow-indigo-500', () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500">x</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })
  it('detects shadow-blue-600/25', () => {
    const code = `export default function Page() { return <div className="shadow-blue-600/25">x</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })
})

describe('autoFixCode shadow replacement', () => {
  it('replaces shadow-indigo-500 with shadow-primary', async () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500">x</div> }`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('shadow-primary')
    expect(fixed).not.toContain('shadow-indigo')
  })
  it('preserves shadow opacity suffix', async () => {
    const code = `export default function Page() { return <div className="shadow-indigo-500/25">x</div> }`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('shadow-primary/25')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "shadow"`
Expected: FAIL

- [ ] **Step 3: Add `shadow` to regexes**

In `packages/cli/src/utils/quality-validator.ts`:

1. Line 6 — `RAW_COLOR_RE`: add `shadow` to prefix group:
```
(?:bg|text|border|ring|outline|from|to|via|shadow)-
```

2. Line ~551 — `accentColorRe`: add `shadow` to prefix group:
```
(bg|text|border|ring|outline|from|to|via|shadow)-
```

3. In the `replace` callback (~line 552-584), add handling for `shadow`:
The existing logic maps `bg-indigo-500` → `bg-primary` etc. Add `shadow` to behave like `bg` (same mapping). The callback already has fallthrough for unknown prefixes, so adding `shadow` to the group captures regex is sufficient if there's a `colorMap` entry. Check the `colorMap` object and ensure `shadow-*` entries map correctly, or add a branch:

```ts
if (prefix === 'shadow') {
  const mapped = colorMap[`bg-${color}-${shade}`]
  if (mapped) {
    const semanticColor = mapped.replace('bg-', '')
    const opacity = m.match(/\/\d+/)?.[0] || ''
    changed = true
    return `${statePrefix}shadow-${semanticColor}${opacity}`
  }
}
```

Also check `neutralColorRe` (~line after `accentColorRe`) and add `shadow` there too if it has a similar prefix list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/quality-validator.test.ts -t "shadow"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "fix: detect and auto-fix shadow-* raw colors in quality validator"
```

---

### Task 5: `fixGlobalsCss` — v4 inline removal + v3 inline update

**Files:**
- Modify: `packages/cli/src/utils/fix-globals-css.ts`
- Create: `packages/cli/src/utils/fix-globals-css.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/utils/fix-globals-css.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fixGlobalsCss } from './fix-globals-css.js'

function makeProject(tmpDir: string, opts: { v4?: boolean; withInlineStyle?: boolean }) {
  mkdirSync(join(tmpDir, 'app'), { recursive: true })
  
  if (opts.v4) {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { '@tailwindcss/postcss': '^4.0.0' }
    }))
    writeFileSync(join(tmpDir, 'app', 'globals.css'), '@import "tailwindcss";\n')
  } else {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      devDependencies: { tailwindcss: '^3.4.0' }
    }))
    writeFileSync(join(tmpDir, 'app', 'globals.css'), ':root { --primary: blue; }\n')
  }

  let layoutCode = `import './globals.css'\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>\n}`
  if (opts.withInlineStyle) {
    layoutCode = `import './globals.css'\nexport default function RootLayout({ children }) {\n  return <html lang="en">\n      <head>\n        <style dangerouslySetInnerHTML={{ __html: ":root { --primary: #3B82F6; }" }} />\n      </head>\n      <body>{children}</body></html>\n}`
  }
  writeFileSync(join(tmpDir, 'app', 'layout.tsx'), layoutCode)
}

const minConfig = {
  tokens: {
    colors: {
      light: { primary: '#10B981', secondary: '#8B5CF6', accent: '#10B981', success: '#10B981', warning: '#F59E0B', error: '#EF4444', info: '#3B82F6', background: '#FFFFFF', foreground: '#111827', muted: '#F3F4F6', border: '#E5E7EB' },
      dark: { primary: '#34D399', secondary: '#A78BFA', accent: '#34D399', success: '#34D399', warning: '#FBBF24', error: '#F87171', info: '#60A5FA', background: '#111827', foreground: '#F9FAFB', muted: '#1F2937', border: '#374151' },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
    radius: { none: '0', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
  },
} as any

describe('fixGlobalsCss', () => {
  let tmpDir: string
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'fix-css-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('v4: removes stale inline style from layout.tsx', () => {
    makeProject(tmpDir, { v4: true, withInlineStyle: true })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).not.toContain('dangerouslySetInnerHTML')
    expect(layout).not.toContain('#3B82F6')
  })

  it('v3: updates existing inline style with new colors', () => {
    makeProject(tmpDir, { v4: false, withInlineStyle: true })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).toContain('dangerouslySetInnerHTML')
    expect(layout).toContain('#10B981')
    expect(layout).not.toContain('#3B82F6')
  })

  it('v4: no-op when no inline style exists', () => {
    makeProject(tmpDir, { v4: true, withInlineStyle: false })
    fixGlobalsCss(tmpDir, minConfig)
    const layout = readFileSync(join(tmpDir, 'app', 'layout.tsx'), 'utf-8')
    expect(layout).not.toContain('dangerouslySetInnerHTML')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/cli/src/utils/fix-globals-css.test.ts`
Expected: FAIL — v4 test still has inline style, v3 test still has old color

- [ ] **Step 3: Implement fixes**

In `packages/cli/src/utils/fix-globals-css.ts`:

**v4 path** (after line 62, `writeFileSync(globalsPath, v4Css, 'utf-8')`):

The `__html` value contains `{` and `}` characters (CSS rules), so simple `[^}]*` won't work. Use a strategy that finds the `<style` tag and removes everything up to its closing `/>`:

```ts
if (existsSync(layoutPath)) {
  let layoutContent = readFileSync(layoutPath, 'utf-8')
  if (layoutContent.includes('dangerouslySetInnerHTML')) {
    // Find <style dangerouslySetInnerHTML={{ __html: "..." }} /> and remove it
    // The __html value is JSON.stringify'd so it's a double-quoted string
    const styleStart = layoutContent.indexOf('<style dangerouslySetInnerHTML')
    if (styleStart !== -1) {
      const styleEnd = layoutContent.indexOf('/>', styleStart)
      if (styleEnd !== -1) {
        // Remove the <style .../> element plus surrounding whitespace
        const before = layoutContent.slice(0, styleStart).replace(/\s+$/, '')
        const after = layoutContent.slice(styleEnd + 2).replace(/^\s*\n/, '\n')
        layoutContent = before + after
      }
    }
    // Remove empty <head></head> if left behind
    layoutContent = layoutContent.replace(/\s*<head>\s*<\/head>\s*/g, '\n')
    writeFileSync(layoutPath, layoutContent, 'utf-8')
  }
}
return
```

**v3 path** — replace lines 87-88:

```ts
if (layoutContent.includes('dangerouslySetInnerHTML')) {
  // Update existing inline style with fresh CSS variables
  const cssVars = buildCssVariables(config)
  // Find the __html: "..." part — value is always JSON.stringify'd (double-quoted)
  const marker = '__html: '
  const markerIdx = layoutContent.indexOf(marker)
  if (markerIdx !== -1) {
    const valueStart = markerIdx + marker.length
    // The value is a JSON string — find its extent
    const jsonStr = JSON.stringify(cssVars)
    // Find end of current JSON string value (starts with " ends with matching ")
    const oldQuoteStart = layoutContent.indexOf('"', valueStart)
    if (oldQuoteStart !== -1) {
      // Walk to find the closing quote (handle escaped quotes)
      let i = oldQuoteStart + 1
      while (i < layoutContent.length) {
        if (layoutContent[i] === '\\') { i += 2; continue }
        if (layoutContent[i] === '"') break
        i++
      }
      layoutContent = layoutContent.slice(0, oldQuoteStart) + jsonStr + layoutContent.slice(i + 1)
    }
  }
  writeFileSync(layoutPath, layoutContent, 'utf-8')
  return
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/cli/src/utils/fix-globals-css.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/fix-globals-css.ts packages/cli/src/utils/fix-globals-css.test.ts
git commit -m "fix: v4 removes stale inline style, v3 updates inline style on color change"
```

---

### Task 6: `fix.ts` — placeholder detection, CSS sync, layout repair

**Files:**
- Modify: `packages/cli/src/commands/fix.ts`

- [ ] **Step 1: Add unconditional DSM loading + app name placeholder detection**

After Step 3 (component registry) and before Step 4b, add:

```ts
// ─── Step 3b: Ensure DSM loaded unconditionally ──────────────────
if (!dsm && existsSync(project.configPath)) {
  dsm = new DesignSystemManager(project.configPath)
  await dsm.load()
}

// ─── Step 3c: Replace "My App" placeholder ──────────────────
if (dsm && dsm.getConfig().name === 'My App') {
  const { toTitleCase } = await import('../utils/strings.js')
  let derivedName: string | null = null
  try {
    const pkgPath = resolve(projectRoot, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (typeof pkg.name === 'string' && pkg.name) {
        derivedName = toTitleCase(pkg.name)
      }
    }
  } catch { /* ignore */ }
  if (!derivedName) derivedName = toTitleCase(basename(projectRoot))
  
  if (derivedName !== 'My App') {
    if (dryRun) {
      fixes.push(`Would replace placeholder "My App" with "${derivedName}" in config`)
      console.log(chalk.green(`  ✔ Would replace "My App" with "${derivedName}" in config`))
    } else {
      const cfg = dsm.getConfig()
      dsm.updateConfig({ ...cfg, name: derivedName })
      await dsm.save()
      fixes.push(`Replaced placeholder "My App" with "${derivedName}" in config`)
      console.log(chalk.green(`  ✔ Replaced "My App" with "${derivedName}" in config`))
    }
  }
}
```

Add import at top: `import { basename } from 'path'`

- [ ] **Step 2: Add `fixGlobalsCss` call**

After the placeholder step, add:

```ts
// ─── Step 3d: Sync CSS variables ──────────────────
if (dsm && !dryRun) {
  try {
    const { fixGlobalsCss } = await import('../utils/fix-globals-css.js')
    fixGlobalsCss(projectRoot, dsm.getConfig())
    fixes.push('Synced CSS variables')
    console.log(chalk.green('  ✔ Synced CSS variables'))
  } catch (e) {
    console.log(chalk.yellow(`  ⚠ CSS sync: ${e instanceof Error ? e.message : 'unknown error'}`))
  }
} else if (dryRun && dsm) {
  fixes.push('Would sync CSS variables')
}
```

- [ ] **Step 3: Move shared-component "My App" scan to be unconditional**

Find the existing `components/shared/*.tsx` "My App" scan block. Move it out of any `if (plan) { ... if (hasSidebar) { ... } }` gate. Ensure it runs unconditionally after DSM is loaded, and honors `dryRun`.

- [ ] **Step 4: Add broken layout repair**

After `ensurePlanGroupLayouts` (or at the same level when no plan exists), add:

```ts
// ─── Step 4c: Repair minimal/broken (app) layout ──────────────────
const appLayoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
if (existsSync(appLayoutPath) && dsm) {
  const appLayoutCode = readFileSync(appLayoutPath, 'utf-8')
  const isMinimal = appLayoutCode.length < 500 &&
    !appLayoutCode.includes('Header') &&
    !appLayoutCode.includes('Footer') &&
    !appLayoutCode.includes('Sidebar') &&
    !appLayoutCode.includes('SidebarProvider') &&
    !appLayoutCode.includes('SidebarTrigger') &&
    !appLayoutCode.includes('Sheet')
  
  const navType = dsm.getConfig().navigation?.type || 'header'
  const isSidebar = navType === 'sidebar' || navType === 'both'
  if (isMinimal && navType !== 'none') {
    const { buildAppLayoutCode, buildGroupLayoutCode } = await import('./chat/code-generator.js')
    // sidebar/both → buildAppLayoutCode (includes SidebarProvider etc.)
    // header → buildGroupLayoutCode (includes Header/Footer)
    const newLayout = isSidebar
      ? buildAppLayoutCode(navType, dsm.getConfig().name)
      : buildGroupLayoutCode('header', dsm.getConfig().pages?.map((p: any) => p.name) || [], dsm.getConfig().name)
    if (!dryRun) {
      const layoutResult = safeWrite(appLayoutPath, newLayout, projectRoot, backups)
      if (layoutResult.ok) {
        modifiedFiles.push(appLayoutPath)
        fixes.push(`Regenerated minimal (app) layout with ${navType} navigation`)
        console.log(chalk.green(`  ✔ Regenerated (app) layout with ${navType} navigation`))
      }
    } else {
      fixes.push(`Would regenerate minimal (app) layout with ${navType} navigation`)
    }
  }
}
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Run build + typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "feat: fix.ts — placeholder detection, CSS sync, layout repair, unconditional shared scan"
```

---

### Task 7: Final verification + version bump + publish

**Files:**
- Modify: `packages/core/package.json` (version bump)
- Modify: `packages/cli/package.json` (version bump)

- [ ] **Step 1: Run full CI checks**

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```
Expected: ALL PASS

- [ ] **Step 2: Run format check**

```bash
pnpm format:check
```
If formatting issues: `npx prettier --write <files>`

- [ ] **Step 3: Version bump**

Bump both packages to `0.6.43`:
```bash
cd packages/core && npm version 0.6.43 --no-git-tag-version
cd ../cli && npm version 0.6.43 --no-git-tag-version
```

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "v0.6.43: CLI consistency fixes — app name, CSS sync, no-op skip, shadow colors, layout repair"
git push
```

- [ ] **Step 5: Publish**

```bash
cd packages/core && pnpm publish --no-git-checks --access public
cd ../cli && pnpm publish --no-git-checks --access public
```

- [ ] **Step 6: User verification**

Instruct user:
```bash
npm install -g @getcoherent/cli@0.6.43
coherent fix
coherent preview
```

Verify:
- Footer shows real app name (not "My App")
- Buttons use primary color from config (not blue)
- Sidebar/header/footer present on dashboard pages
