# CLI Consistency Fixes: App Name, CSS Sync, Layout Repair

## Problem

Seven related issues prevent `coherent fix` and `coherent chat` from maintaining consistent projects:

1. `config.name` defaults to `"My App"` and never gets a real name
2. Stale inline `<style>` in `layout.tsx` overrides `globals.css` on Tailwind v4 projects — buttons stay blue after color changes
3. Inline `<style>` on v3 projects never updates after initial injection — color changes are ignored
4. `updateToken` reports "Updated X from #ABC to #ABC" instead of skipping no-ops
5. `shadow-*` raw colors pass through quality validator undetected
6. `coherent fix` won't repair a broken/minimal `(app)/layout.tsx`
7. `coherent fix` never calls `fixGlobalsCss` — CSS variables are never synced by fix

## Design

### 1. App name placeholder (`init` + `fix`)

**`toTitleCase` utility** — add to `packages/cli/src/utils/strings.ts`:

Converts slugs to Title Case: `my-cool-app` → `My Cool App`, `@org/name` → `Name`, empty → `"My App"` fallback. Algorithm: strip `@scope/` prefix, split on `-`/`_`/camelCase boundaries, lowercase each word, capitalize first letter, join with spaces.

**Init** — in `packages/cli/src/commands/init.ts`:

1. `name` argument → `toTitleCase(name)`
2. Else `package.json` name → `toTitleCase()`
3. Else `toTitleCase(basename(cwd()))`

Pass derived name to `createMinimalConfig(appName)`. In `minimal-config.ts`: replace hardcoded `name: 'My App'` with `name: appName` and `pages[0].description: 'Welcome to ${appName}'`.

**Fix** — unconditional step in `fix.ts` after Step 3 (DSM loaded), before Step 4b:

1. Ensure DSM loaded (create if null and configPath exists)
2. If `config.name === 'My App'`: derive real name from `package.json` → `basename(projectRoot)` → `toTitleCase`
3. If derived name still equals `'My App'`, skip
4. `dryRun`: log only, update in-memory. Not `dryRun`: `dsm.updateConfig(...)` + `await dsm.save()`
5. Existing "My App" replacement in layouts and `components/shared/*.tsx` fires naturally

Move `components/shared/*.tsx` "My App" scan to be **unconditional** (not gated by plan/sidebar). Must honor `dryRun`.

### 2. CSS variables sync (`fixGlobalsCss` fixes)

Three changes in `packages/cli/src/utils/fix-globals-css.ts`:

**v4 path: remove stale inline style** — After writing `globals.css` (line 62), check `layout.tsx` for `dangerouslySetInnerHTML`. If found, remove the entire `<head>...</head>` block containing it. The `@theme inline` in globals.css handles everything for v4.

**v3 path: update existing inline style** — Replace the early return at line 87-88 (`if (layoutContent.includes('dangerouslySetInnerHTML')) return`) with logic to find and replace the existing `<style>` content with fresh `buildCssVariables(config)`. This ensures color changes propagate to the inline style.

**Add to `fix.ts`** — Call `fixGlobalsCss(projectRoot, config)` in the fix pipeline (after DSM is loaded). This ensures `coherent fix` syncs CSS variables. Honor `dryRun` (skip write, log what would change).

### 3. No-op token skip

In `packages/core/src/managers/DesignSystemManager.ts`, `updateToken` method, after line 149 (`const oldValue = current[lastPart]`):

```ts
if (oldValue === value) {
  return {
    success: true,
    modified: [],
    config: this.config,
    message: `Token ${path} is already set to ${value}, skipped`,
  }
}
```

### 4. `shadow-*` in RAW_COLOR_RE

In `packages/cli/src/utils/quality-validator.ts`, add `shadow` to the prefix list in `RAW_COLOR_RE` (line 6):

```
Before: (?:bg|text|border|ring|outline|from|to|via)-
After:  (?:bg|text|border|ring|outline|from|to|via|shadow)-
```

Also add `shadow` to the `accentColorRe` replacement regex (line 551) to auto-fix `shadow-indigo-500` → `shadow-primary`.

### 5. Broken layout repair in `fix.ts`

In the `ensurePlanGroupLayouts` call or after it, add a check: if `app/(app)/layout.tsx` exists but is "minimal" (doesn't contain `Header` or `Sidebar` or `SidebarProvider`), and the plan specifies a layout type, force-regenerate by passing a flag to bypass the hash check.

Heuristic for "minimal layout": file size < 500 bytes AND doesn't contain any of `Header`, `Footer`, `Sidebar`, `SidebarProvider`, `SidebarTrigger`.

When regenerating, use `buildGroupLayoutCode(group.layout, group.pages, config?.name)` or `buildAppLayoutCode(navType, config?.name)` depending on the layout type.

## Files changed

| File | Change |
|------|--------|
| `packages/cli/src/utils/strings.ts` | Add `toTitleCase` |
| `packages/cli/src/utils/strings.test.ts` | Add tests |
| `packages/cli/src/utils/minimal-config.ts` | Accept `appName` param |
| `packages/cli/src/commands/init.ts` | Derive name, pass to config |
| `packages/cli/src/commands/fix.ts` | Placeholder detection, unconditional shared scan, `fixGlobalsCss` call, broken layout repair |
| `packages/cli/src/utils/fix-globals-css.ts` | v4: remove stale inline style; v3: update inline style |
| `packages/core/src/managers/DesignSystemManager.ts` | Skip no-op token updates |
| `packages/cli/src/utils/quality-validator.ts` | Add `shadow` to RAW_COLOR_RE and accentColorRe |

## Tests

- `toTitleCase`: kebab, snake, single word, `@scope/name`, empty, `MY-APP`
- `createMinimalConfig(appName)`: name and description use provided name
- `fixGlobalsCss` v4: removes existing inline style from layout.tsx
- `fixGlobalsCss` v3: updates existing inline style with new colors
- `updateToken` no-op: returns skip message when old === new
- `RAW_COLOR_RE`: catches `shadow-indigo-500`, `shadow-blue-600/25`
- Fix placeholder: replaces "My App" with title-cased directory name
- Fix broken layout: regenerates minimal `(app)/layout.tsx`

## Edge cases

- Directory named `my-app` → `toTitleCase` returns "My App" → placeholder step skips (no infinite loop)
- `package.json` name scoped (`@org/name`) → strip scope
- `--dry-run` → no writes for any step (config, CSS, layout)
- DSM not initialized → create and load if configPath exists
- Layout has user edits (hash mismatch) but is clearly minimal → force-regenerate based on heuristic, not hash
- v4 layout with no inline style → `fixGlobalsCss` is a no-op (safe)
- v3 layout without inline style → inject fresh (existing behavior)
