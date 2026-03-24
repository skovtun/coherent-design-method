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

Converts slugs to Title Case: `my-cool-app` → `My Cool App`, `@org/name` → `Name`, `myCoolApp` → `My Cool App`, `MY_APP` → `My App`, empty → `"My App"` fallback. Algorithm: strip `@scope/` prefix if present, split on `-`, `_`, or camelCase boundaries (insert split before uppercase following lowercase), lowercase each word, capitalize first letter, join with spaces.

**Init** — in `packages/cli/src/commands/init.ts`:

1. `name` argument → `toTitleCase(name)`
2. Else `package.json` name → `toTitleCase()`
3. Else `toTitleCase(basename(cwd()))`

Pass derived name to `createMinimalConfig(appName)`. In `minimal-config.ts`: replace hardcoded `name: 'My App'` with `name: appName` and `pages[0].description` with `` `Welcome to ${appName}` `` (template literal in TypeScript).

**Fix** — unconditional step in `fix.ts` after Step 3, before Step 4b. DSM must be loaded unconditionally whenever `configPath` exists (not gated by `allComponentIds.size > 0`):

1. If `dsm` is null and `project.configPath` exists: `dsm = new DesignSystemManager(project.configPath); await dsm.load()`
2. If `config.name === 'My App'`: derive real name from `package.json` → `basename(projectRoot)` → `toTitleCase`
3. If derived name still equals `'My App'`, skip
4. `dryRun`: log only, update in-memory. Not `dryRun`: `dsm.updateConfig(...)` + `await dsm.save()`
5. Existing "My App" replacement in layouts and `components/shared/*.tsx` fires naturally

Move `components/shared/*.tsx` "My App" scan to be **unconditional** (not gated by plan/sidebar). Must honor `dryRun`.

### 2. CSS variables sync (`fixGlobalsCss` fixes)

Three changes in `packages/cli/src/utils/fix-globals-css.ts`:

**v4 path: remove stale inline style** — After writing `globals.css` (line 62), check `layout.tsx` for `dangerouslySetInnerHTML`. If found, remove **only** the `<style dangerouslySetInnerHTML={...} />` element (not the entire `<head>` block — other metadata, links, or third-party snippets must be preserved). Use a regex to match the `<style dangerouslySetInnerHTML={{ __html: ... }} />` pattern and replace it with empty string. If `<head>` becomes empty after removal, remove the `<head>` tags too.

**v3 path: update existing inline style** — Replace the early return at line 87-88 (`if (layoutContent.includes('dangerouslySetInnerHTML')) return`) with logic to find and replace the existing `<style dangerouslySetInnerHTML={{ __html: "..." }} />` content with fresh `buildCssVariables(config)`. Match the existing `__html:` value string and replace it. This ensures color changes propagate to the inline style.

**Add to `fix.ts`** — Call `fixGlobalsCss(projectRoot, config)` in the fix pipeline (after DSM is loaded, unconditionally — not gated by `allComponentIds.size`). If `dsm` is null, create and load it first when `configPath` exists. This ensures `coherent fix` syncs CSS variables. Honor `dryRun` (skip write, log what would change). Use `safeWrite` for any `layout.tsx` modifications per `safe-file-transforms.mdc` rule.

### 3. No-op token skip

In `packages/core/src/managers/DesignSystemManager.ts`, `updateToken` method, after line 149 (`const oldValue = current[lastPart]`):

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

Uses `String()` coercion to handle both string and potential non-string comparisons consistently. For hex colors, `colorToHex` normalization already happens upstream in `normalizeRequest`, so `#fff` vs `#FFFFFF` is not an issue here.

### 4. `shadow-*` in RAW_COLOR_RE

In `packages/cli/src/utils/quality-validator.ts`, add `shadow` to the prefix list in `RAW_COLOR_RE` (line 6):

```
Before: (?:bg|text|border|ring|outline|from|to|via)-
After:  (?:bg|text|border|ring|outline|from|to|via|shadow)-
```

Also add `shadow` to the `accentColorRe` replacement regex (line 551) and add a handling branch in the `replace` callback. For `shadow-*` matches: map to semantic token the same way as `bg-*` (e.g. `shadow-indigo-500` → `shadow-primary`). Preserve opacity suffixes (e.g. `shadow-indigo-500/25` → `shadow-primary/25`). Also update `neutralColorRe` if it has a similar prefix list, for consistency.

### 5. Broken layout repair in `fix.ts`

**When plan exists:** After `ensurePlanGroupLayouts` runs, check each group's layout file. Note: in `fix.ts`, `ensurePlanGroupLayouts` is called with empty `storedHashes` (`{}`), so the hash-skip branch (`storedHash && storedHash !== currentHash`) never fires — layouts are always rewritten when a plan exists. The issue is that the generated layout itself may be "minimal" for certain layout types (e.g. `none` produces a bare wrapper). Fix: if the plan says `layout: 'sidebar'` but the generated code is minimal (heuristic below), regenerate with `buildAppLayoutCode('sidebar', config?.name)`.

**When no plan exists:** If `app/(app)/layout.tsx` exists but no plan file is found, check if the layout is minimal. If so, detect nav type from config (`config.navigation?.type`) and regenerate accordingly. If nav type is `'none'` or not set, a minimal layout is intentional — do not regenerate.

**Heuristic for "minimal layout"**: file size < 500 bytes AND doesn't contain any of: `Header`, `Footer`, `Sidebar`, `SidebarProvider`, `SidebarTrigger`, `Sheet`. A layout without these but with `layout: 'none'` in plan or `config.navigation?.type === 'none'` is intentional, not broken.

When regenerating, use `buildAppLayoutCode(navType, config?.name)` for sidebar/both, or `buildGroupLayoutCode(group.layout, group.pages, config?.name)` for header. Use `safeWrite` for the write.

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
