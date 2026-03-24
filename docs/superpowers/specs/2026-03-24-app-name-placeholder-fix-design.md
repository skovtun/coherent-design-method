# App Name Placeholder Fix

## Problem

`coherent init` sets `config.name` to the placeholder `"My App"`. This propagates into all generated code: headers, footers, sidebar logos, metadata. `coherent fix` correctly doesn't replace `"My App"` when `config.name` itself is `"My App"` — there's nothing to replace it with. The result: every project that doesn't explicitly name itself shows "My App" in production UI.

## Design

Two changes that together eliminate the placeholder problem for both new and existing projects.

### 1. `toTitleCase` utility

New function in `packages/cli/src/utils/string-utils.ts`:

```ts
export function toTitleCase(slug: string): string
```

Converts kebab-case, snake_case, or plain slugs to Title Case:
- `my-cool-app` → `My Cool App`
- `test_projector` → `Test Projector`
- `taskflow` → `Taskflow`
- Already title case → unchanged

### 2. Init: derive name from directory

In `packages/cli/src/commands/init.ts`, before writing the initial config:

1. If `name` argument provided (`coherent init taskflow`): `toTitleCase(name)`
2. Else if `package.json` exists and has a non-generic `name` field: `toTitleCase(packageJson.name)`
3. Else: `toTitleCase(basename(cwd()))`

In `packages/cli/src/utils/minimal-config.ts`, change `createMinimalConfig` to accept an `appName` parameter instead of hardcoding `"My App"`. The caller (`init.ts`) passes the derived name.

### 3. Fix: detect and replace placeholder

In `packages/cli/src/commands/fix.ts`, add a new step early in the fix pipeline (before the existing "My App" replacement logic):

1. Check `config.name === 'My App'`
2. Derive real name: read `package.json` name → fall back to `basename(projectRoot)` → `toTitleCase`
3. Update `config.name` in the in-memory config via `dsm.updateName(realName)` (or direct config mutation + save)
4. Log: `✔ Replaced placeholder "My App" with "${realName}" in config`

After this step, the existing replacement logic in fix.ts (which scans layouts and `components/shared/*.tsx` for `"My App"`) will fire naturally because `configName !== 'My App'`.

### 4. Config persistence

`DesignSystemManager` needs a method to update the name and persist to disk. Either:
- Add `updateName(name: string)` method, or
- Use existing `updateConfig` pattern if available

The config file `design-system.config.ts` is rewritten with the updated name.

### 5. Tests

- **`toTitleCase`**: kebab-case, snake_case, single word, already title case, edge cases (empty string, numbers)
- **Init**: verify config.name is derived from directory name when no explicit name given
- **Fix**: verify "My App" in config is replaced with title-cased directory name, and subsequent layout/component replacement fires

## Files changed

| File | Change |
|------|--------|
| `packages/cli/src/utils/string-utils.ts` | New file: `toTitleCase` |
| `packages/cli/src/utils/string-utils.test.ts` | New file: tests |
| `packages/cli/src/utils/minimal-config.ts` | Accept `appName` param, remove hardcoded `"My App"` |
| `packages/cli/src/commands/init.ts` | Derive name, pass to `createMinimalConfig` |
| `packages/cli/src/commands/fix.ts` | Detect placeholder, update config name |
| `packages/core/src/managers/DesignSystemManager.ts` | Add `updateName` or equivalent |

## Edge cases

- Directory named `.` or `/` → fall back to `"My App"` (only remaining valid use)
- `package.json` name is a scoped package (`@org/name`) → extract `name` part, title-case it
- Name argument contains special characters → strip them before title-casing
