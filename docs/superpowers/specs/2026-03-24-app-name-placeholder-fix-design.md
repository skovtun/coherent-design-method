# App Name Placeholder Fix

## Problem

`coherent init` sets `config.name` to the placeholder `"My App"`. This propagates into all generated code: headers, footers, sidebar logos, metadata. `coherent fix` correctly doesn't replace `"My App"` when `config.name` itself is `"My App"` — there's nothing to replace it with. The result: every project that doesn't explicitly name itself shows "My App" in production UI.

## Design

Two changes that together eliminate the placeholder problem for both new and existing projects.

### 1. `toTitleCase` utility

Add to existing `packages/cli/src/utils/strings.ts` (alongside `toKebabCase`, `toPascalCase`):

```ts
export function toTitleCase(slug: string): string
```

Converts kebab-case, snake_case, or plain slugs to Title Case:
- `my-cool-app` → `My Cool App`
- `test_projector` → `Test Projector`
- `taskflow` → `Taskflow`
- `MY-APP` → `My App` (normalize then title-case)
- `@org/my-app` → `My App` (strip scope prefix)
- Empty string / whitespace only → returns `"My App"` (safe fallback)

Algorithm: strip `@scope/` prefix if present, split on `-`, `_`, or camelCase boundaries, lowercase each word, capitalize first letter, join with spaces.

### 2. Init: derive name from directory

In `packages/cli/src/commands/init.ts`, before writing the initial config:

1. If `name` argument provided (`coherent init taskflow`): `toTitleCase(name)`
2. Else if `package.json` exists and has a `name` field that is a non-empty string: `toTitleCase(packageJson.name)`
3. Else: `toTitleCase(basename(cwd()))`

In `packages/cli/src/utils/minimal-config.ts`:
- Change `createMinimalConfig` to accept an `appName: string` parameter
- Replace hardcoded `name: 'My App'` with `name: appName`
- Replace hardcoded `description: 'Welcome to My App'` in `pages[0]` with `description: 'Welcome to ${appName}'`

The caller (`init.ts`) passes the derived name.

### 3. Fix: detect and replace placeholder (unconditional)

In `packages/cli/src/commands/fix.ts`, add a new **unconditional** step early in the pipeline, **before** step 4b (plan/layout repair) and **not gated by** `plan` or `hasSidebar`:

1. Ensure DSM is loaded (if `dsm` is null and `project.configPath` exists, create and load it)
2. Check `config.name === 'My App'`
3. Derive real name:
   - Read `package.json` `name` field → `toTitleCase()`
   - Fall back to `toTitleCase(basename(projectRoot))`
4. If derived name is still `'My App'` (e.g. directory literally named `my-app`), skip (no infinite loop)
5. If `dryRun`: log `Would replace placeholder "My App" with "${realName}" in config` and set in-memory only
6. If not `dryRun`: update config via `dsm.updateConfig({ ...dsm.getConfig(), name: realName })` then `dsm.save()`
7. Log: `✔ Replaced placeholder "My App" with "${realName}" in config`

After this step, the existing replacement logic in fix.ts that scans layouts (`app/(app)/layout.tsx`) and `components/shared/*.tsx` for `"My App"` fires naturally because `configName !== 'My App'`.

**Important**: The existing "My App" replacement blocks in fix.ts are currently inside `if (plan) { ... if (hasSidebar) { ... } }`. As part of this change, move the shared-components scan (`components/shared/*.tsx` "My App" replacement) to be **unconditional** — not gated by plan/sidebar. The `(app)/layout.tsx` replacement stays inside the sidebar gate since that file only exists in sidebar projects.

### 4. Config persistence

Use existing `DesignSystemManager` methods:
- `dsm.updateConfig({ ...dsm.getConfig(), name: realName })` — validates via Zod, refreshes registry
- `await dsm.save()` — writes to `design-system.config.ts`

No new methods needed on DSM.

### 5. Tests

- **`toTitleCase`** (in existing `strings.test.ts`): kebab-case, snake_case, single word, `@scope/name`, empty string, `MY-APP`, already title case
- **`createMinimalConfig`**: verify `name` and `pages[0].description` use provided `appName`
- **Fix placeholder detection**: verify "My App" in config is replaced with title-cased directory name when no plan exists (no sidebar gate dependency)
- **Fix dry-run**: verify config is not persisted in dry-run mode

## Files changed

| File | Change |
|------|--------|
| `packages/cli/src/utils/strings.ts` | Add `toTitleCase` |
| `packages/cli/src/utils/strings.test.ts` | Add tests |
| `packages/cli/src/utils/minimal-config.ts` | Accept `appName` param, remove hardcoded `"My App"` |
| `packages/cli/src/commands/init.ts` | Derive name, pass to `createMinimalConfig` |
| `packages/cli/src/commands/fix.ts` | Unconditional placeholder detection + make shared-component scan unconditional |

## Edge cases

- Directory named `.` or has empty basename → `toTitleCase` returns `"My App"` fallback, placeholder step skips
- `package.json` name is scoped (`@org/name`) → strip scope, title-case `name` part
- Derived name equals `"My App"` (directory literally `my-app`) → skip replacement to avoid no-op loop
- `--dry-run` → log what would change, do not write config or files
- DSM not yet initialized → create and load it if `project.configPath` exists
