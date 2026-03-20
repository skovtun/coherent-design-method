# Incremental Modification Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace destructive regeneration with surgical, incremental modifications so the platform only changes what the user explicitly requests.

**Architecture:** Add an `initialized` flag to the design system config that gates full-generation vs. incremental mode. In incremental mode, compare navigation snapshots to decide if shared components need updating, track file hashes to protect manual edits, and extend AI prompts to enforce surgical changes.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js crypto (SHA-256), existing CLI/core packages.

---

### Task 1: Add `initialized` flag to Zod schema

**Files:**
- Modify: `packages/core/src/types/design-system.ts`
- Test: `packages/core/src/types/design-system.test.ts`

**Step 1: Write the failing test**

In `packages/core/src/types/design-system.test.ts`, add:

```typescript
describe('initialized flag', () => {
  it('defaults to true when not provided (backward compat)', () => {
    const config = DesignSystemConfigSchema.parse({
      name: 'Test',
      settings: {},
      tokens: { colors: {} },
      components: [],
      pages: [],
    })
    expect(config.settings.initialized).toBe(true)
  })

  it('preserves false when explicitly set', () => {
    const config = DesignSystemConfigSchema.parse({
      name: 'Test',
      settings: { initialized: false },
      tokens: { colors: {} },
      components: [],
      pages: [],
    })
    expect(config.settings.initialized).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter '@getcoherent/core' test -- --run`
Expected: FAIL — `initialized` property does not exist on settings type.

**Step 3: Write minimal implementation**

In `packages/core/src/types/design-system.ts`, add `initialized` to the settings schema:

```typescript
// Inside the settings schema object, add:
initialized: z.boolean().default(true),
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter '@getcoherent/core' test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/types/design-system.ts packages/core/src/types/design-system.test.ts
git commit -m "feat: add initialized flag to design system settings schema"
```

---

### Task 2: Set `initialized: false` during `coherent init`

**Files:**
- Modify: `packages/core/src/generators/ProjectScaffolder.ts`
- No new test file — behavior verified via Task 1 schema tests and Task 6 integration tests.

**Step 1: Find where initial config is created in ProjectScaffolder**

Search for where `settings` object is built in `ProjectScaffolder.ts` (look for `settings:` or `appType` assignment in the scaffolding flow).

**Step 2: Add `initialized: false` to the settings**

In the initial config object passed to `DesignSystemManager`, ensure `settings.initialized` is set to `false`.

**Step 3: Build and verify**

Run: `pnpm build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/core/src/generators/ProjectScaffolder.ts
git commit -m "feat: set initialized=false during coherent init"
```

---

### Task 3: Navigation snapshot comparison utility

**Files:**
- Create: `packages/cli/src/utils/nav-snapshot.ts`
- Create: `packages/cli/src/utils/nav-snapshot.test.ts`

**Step 1: Write the failing test**

In `packages/cli/src/utils/nav-snapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { takeNavSnapshot, hasNavChanged } from './nav-snapshot.js'

describe('nav-snapshot', () => {
  it('detects no change when items are identical', () => {
    const items = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Settings', href: '/settings' },
    ]
    const before = takeNavSnapshot(items)
    const after = takeNavSnapshot(items)
    expect(hasNavChanged(before, after)).toBe(false)
  })

  it('detects change when a page is added', () => {
    const before = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
    ])
    const after = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
    ])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('detects change when a page is removed', () => {
    const before = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
    ])
    const after = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
    ])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('detects change when a label is renamed', () => {
    const before = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
    ])
    const after = takeNavSnapshot([
      { label: 'Home', href: '/dashboard' },
    ])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('handles undefined/empty items', () => {
    expect(hasNavChanged(takeNavSnapshot(undefined), takeNavSnapshot(undefined))).toBe(false)
    expect(hasNavChanged(takeNavSnapshot([]), takeNavSnapshot([]))).toBe(false)
    expect(hasNavChanged(takeNavSnapshot(undefined), takeNavSnapshot([{ label: 'A', href: '/a' }]))).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `packages/cli/src/utils/nav-snapshot.ts`:

```typescript
interface NavItem {
  label: string
  href: string
}

