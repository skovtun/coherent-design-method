# Centralized Component Installer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace 7 scattered `provider.install()` call sites with a single `installComponent()` method that guarantees init → install → verify.

**Architecture:** Add `installComponent()` and `installBatch()` to `ShadcnProvider`. Update all callers to use singleton via `getComponentProvider()`. Remove dead code and redundant imports.

**Tech Stack:** TypeScript, vitest, shadcn/ui CLI

---

## Task 1: Add `force` parameter to `install()`

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts:401-419`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts`

**Step 1: Write the failing test**

In `shadcn-provider.test.ts`, add a test inside the `ShadcnProvider.install()` describe block (after the "falls back on exec error" test, ~line 131):

```typescript
it('re-installs when force=true even if file exists', async () => {
  const { exec } = await import('node:child_process')
  const { existsSync } = await import('node:fs')

  const execMock = vi.fn(
    (_cmd: string, _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
      if (cb) cb(null, { stdout: 'Done', stderr: '' })
    },
  )

  await provider.install('button', '/tmp/test-project', {
    exec: execMock as unknown as typeof exec,
    existsSync: (() => true) as typeof existsSync,
  }, true)

  expect(execMock).toHaveBeenCalledTimes(1)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: FAIL — `install()` does not accept a 4th argument.

**Step 3: Write minimal implementation**

In `shadcn-provider.ts`, change the `install` signature at line 401:

```typescript
async install(name: string, projectRoot: string, deps: InstallDeps = defaultDeps, force = false): Promise<void> {
  const componentPath = path.join(projectRoot, 'components', 'ui', `${name}.tsx`)
  if (!force && deps.existsSync(componentPath)) return
  // ... rest unchanged ...
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/providers/shadcn-provider.ts packages/cli/src/providers/shadcn-provider.test.ts
git commit -m "feat(shadcn): add force parameter to install()"
```

---

## Task 2: Add `installComponent()` to `ShadcnProvider`

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts` (after `install()`, ~line 419)
- Test: `packages/cli/src/providers/shadcn-provider.test.ts`

**Step 1: Write the failing tests**

Add a new describe block in `shadcn-provider.test.ts`:

```typescript
describe('ShadcnProvider.installComponent()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'install-component-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns { success: false } for unknown component', async () => {
    const provider = new ShadcnProvider()
    const result = await provider.installComponent('nonexistent', tmpDir)
    expect(result.success).toBe(false)
    expect(result.componentDef).toBeNull()
  })

  it('creates components.json via init() before install', async () => {
    const provider = new ShadcnProvider()
    expect(existsSync(path.join(tmpDir, 'components.json'))).toBe(false)

    // installComponent calls init internally — mock install to avoid npx
    const origInstall = provider.install.bind(provider)
    vi.spyOn(provider, 'install').mockImplementation(async (name, root, _deps, _force) => {
      // simulate npx creating the file
      const { mkdirSync, writeFileSync } = await import('node:fs')
      mkdirSync(path.join(root, 'components', 'ui'), { recursive: true })
      writeFileSync(path.join(root, 'components', 'ui', `${name}.tsx`), `export function Button() {}`)
    })

    await provider.installComponent('button', tmpDir)
    expect(existsSync(path.join(tmpDir, 'components.json'))).toBe(true)
  })

  it('returns success=true and componentDef when file is created', async () => {
    const provider = new ShadcnProvider()
    vi.spyOn(provider, 'install').mockImplementation(async (name, root) => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      mkdirSync(path.join(root, 'components', 'ui'), { recursive: true })
      writeFileSync(path.join(root, 'components', 'ui', `${name}.tsx`), 'export function Button() {}')
    })

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(true)
    expect(result.componentDef).not.toBeNull()
    expect(result.componentDef!.id).toBe('button')
  })

  it('returns success=false when install silently fails', async () => {
    const provider = new ShadcnProvider()
    vi.spyOn(provider, 'install').mockImplementation(async () => {
      // npx fails silently, no file created
    })

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(false)
    expect(result.componentDef).toBeNull()
  })

  it('skips install when file exists and force=false', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'existing')

    const installSpy = vi.spyOn(provider, 'install').mockImplementation(async () => {})

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(true)
    expect(result.componentDef).not.toBeNull()
    expect(installSpy).not.toHaveBeenCalled()
  })

  it('re-installs when force=true even if file exists', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'existing')

    const installSpy = vi.spyOn(provider, 'install').mockImplementation(async () => {})

    const result = await provider.installComponent('button', tmpDir, { force: true })
    expect(installSpy).toHaveBeenCalledWith('button', tmpDir, expect.anything(), true)
    expect(result.success).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: FAIL — `installComponent` is not a function.

**Step 3: Write minimal implementation**

Add to `shadcn-provider.ts` after the `install()` method (~line 419), and add necessary imports at top:

```typescript
// At top of file, add import:
import { getShadcnComponent } from '../utils/shadcn-installer.js'

// After install() method:
export interface InstallResult {
  success: boolean
  componentDef: ComponentDefinition | null
}

export interface InstallOptions {
  force?: boolean
}

async installComponent(
  id: string,
  projectRoot: string,
  options?: InstallOptions,
): Promise<InstallResult> {
  if (!this.has(id)) return { success: false, componentDef: null }

  await this.init(projectRoot)

  const kebabId = id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const filePath = path.join(projectRoot, 'components', 'ui', `${kebabId}.tsx`)

  if (!options?.force && fsExistsSync(filePath)) {
    return { success: true, componentDef: getShadcnComponent(id) ?? null }
  }

  await this.install(id, projectRoot, defaultDeps, !!options?.force)

  const success = fsExistsSync(filePath)
  const componentDef = success ? getShadcnComponent(id) ?? null : null
  return { success, componentDef }
}
```

Note: `ComponentDefinition` type must be imported from `@getcoherent/core`. Check existing imports at top of file.

Also export `InstallResult` and `InstallOptions` from the file for callers.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/providers/shadcn-provider.ts packages/cli/src/providers/shadcn-provider.test.ts
git commit -m "feat(shadcn): add installComponent() with init/install/verify guarantees"
```

---

## Task 3: Add `installBatch()` to `ShadcnProvider`

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts`

**Step 1: Write the failing tests**

```typescript
describe('ShadcnProvider.installBatch()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'install-batch-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('installs multiple components in a single npx call', async () => {
    const provider = new ShadcnProvider()
    const execMock = vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        // Simulate npx creating files
        const { mkdirSync, writeFileSync } = require('node:fs')
        mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
        writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'export {}')
        writeFileSync(path.join(tmpDir, 'components', 'ui', 'card.tsx'), 'export {}')
        if (cb) cb(null)
      },
    )

    const results = await provider.installBatch(['button', 'card'], tmpDir, undefined, {
      exec: execMock as any,
      existsSync,
    })

    expect(execMock).toHaveBeenCalledTimes(1)
    const cmd = execMock.mock.calls[0][0] as string
    expect(cmd).toContain('button card')
    expect(results.get('button')?.success).toBe(true)
    expect(results.get('card')?.success).toBe(true)
  })

  it('filters out unknown component IDs', async () => {
    const provider = new ShadcnProvider()
    const results = await provider.installBatch(['nonexistent'], tmpDir)
    expect(results.get('nonexistent')?.success).toBe(false)
  })

  it('creates components.json before batch install', async () => {
    const provider = new ShadcnProvider()
    vi.spyOn(provider, 'install').mockImplementation(async () => {})
    const initSpy = vi.spyOn(provider, 'init')

    await provider.installBatch(['button'], tmpDir)
    expect(initSpy).toHaveBeenCalledWith(tmpDir)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: FAIL — `installBatch` is not a function.

**Step 3: Write minimal implementation**

Add after `installComponent()` in `shadcn-provider.ts`:

```typescript
async installBatch(
  ids: string[],
  projectRoot: string,
  options?: InstallOptions,
  deps: InstallDeps = defaultDeps,
): Promise<Map<string, InstallResult>> {
  const results = new Map<string, InstallResult>()
  const validIds = ids.filter(id => this.has(id))
  const invalidIds = ids.filter(id => !this.has(id))

  for (const id of invalidIds) {
    results.set(id, { success: false, componentDef: null })
  }

  if (validIds.length === 0) return results

  await this.init(projectRoot)

  // Filter out already-installed (unless force)
  const toInstall: string[] = []
  for (const id of validIds) {
    const kebabId = id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    const filePath = path.join(projectRoot, 'components', 'ui', `${kebabId}.tsx`)
    if (!options?.force && fsExistsSync(filePath)) {
      results.set(id, { success: true, componentDef: getShadcnComponent(id) ?? null })
    } else {
      toInstall.push(id)
    }
  }

  if (toInstall.length === 0) return results

  // Single npx call for all components
  try {
    await new Promise<void>((resolve, reject) => {
      deps.exec(
        `npx shadcn@latest add ${toInstall.join(' ')} --yes --overwrite`,
        { cwd: projectRoot, timeout: 30000 },
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  } catch {
    console.warn(`Batch install failed for [${toInstall.join(', ')}]. Falling back to sequential.`)
    for (const id of toInstall) {
      const result = await this.installComponent(id, projectRoot, options)
      results.set(id, result)
    }
    return results
  }

  // Verify each
  for (const id of toInstall) {
    const kebabId = id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    const filePath = path.join(projectRoot, 'components', 'ui', `${kebabId}.tsx`)
    const success = fsExistsSync(filePath)
    results.set(id, {
      success,
      componentDef: success ? getShadcnComponent(id) ?? null : null,
    })
  }

  return results
}
```

Note: Batch timeout is 30000ms (vs 15000ms for single) since multiple components take longer.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/providers/shadcn-provider.ts packages/cli/src/providers/shadcn-provider.test.ts
git commit -m "feat(shadcn): add installBatch() for multi-component install"
```

---

## Task 4: Update `getComponentProvider()` singleton and export types

**Files:**
- Modify: `packages/cli/src/providers/index.ts`
- Modify: `packages/cli/src/providers/shadcn-provider.ts` (exports only)

**Step 1: Verify current state**

Read `packages/cli/src/providers/index.ts` — it should already export `getComponentProvider()`.

**Step 2: Update the singleton to re-export types**

In `packages/cli/src/providers/index.ts`:

```typescript
import type { ComponentProvider, DesignSystemConfig } from '@getcoherent/core'
import { ShadcnProvider } from './shadcn-provider.js'
export type { InstallResult, InstallOptions } from './shadcn-provider.js'
export { ShadcnProvider } from './shadcn-provider.js'

let _instance: ShadcnProvider | null = null

export function getComponentProvider(_config?: Pick<DesignSystemConfig, 'provider'>): ShadcnProvider {
  if (!_instance) {
    _instance = new ShadcnProvider()
  }
  return _instance
}
```

Note: Change return type from `ComponentProvider & ShadcnProvider` to just `ShadcnProvider` (which implements `ComponentProvider`), so callers get `installComponent` in autocomplete.

**Step 3: Verify builds**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/providers/index.ts
git commit -m "refactor(providers): export types and simplify singleton return type"
```

---

## Task 5: Migrate `preview.ts` callers

**Files:**
- Modify: `packages/cli/src/commands/preview.ts:25-26` (imports), `274-284` (autoInstallShadcnComponent), `170-218` (fixMissingComponentExports)

**Step 1: Update `autoInstallShadcnComponent` (lines 274-284)**

Replace the function with:

```typescript
async function autoInstallShadcnComponent(componentId: string, projectRoot: string): Promise<boolean> {
  const provider = getComponentProvider()
  const result = await provider.installComponent(componentId, projectRoot)
  return result.success
}
```

Update imports at top of file:
- Remove: `import { getShadcnComponent } from '../utils/shadcn-installer.js'`
- Remove: `import { ShadcnProvider } from '../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../providers/index.js'`

**Step 2: Update `fixMissingComponentExports` (lines 170-218)**

For shadcn components, use `installComponent({ force: true })` instead of `generator.generate()`:

```typescript
for (const [componentId, needed] of neededExports) {
  const componentFile = join(uiDir, `${componentId}.tsx`)
  const provider = getComponentProvider()

  if (!existsSync(componentFile)) {
    if (provider.has(componentId)) {
      const result = await provider.installComponent(componentId, projectRoot)
      if (result.success) {
        console.log(chalk.dim(`   ✔ Created missing ${componentId}.tsx`))
      }
    } else {
      const def = getShadcnComponent(componentId)
      if (!def) continue
      try {
        const { mkdirSync } = await import('fs')
        mkdirSync(uiDir, { recursive: true })
        const newContent = await generator.generate(def)
        writeFileSync(componentFile, newContent, 'utf-8')
        console.log(chalk.dim(`   ✔ Created missing ${componentId}.tsx`))
      } catch { /* best-effort */ }
    }
    continue
  }

  // Check exports...
  const content = readFileSync(componentFile, 'utf-8')
  // ... existing export analysis logic (lines 188-209) ...

  const missing = [...needed].filter(n => !existingExports.has(n))
  if (missing.length === 0) continue

  // For shadcn components, re-install to get full exports
  if (provider.has(componentId)) {
    const result = await provider.installComponent(componentId, projectRoot, { force: true })
    if (result.success) {
      console.log(chalk.dim(`   ✔ Reinstalled ${componentId}.tsx (added missing exports: ${missing.join(', ')})`))
    }
    continue
  }

  // For non-shadcn, use generator
  const def = getShadcnComponent(componentId)
  if (!def) continue
  try {
    const newContent = await generator.generate(def)
    writeFileSync(componentFile, newContent, 'utf-8')
    console.log(chalk.dim(`   ✔ Regenerated ${componentId}.tsx (added missing exports: ${missing.join(', ')})`))
  } catch { /* best-effort */ }
}
```

Note: `getShadcnComponent` import is still needed here for non-shadcn component fallback in `fixMissingComponentExports`. Keep the import but it will be used only in this one place.

**Step 3: Run tests and typecheck**

Run: `pnpm vitest run packages/cli/src/commands/preview.test.ts && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/preview.ts
git commit -m "refactor(preview): use installComponent() for component installation"
```

---

## Task 6: Migrate `code-generator.ts` `ensureComponentsInstalled`

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts:1-32` (imports), `55-92` (ensureComponentsInstalled)
- Test: `packages/cli/src/commands/chat/code-generator.test.ts`

**Step 1: Update the function**

Replace `ensureComponentsInstalled` (lines 55-92):

```typescript
export async function ensureComponentsInstalled(
  componentIds: Set<string> | string[],
  cm: ComponentManager,
  dsm: DesignSystemManager,
  pm: PageManager,
  projectRoot: string,
): Promise<{ installed: string[] }> {
  const installed: string[] = []
  const ids = Array.from(componentIds)
  const provider = getComponentProvider()

  for (const componentId of ids) {
    const isRegistered = !!cm.read(componentId)
    const filePath = resolve(projectRoot, 'components', 'ui', `${toKebabCase(componentId)}.tsx`)
    const fileExists = existsSync(filePath)

    if (isRegistered && fileExists) continue

    const result = await provider.installComponent(componentId, projectRoot)
    if (result.success && result.componentDef) {
      if (!isRegistered) {
        const regResult = await cm.register(result.componentDef)
        if (regResult.success) {
          dsm.updateConfig(regResult.config)
          cm.updateConfig(regResult.config)
          pm.updateConfig(regResult.config)
        }
      }
      installed.push(result.componentDef.id)
    }
  }
  return { installed }
}
```

Update imports:
- Remove: `import { getShadcnComponent } from '../../utils/shadcn-installer.js'`
- Remove: `import { ShadcnProvider } from '../../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../../providers/index.js'`

**Step 2: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/chat/code-generator.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts
git commit -m "refactor(code-generator): use installComponent() in ensureComponentsInstalled"
```

---

## Task 7: Migrate `chat.ts` pre-flight

**Files:**
- Modify: `packages/cli/src/commands/chat.ts:32-33` (imports), `449-510` (pre-flight)

**Step 1: Update imports**

- Remove: `import { getShadcnComponent } from '../utils/shadcn-installer.js'`
- Remove: `import { ShadcnProvider } from '../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../providers/index.js'`

**Step 2: Update the pre-flight section (lines 449-510)**

Fix the `missingComponents` detection to check BOTH config and file:

```typescript
// Phase 2: Single batch install of all missing components
const INVALID_COMPONENT_IDS = new Set(['ui', 'shared', 'lib', 'utils', 'hooks', 'app', 'components'])
for (const id of INVALID_COMPONENT_IDS) allNeededComponentIds.delete(id)

// ... DEBUG logging unchanged ...

const missingComponents: string[] = []
for (const componentId of allNeededComponentIds) {
  const isRegistered = !!cm.read(componentId)
  const filePath = join(projectRoot, 'components', 'ui', `${componentId}.tsx`)
  const fileExists = existsSync(filePath)
  if (DEBUG) console.log(chalk.gray(`    Checking ${componentId}: registered=${isRegistered} file=${fileExists}`))
  if (!isRegistered || !fileExists) {
    missingComponents.push(componentId)
  }
}

if (missingComponents.length > 0) {
  spinner.stop()
  console.log(chalk.cyan('\n🔍 Pre-flight check: Installing missing components...\n'))
  const provider = getComponentProvider()

  for (const componentId of missingComponents) {
    if (DEBUG) {
      console.log(chalk.gray(`    [DEBUG] Trying to install: ${componentId}`))
      console.log(chalk.gray(`    [DEBUG] provider.has(${componentId}): ${provider.has(componentId)}`))
    }

    if (provider.has(componentId)) {
      const result = await provider.installComponent(componentId, projectRoot)
      if (DEBUG) console.log(chalk.gray(`    [DEBUG] installComponent result: ${result.success}`))

      if (result.success && result.componentDef) {
        if (!cm.read(componentId)) {
          if (DEBUG) console.log(chalk.gray(`    [DEBUG] Registering ${result.componentDef.id} (${result.componentDef.name})`))
          const regResult = await cm.register(result.componentDef)
          if (DEBUG) {
            console.log(
              chalk.gray(
                `    [DEBUG] Register result: ${regResult.success ? 'SUCCESS' : 'FAILED'}${!regResult.success && regResult.message ? ` - ${regResult.message}` : ''}`,
              ),
            )
          }

          if (regResult.success) {
            preflightInstalledIds.push(result.componentDef.id)
            console.log(chalk.green(`   ✨ Auto-installed ${result.componentDef.name} component`))
            dsm.updateConfig(regResult.config)
            cm.updateConfig(regResult.config)
            pm.updateConfig(regResult.config)
          }
        } else {
          preflightInstalledIds.push(result.componentDef.id)
          console.log(chalk.green(`   ✨ Re-installed ${result.componentDef.name} component (file was missing)`))
        }
      }
    }
  }
}
```

**Step 3: Run tests and typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat.ts
git commit -m "refactor(chat): use installComponent() in pre-flight, check both config and file"
```

---

## Task 8: Migrate `modification-handler.ts`

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:25-26` (imports), `431-462` (add-component case)

**Step 1: Update imports**

- Remove: `import { getShadcnComponent } from '../../utils/shadcn-installer.js'`
- Remove: `import { ShadcnProvider } from '../../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../../providers/index.js'`

**Step 2: Update `add-component` case (lines 431-462)**

```typescript
case 'add-component': {
  const componentData = request.changes as ComponentDefinition

  const provider = getComponentProvider()
  if (componentData.source === 'shadcn' && provider.has(componentData.id)) {
    const result = await provider.installComponent(componentData.id, projectRoot)
    if (result.success && result.componentDef) {
      const mergedData: ComponentDefinition = {
        ...result.componentDef,
        variants:
          componentData.variants && componentData.variants.length > 0
            ? componentData.variants
            : result.componentDef.variants,
        sizes: componentData.sizes && componentData.sizes.length > 0 ? componentData.sizes : result.componentDef.sizes,
      }
      const regResult = await cm.register(mergedData)
      if (regResult.success) {
        dsm.updateConfig(regResult.config)
        cm.updateConfig(regResult.config)
        pm.updateConfig(regResult.config)
      }
      return {
        success: regResult.success,
        message: regResult.success ? `✨ Auto-installed ${componentData.name}` : regResult.message,
        modified: regResult.modified,
      }
    }
  }

  // fallthrough to normal registration...
```

**Step 3: Run tests and typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "refactor(modification-handler): use installComponent() for add-component"
```

---

## Task 9: Migrate `fix.ts` — fix the overwrite bug

**Files:**
- Modify: `packages/cli/src/commands/fix.ts:36-37` (imports), `169-204` (install loop)

**Step 1: Update imports**

- Remove: `import { getShadcnComponent } from '../utils/shadcn-installer.js'`
- Remove: `import { ShadcnProvider } from '../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../providers/index.js'`

**Step 2: Update the install loop (lines 169-204)**

This is where the overwrite bug lives. After `installComponent()`, skip `generator.generate()` for shadcn components:

```typescript
const provider = getComponentProvider()
const toInstall = [...new Set([...missingComponents, ...missingFiles])].filter(id => provider.has(id))

if (toInstall.length > 0) {
  if (dryRun) {
    fixes.push(`Would install components: ${toInstall.join(', ')}`)
    console.log(chalk.green(`  ✔ Would install components: ${toInstall.join(', ')}`))
  } else {
    let installed = 0
    for (const componentId of toInstall) {
      try {
        const result = await provider.installComponent(componentId, projectRoot)
        if (!result.success) continue
        if (result.componentDef && !cm.read(componentId)) {
          const regResult = await cm.register(result.componentDef)
          if (!regResult.success) continue
          dsm.updateConfig(regResult.config)
          cm.updateConfig(regResult.config)
          pm!.updateConfig(regResult.config)
        }

        // Only generate for non-shadcn components
        if (result.componentDef?.source !== 'shadcn') {
          const updatedConfig = dsm.getConfig()
          const component = updatedConfig.components.find(c => c.id === componentId)
          if (component) {
            const generator = new ComponentGenerator(updatedConfig)
            const code = await generator.generate(component)
            const fileName = toKebabCase(component.name) + '.tsx'
            const filePath = resolve(projectRoot, 'components', 'ui', fileName)
            mkdirSync(resolve(projectRoot, 'components', 'ui'), { recursive: true })
            await writeFile(filePath, code)
          }
        }
        installed++
      } catch (err) {
        console.log(
          chalk.yellow(`  ⚠ Failed to install ${componentId}: ${err instanceof Error ? err.message : 'unknown'}`),
        )
      }
    }
    // ... rest unchanged ...
  }
}
```

**Step 3: Run tests and typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "fix(fix): use installComponent(), stop overwriting shadcn components"
```

---

## Task 10: Migrate `init.ts` to use `installBatch()`

**Files:**
- Modify: `packages/cli/src/commands/init.ts:21` (imports), `99-119` (ensureRegistryComponents)

**Step 1: Update imports**

- Remove: `import { ShadcnProvider } from '../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../providers/index.js'`

**Step 2: Update `ensureRegistryComponents` (lines 99-119)**

```typescript
async function ensureRegistryComponents(config: DesignSystemConfig, projectPath: string): Promise<void> {
  const provider = getComponentProvider()

  const baseComponents = ['button', 'card', 'input', 'label', 'switch']
  await provider.installBatch(baseComponents, projectPath)

  const generator = new ComponentGenerator(config)
  const uiDir = join(projectPath, 'components', 'ui')
  if (!existsSync(uiDir)) mkdirSync(uiDir, { recursive: true })
  for (const comp of config.components) {
    if (comp.source === 'shadcn') continue
    const fileName = toKebabCase(comp.name) + '.tsx'
    const filePath = join(uiDir, fileName)
    if (existsSync(filePath)) continue
    const code = await generator.generate(comp)
    await writeFile(filePath, code)
  }
}
```

**Step 3: Run tests and typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "refactor(init): use installBatch() for base components"
```

---

## Task 11: Migrate `migrate.ts` to use `installBatch({ force: true })`

**Files:**
- Modify: `packages/cli/src/commands/migrate.ts:12` (imports), `113-155` (migration loop)

**Step 1: Update imports**

- Remove: `import { ShadcnProvider } from '../providers/shadcn-provider.js'`
- Add: `import { getComponentProvider } from '../providers/index.js'`

**Step 2: Update migration logic (lines 113-155)**

```typescript
const provider = getComponentProvider()
const managedIds = new Set(provider.listNames())

// ... existing migratable logic ...

try {
  // Remove old files first
  for (const id of migratable) {
    const filePath = join(uiDir, `${id}.tsx`)
    if (existsSync(filePath)) rmSync(filePath)
  }

  // Batch re-install with force
  const results = await provider.installBatch(migratable, projectRoot, { force: true })
  const migrated = [...results.values()].filter(r => r.success).length

  clearGuard(projectRoot)
  spinner.succeed(`Migrated ${migrated}/${migratable.length} components to real shadcn/ui`)
  console.log(chalk.dim(`  Backup saved to: ${backup}`))
} catch (err) {
  spinner.fail('Migration failed — rolling back')
  rollback(projectRoot)
  throw err
}
```

**Step 3: Run tests**

Run: `pnpm vitest run packages/cli/src/commands/migrate.test.ts && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/migrate.ts
git commit -m "refactor(migrate): use installBatch({ force: true }) for migration"
```

---

## Task 12: Migrate `modifier.ts` singleton usage

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts:193` (one-liner)

**Step 1: Update**

```typescript
// Old:
const availableShadcn = new ShadcnProvider().listNames()
// New:
const availableShadcn = getComponentProvider().listNames()
```

Update imports accordingly.

**Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/agents/modifier.ts
git commit -m "refactor(modifier): use getComponentProvider() singleton"
```

---

## Task 13: Delete dead code

**Files:**
- Modify: `packages/cli/src/utils/shadcn-installer.ts:822-833` (delete `installShadcnComponent`)

**Step 1: Delete `installShadcnComponent` function**

Remove lines 822-833 from `shadcn-installer.ts`. The function is never called.

**Step 2: Verify no references remain**

Run: `pnpm typecheck`
Expected: PASS (no callers exist)

**Step 3: Commit**

```bash
git add packages/cli/src/utils/shadcn-installer.ts
git commit -m "chore: remove dead installShadcnComponent() function"
```

---

## Task 14: Final verification

**Step 1: Run full CI checks**

```bash
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

Expected: All green.

**Step 2: Verify no remaining `new ShadcnProvider()` in non-test files**

```bash
rg 'new ShadcnProvider\(\)' packages/cli/src/ --glob '!*.test.*'
```

Expected: No results (all callers use `getComponentProvider()`).

**Step 3: Verify no remaining direct `getShadcnComponent` imports in caller files**

```bash
rg "getShadcnComponent" packages/cli/src/ --glob '!shadcn-installer.ts' --glob '!shadcn-provider.ts' --glob '!*.test.*'
```

Expected: Only `preview.ts` (for non-shadcn fallback in `fixMissingComponentExports`). All other files should be clean.

**Step 4: Commit any stragglers and push**

```bash
git push
```
