# Centralized Component Installer

> Replaces 7 scattered `provider.install()` call sites with a single `installComponent()` method that guarantees the full install chain.

## Problem

Component installation is duplicated across 7 files with inconsistent behavior:

- **3 callers skip `init()`** — `code-generator.ts`, `modification-handler.ts`, `fix.ts` never call `provider.init()` before `provider.install()`, so `npx shadcn add` fails silently when `components.json` is missing.
- **6 callers skip verification** — only `preview.ts` checks `existsSync` after install; others assume success.
- **2 callers overwrite shadcn files** — `fix.ts` and `preview.ts fixMissingComponentExports` run `generator.generate()` after install, replacing real shadcn components with bundled stubs.
- **File paths use 3 different strategies** — `${name}.tsx`, inline regex kebab-case, imported `toKebabCase()`.
- **`--overwrite` flag is dead** — `install()` returns early if file exists, so `--overwrite` never executes.
- **10+ `new ShadcnProvider()` instances** — singleton `getComponentProvider()` exists but is unused.
- **Dead code** — `installShadcnComponent()` in `shadcn-installer.ts` is never called.
- **5 files import `getShadcnComponent()`** — each caller resolves the definition separately.

## Solution

### `ShadcnProvider.installComponent()`

Single method with full guarantees:

```typescript
interface InstallResult {
  success: boolean
  componentDef: ComponentDefinition | null
}

interface InstallOptions {
  force?: boolean  // skip existsSync check, re-install even if file present
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

  if (!options?.force && existsSync(filePath)) {
    return { success: true, componentDef: getShadcnComponent(id) ?? null }
  }

  await this.install(id, projectRoot, defaultDeps, true)  // force=true to bypass internal existsSync

  const success = existsSync(filePath)
  const componentDef = success ? getShadcnComponent(id) ?? null : null
  return { success, componentDef }
}
```

### `ShadcnProvider.installBatch()`

Batch variant that runs a single `npx shadcn add comp1 comp2 ...` process:

```typescript
async installBatch(
  ids: string[],
  projectRoot: string,
  options?: InstallOptions,
): Promise<Map<string, InstallResult>>
```

Falls back to sequential `installComponent()` if batch fails (e.g., one bad ID).

### `install()` gains `force` parameter

```typescript
async install(name: string, projectRoot: string, deps = defaultDeps, force = false): Promise<void> {
  const componentPath = path.join(projectRoot, 'components', 'ui', `${name}.tsx`)
  if (!force && deps.existsSync(componentPath)) return
  // ... npx shadcn add --yes --overwrite ...
}
```

This makes `--overwrite` actually useful when `force=true`.

## Caller changes

### 1. `chat.ts` pre-flight (lines 468–504)

Before: `provider.init()` + loop with `provider.install()` + `getShadcnComponent()`.
After: `provider.installBatch(missingComponents, projectRoot)`, then loop over results for `cm.register()`.

Also fix: check both config AND file existence when building `missingComponents` (currently only checks `cm.read()`).

### 2. `preview.ts` `autoInstallShadcnComponent` (lines 274–284)

Before: `new ShadcnProvider()` + `init()` + `install()` + `existsSync`.
After: `getComponentProvider().installComponent(id, projectRoot)`, return `result.success`.

### 3. `code-generator.ts` `ensureComponentsInstalled` (lines 55–92)

Before: `new ShadcnProvider()` + `install()` (no `init()`!) + `getShadcnComponent()` + inline kebab-case.
After: `getComponentProvider().installComponent(id, projectRoot)`, use `result.componentDef`.

### 4. `modification-handler.ts` `add-component` (lines 434–462)

Before: `new ShadcnProvider()` + `install()` (no `init()`!) + `getShadcnComponent()`.
After: `getComponentProvider().installComponent(id, projectRoot)`, use `result.componentDef` for merge.

### 5. `fix.ts` (lines 178–204)

Before: `new ShadcnProvider()` + `install()` (no `init()`!) + `getShadcnComponent()` + **`generator.generate()` overwrites shadcn**.
After: `getComponentProvider().installComponent(id, projectRoot)`. Skip `generator.generate()` when `result.componentDef?.source === 'shadcn'`.

### 6. `init.ts` `ensureRegistryComponents` (lines 99–119)

Before: `new ShadcnProvider()` + `init()` + 5 sequential `install()` calls.
After: `getComponentProvider().installBatch(['button', 'card', 'input', 'label', 'switch'], projectRoot)`.

### 7. `migrate.ts` (lines 140–155)

Before: `new ShadcnProvider()` + `init()` + loop with `rmSync()` + `install()`.
After: `getComponentProvider().installBatch(migratable, projectRoot, { force: true })`.

### 8. `preview.ts` `fixMissingComponentExports` (lines 170–218)

Before: `getShadcnComponent()` + `generator.generate()` overwrites shadcn files.
After: For shadcn components, use `installComponent(id, projectRoot, { force: true })`. Only use `generator.generate()` for non-shadcn components.

## Cleanup

- **Delete** `installShadcnComponent()` from `shadcn-installer.ts` (dead code).
- **Remove** `getShadcnComponent` imports from 5 caller files — `installComponent` returns `componentDef`.
- **Replace** all `new ShadcnProvider()` with `getComponentProvider()` singleton.
- **Remove** inline kebab-case logic from `code-generator.ts` (use shared `toKebabCase` or let `installComponent` handle it).

## Optional improvements

### `init()` validates existing `components.json`

If `components.json` exists but `tailwind.config` points to a non-existent file, overwrite it with the correct template. Prevents silent `npx shadcn add` failures on Tailwind v3 → v4 upgrades.

## Testing

- Unit tests for `installComponent()`: success, failure, force overwrite, unknown component.
- Unit tests for `installBatch()`: multiple components, partial failure with fallback.
- Update existing tests for callers that change behavior (fix.ts, preview.ts, code-generator.ts).
- Integration test: `init()` + `installComponent()` + verify file exists end-to-end.