export function takeNavSnapshot(items: NavItem[] | undefined): string {
  if (!items || items.length === 0) return '[]'
  return JSON.stringify(items.map(i => `${i.label}:${i.href}`).sort())
}

export function hasNavChanged(before: string, after: string): boolean {
  return before !== after
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/nav-snapshot.ts packages/cli/src/utils/nav-snapshot.test.ts
git commit -m "feat: add navigation snapshot comparison utility"
```

---

### Task 4: File hash tracking utility

**Files:**
- Create: `packages/cli/src/utils/file-hashes.ts`
- Create: `packages/cli/src/utils/file-hashes.test.ts`

**Step 1: Write the failing test**

In `packages/cli/src/utils/file-hashes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeFileHash, loadHashes, saveHashes, isManuallyEdited } from './file-hashes.js'

describe('file-hashes', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hashes-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('computes consistent SHA-256 hash for a file', async () => {
    const filePath = join(tempDir, 'test.tsx')
    writeFileSync(filePath, 'export default function Page() { return <div>Hello</div> }')
    const hash1 = await computeFileHash(filePath)
    const hash2 = await computeFileHash(filePath)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('saves and loads hashes', async () => {
    const hashes = { 'components/shared/header.tsx': 'abc123' }
    await saveHashes(tempDir, hashes)
    const loaded = await loadHashes(tempDir)
    expect(loaded).toEqual(hashes)
  })

  it('returns empty object when no hashes file exists', async () => {
    const loaded = await loadHashes(tempDir)
    expect(loaded).toEqual({})
  })

  it('detects manually edited file', async () => {
    const filePath = join(tempDir, 'page.tsx')
    writeFileSync(filePath, 'original content')
    const hash = await computeFileHash(filePath)
    writeFileSync(filePath, 'edited content')
    const edited = await isManuallyEdited(filePath, hash)
    expect(edited).toBe(true)
  })

  it('returns false for unmodified file', async () => {
    const filePath = join(tempDir, 'page.tsx')
    writeFileSync(filePath, 'original content')
    const hash = await computeFileHash(filePath)
    const edited = await isManuallyEdited(filePath, hash)
    expect(edited).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `packages/cli/src/utils/file-hashes.ts`:

```typescript
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const HASHES_FILE = '.coherent/file-hashes.json'

export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8')
  return createHash('sha256').update(content).digest('hex')
}

export async function loadHashes(projectRoot: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(projectRoot, HASHES_FILE), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function saveHashes(projectRoot: string, hashes: Record<string, string>): Promise<void> {
  const dir = join(projectRoot, '.coherent')
  await mkdir(dir, { recursive: true })
  await writeFile(join(projectRoot, HASHES_FILE), JSON.stringify(hashes, null, 2) + '\n')
}

export async function isManuallyEdited(filePath: string, storedHash: string): Promise<boolean> {
  try {
    const currentHash = await computeFileHash(filePath)
    return currentHash !== storedHash
  } catch {
    return false
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/file-hashes.ts packages/cli/src/utils/file-hashes.test.ts
git commit -m "feat: add file hash tracking for manual edit protection"
```

---

### Task 5: Rewrite `regenerateLayout` with incremental mode

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`

**Step 1: Understand current state**

Read `code-generator.ts` lines 122–187. The current `regenerateLayout` function:
- Always overwrites `layout.tsx`
- Has `hasNavigationChanged()` for header/footer (but is flawed — compares full generated code, not nav items)
- No `initialized` check

**Step 2: Rewrite `regenerateLayout`**

Replace the function with two modes:

```typescript
export async function regenerateLayout(
  config: DesignSystemConfig,
  projectRoot: string,
  options: { navChanged: boolean } = { navChanged: false },
): Promise<void> {
  const appType = config.settings.appType || 'multi-page'
  const generator = new PageGenerator(config)
  const initialized = config.settings.initialized !== false

  if (!initialized) {
    // Full mode: first chat, replace everything
    const layout = config.pages[0]?.layout || 'centered'
    const code = await generator.generateLayout(layout, appType, { skipNav: true })
    await writeFile(resolve(projectRoot, 'app', 'layout.tsx'), code)
  }
  // Incremental mode: do NOT rewrite layout.tsx

  if (config.navigation?.enabled && appType === 'multi-page') {
    const navType = config.navigation.type || 'header'
    const shouldRegenShared = !initialized || options.navChanged

    if (shouldRegenShared) {
      if (navType === 'header' || navType === 'both') {
        const headerCode = generator.generateSharedHeaderCode()
        await generateSharedComponent(projectRoot, {
          name: 'Header',
          type: 'layout',
          code: headerCode,
          description: 'Main site header with navigation and theme toggle',
          usedIn: ['app/layout.tsx'],
          overwrite: true,
        })
      }
      const footerCode = generator.generateSharedFooterCode()
      await generateSharedComponent(projectRoot, {
        name: 'Footer',
        type: 'layout',
        code: footerCode,
        description: 'Site footer',
        usedIn: ['app/layout.tsx'],
        overwrite: true,
      })
      if (navType === 'sidebar' || navType === 'both') {
        const sidebarCode = generator.generateSharedSidebarCode()
        await generateSharedComponent(projectRoot, {
          name: 'Sidebar',
          type: 'layout',
          code: sidebarCode,
          description: 'Vertical sidebar navigation with collapsible sections',
          usedIn: ['app/(app)/layout.tsx'],
          overwrite: true,
        })
      }
    }
  }

  try {
    await integrateSharedLayoutIntoRootLayout(projectRoot)
    await ensureAuthRouteGroup(projectRoot)
    await ensureAppRouteGroupLayout(projectRoot, config.navigation?.type)
  } catch (err) {
    if (process.env.COHERENT_DEBUG === '1') {
      console.log(chalk.dim('Layout integration warning:', err))
    }
  }
}
```

**Step 3: Remove old `hasNavigationChanged` function**

Delete the `hasNavigationChanged` function from `code-generator.ts` — replaced by Task 3's `nav-snapshot` utility.

**Step 4: Build and verify**

Run: `pnpm build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts
git commit -m "feat: split regenerateLayout into full/incremental modes"
```

---

### Task 6: Integrate into chat.ts — nav snapshot + initialized flag

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`

**Step 1: Import nav-snapshot utility**

At the top of `chat.ts`, add:

```typescript
import { takeNavSnapshot, hasNavChanged } from '../utils/nav-snapshot.js'
```

**Step 2: Take nav snapshot before processing**

Before the modification loop (before `for (const request of normalizedRequests)`), add:

```typescript
const navBefore = takeNavSnapshot(
  config.navigation?.items?.map(i => ({ label: i.label, href: i.href || `/${i.id || ''}` }))
)
```

**Step 3: Compare nav after processing and pass to regenerateLayout**

After all modifications are applied and config is saved, replace the current `regenerateFiles` call:

```typescript
const navAfter = takeNavSnapshot(
  updatedConfig.navigation?.items?.map(i => ({ label: i.label, href: i.href || `/${i.id || ''}` }))
)
const navChanged = hasNavChanged(navBefore, navAfter)

if (allModified.size > 0) {
  spinner.start('Regenerating affected files...')
  await regenerateFiles(Array.from(allModified), updatedConfig, projectRoot, { navChanged })
  spinner.succeed('Files regenerated')
}
```

**Step 4: Set `initialized: true` after first chat**

After successful processing, if `initialized` was `false`:

```typescript
if (updatedConfig.settings.initialized === false) {
  updatedConfig.settings.initialized = true
  dsm.updateConfig(updatedConfig)
  await dsm.save()
}
```

**Step 5: Update `regenerateFiles` signature**

In `code-generator.ts`, update `regenerateFiles` to accept and pass `navChanged`:

```typescript
export async function regenerateFiles(
  modified: string[],
  config: DesignSystemConfig,
  projectRoot: string,
  options: { navChanged: boolean } = { navChanged: false },
): Promise<void> {
  // ... existing code ...
  if (config.navigation?.enabled && modified.length > 0) {
    await regenerateLayout(config, projectRoot, { navChanged: options.navChanged })
  }
  // ... rest unchanged ...
}
```

**Step 6: Build and verify**

Run: `pnpm build && pnpm test`
Expected: All pass.

**Step 7: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/commands/chat/code-generator.ts
git commit -m "feat: integrate nav snapshot comparison and initialized flag into chat flow"
```

---

### Task 7: File hash integration into chat flow

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/commands/chat/code-generator.ts`

**Step 1: Import file-hashes utility**

In `chat.ts`:

```typescript
import { loadHashes, saveHashes, computeFileHash, isManuallyEdited } from '../utils/file-hashes.js'
```

**Step 2: Load hashes at chat start**

After loading config, load stored hashes:

```typescript
const storedHashes = await loadHashes(projectRoot)
```

**Step 3: Before writing files, check for manual edits**

In `code-generator.ts`, before each file write in `regenerateLayout` and `regenerateFiles`, add a check. For shared components, use the `generateSharedComponent` overwrite mechanism — modify it to consult hashes.

The simplest approach: pass `storedHashes` through to `regenerateLayout` and check before each write. If a file was manually edited and the user did NOT explicitly request changes to it, skip with warning.

**Step 4: After chat completes, save updated hashes**

At the end of `chat.ts`, after all files are written:

```typescript
const updatedHashes = { ...storedHashes }
for (const filePath of allWrittenFiles) {
  const relativePath = path.relative(projectRoot, filePath)
  updatedHashes[relativePath] = await computeFileHash(filePath)
}
await saveHashes(projectRoot, updatedHashes)
```

**Step 5: Build and verify**

Run: `pnpm build && pnpm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/cli/src/commands/chat.ts packages/cli/src/commands/chat/code-generator.ts
git commit -m "feat: file hash tracking to protect manual edits"
```

---

### Task 8: Extend AI prompts for surgical modifications

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts`

**Step 1: Read current modifier.ts**

Understand the current `uxRecommendations` and system prompt structure.

**Step 2: Add surgical edit instructions**

Add to the system prompt (in the appropriate section of `modifier.ts`):

```typescript
const surgicalEditRules = `
CRITICAL — Surgical Modification Rules:
- When modifying an existing page, return the COMPLETE page code
- Change ONLY the specific section, component, or element the user requested
- Do NOT modify imports unless the change requires new imports
- Do NOT change state variables, event handlers, or data in unrelated sections
- Do NOT restyle sections the user did not mention
- Preserve all existing className values on unchanged elements
- If the user asks to change a "section" or "block", identify it by heading, content, or position

Component Promotion Rules:
- When the user asks to "make X a shared component" or "reuse X across pages":
  - Use request type "promote-and-link"
  - Extract the JSX block into a separate component file
  - Replace inline code with the component import on all specified pages

Global Component Change Rules:
- When the user asks to change "all cards" or "every button" or similar:
  - If the pattern is already a shared component, modify the shared component file
  - If the pattern is inline across pages, first promote it to a shared component, then modify it
`
```

**Step 3: Build and verify**

Run: `pnpm build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/cli/src/agents/modifier.ts
git commit -m "feat: add surgical edit and component promotion rules to AI prompts"
```

---

### Task 9: Design system consistency validation

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write failing tests**

In `quality-validator.test.ts`, add:

```typescript
describe('design system consistency', () => {
  it('warns on hardcoded hex colors', () => {
    const code = 'className="bg-[#FF5733] text-white"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(
      expect.objectContaining({ type: 'hardcoded-color' })
    )
  })

  it('does not warn on CSS variable colors', () => {
    const code = 'className="bg-primary text-foreground"'
    const warnings = checkDesignConsistency(code)
    expect(warnings.filter(w => w.type === 'hardcoded-color')).toHaveLength(0)
  })

  it('warns on arbitrary pixel values in spacing', () => {
    const code = 'className="p-[13px] mt-[47px]"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(
      expect.objectContaining({ type: 'arbitrary-spacing' })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: FAIL — `checkDesignConsistency` not found.

**Step 3: Write minimal implementation**

In `quality-validator.ts`, add:

```typescript
interface ConsistencyWarning {
  type: 'hardcoded-color' | 'arbitrary-spacing' | 'component-duplicate'
  message: string
  line?: number
}

export function checkDesignConsistency(code: string): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []

  // Detect hardcoded hex colors in Tailwind arbitrary values
  const hexPattern = /\[#[0-9a-fA-F]{3,8}\]/g
  for (const match of code.matchAll(hexPattern)) {
    warnings.push({
      type: 'hardcoded-color',
      message: `Hardcoded color ${match[0]} — use a design token (e.g., bg-primary) instead`,
    })
  }

  // Detect unusual arbitrary pixel spacing (not standard Tailwind values)
  const spacingPattern = /[pm][trblxy]?-\[\d+px\]/g
  for (const match of code.matchAll(spacingPattern)) {
    warnings.push({
      type: 'arbitrary-spacing',
      message: `Arbitrary spacing ${match[0]} — use Tailwind spacing scale instead`,
    })
  }

  return warnings
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: add design system consistency validation"
```

---

### Task 10: Strengthen AI output verification

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1: Write failing tests**

```typescript
describe('AI output verification for incremental edits', () => {
  it('detects removed imports that are still used', () => {
    const before = `import { Button } from '@/components/ui/button'\nimport { Card } from '@/components/ui/card'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const after = `import { Button } from '@/components/ui/button'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toContainEqual(
      expect.objectContaining({ type: 'missing-import', symbol: 'Card' })
    )
  })

  it('detects missing use client when hooks are present', () => {
    const code = `import { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const issues = verifyIncrementalEdit('', code)
    expect(issues).toContainEqual(
      expect.objectContaining({ type: 'missing-use-client' })
    )
  })

  it('passes clean incremental edit', () => {
    const before = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>Old</Button> }`
    const after = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>New</Button> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: FAIL — `verifyIncrementalEdit` not found.

**Step 3: Write minimal implementation**

```typescript
interface VerificationIssue {
  type: 'missing-import' | 'missing-use-client' | 'missing-default-export'
  symbol?: string
  message: string
}

export function verifyIncrementalEdit(before: string, after: string): VerificationIssue[] {
  const issues: VerificationIssue[] = []

  // Check for missing 'use client' when hooks are used
  const hookPattern = /\buse[A-Z]\w+\s*\(/
  if (hookPattern.test(after) && !after.includes("'use client'") && !after.includes('"use client"')) {
    issues.push({
      type: 'missing-use-client',
      message: 'Code uses React hooks but missing "use client" directive',
    })
  }

  // Check for missing default export
  if (!after.includes('export default')) {
    issues.push({
      type: 'missing-default-export',
      message: 'Missing default export — page component must have a default export',
    })
  }

  // Check for imports that were removed but symbols are still used
  const importRegex = /import\s+\{([^}]+)\}\s+from/g
  const beforeImports = new Set<string>()
  const afterImports = new Set<string>()

  for (const match of before.matchAll(importRegex)) {
    match[1].split(',').forEach(s => beforeImports.add(s.trim()))
  }
  for (const match of after.matchAll(importRegex)) {
    match[1].split(',').forEach(s => afterImports.add(s.trim()))
  }

  for (const symbol of beforeImports) {
    if (!afterImports.has(symbol) && symbol.length > 0) {
      // Check if symbol is still used in the code (outside import lines)
      const codeWithoutImports = after.replace(/^import\s+.*$/gm, '')
      const symbolRegex = new RegExp(`\\b${symbol}\\b`)
      if (symbolRegex.test(codeWithoutImports)) {
        issues.push({
          type: 'missing-import',
          symbol,
          message: `Import for "${symbol}" was removed but symbol is still used in code`,
        })
      }
    }
  }

  return issues
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter '@getcoherent/cli' test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: add AI output verification for incremental edits"
```

---

### Task 11: Full integration test

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

**Step 2: Run full CI pipeline locally**

Run: `pnpm build && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: All steps pass.

**Step 3: Manual smoke test**

1. `rm -rf /tmp/test-inc && mkdir /tmp/test-inc && cd /tmp/test-inc`
2. `node /path/to/cli/dist/index.js init` — verify `initialized: false` in config
3. `node /path/to/cli/dist/index.js chat "Create a blog app with Home and About pages"` — verify `initialized: true` after
4. Manually edit `components/shared/footer.tsx` — add a comment
5. `node /path/to/cli/dist/index.js chat "Add a Contact page"` — verify:
   - Footer warns about manual edit (if nav changed) or is skipped
   - Header updates with new Contact link
   - Existing pages are NOT rewritten
   - New Contact page is created

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify incremental modification architecture integration"
```
