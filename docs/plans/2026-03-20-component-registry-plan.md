# Component Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace template-based component generation with real shadcn/ui components via a pluggable ComponentProvider abstraction, including migration, offline fallback, and updated AI constraints.

**Architecture:** A `ComponentProvider` interface abstracts component installation. `ShadcnProvider` uses `npx shadcn add` with bundled-template fallback. CLI commands (`init`, `chat`, `fix`, `preview`) route through the provider. A `coherent migrate` command upgrades existing projects safely.

**Tech Stack:** TypeScript, vitest, shadcn/ui CLI, next-themes, Radix UI (transitive), Tailwind v4

**Design doc:** `docs/plans/2026-03-20-component-registry-design.md`

---

## Phase 1: Foundation — Types & ComponentProvider Interface

### Task 1.1: Create ComponentProvider types

**Files:**
- Create: `packages/core/src/types/component-provider.ts`
- Modify: `packages/core/src/types/index.ts` (add re-export)
- Test: `packages/core/src/types/component-provider.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/types/component-provider.test.ts
import { describe, it, expect } from 'vitest'
import type { ComponentProvider, ComponentAPI, ComponentMeta } from './component-provider.js'

describe('ComponentProvider types', () => {
  it('should allow implementing the ComponentProvider interface', () => {
    const mockProvider: ComponentProvider = {
      id: 'test',
      init: async () => {},
      install: async () => {},
      list: () => [],
      getComponentAPI: () => null,
      getCssVariables: () => '',
      getThemeBlock: () => '',
    }
    expect(mockProvider.id).toBe('test')
  })

  it('should define ComponentAPI with required fields', () => {
    const api: ComponentAPI = {
      name: 'Button',
      subcomponents: ['Button'],
      importPath: '@/components/ui/button',
      keyProps: { variant: '"default" | "ghost"' },
      usage: '<Button variant="ghost">Click</Button>',
      antiPatterns: ['Never use custom bg-* on Button'],
    }
    expect(api.name).toBe('Button')
    expect(api.subcomponents).toHaveLength(1)
  })

  it('should define ComponentMeta with required fields', () => {
    const meta: ComponentMeta = {
      id: 'button',
      name: 'Button',
      category: 'form',
      managed: true,
    }
    expect(meta.managed).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/types/component-provider.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/core/src/types/component-provider.ts
export interface ComponentMeta {
  id: string
  name: string
  category: 'form' | 'layout' | 'navigation' | 'feedback' | 'data-display' | 'overlay' | 'typography'
  managed: boolean
}

export interface ComponentAPI {
  name: string
  subcomponents: string[]
  importPath: string
  keyProps: Record<string, string>
  usage: string
  antiPatterns: string[]
}

export interface ComponentProvider {
  id: string
  init(projectRoot: string): Promise<void>
  install(name: string, projectRoot: string): Promise<void>
  list(): ComponentMeta[]
  getComponentAPI(name: string): ComponentAPI | null
  getCssVariables(tokens: DesignTokens): string
  getThemeBlock(tokens: DesignTokens): string
}

// Re-use existing DesignTokens from design-system types
import type { DesignSystemConfig } from './design-system.js'
export type DesignTokens = DesignSystemConfig['tokens']
```

**Step 4: Add re-export to index**

```typescript
// packages/core/src/types/index.ts — add line:
export * from './component-provider.js'
```

**Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/types/component-provider.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/src/types/component-provider.ts packages/core/src/types/component-provider.test.ts packages/core/src/types/index.ts
git commit -m "feat(core): add ComponentProvider interface and types"
```

---

### Task 1.2: Add `provider` field to design-system config schema

**Files:**
- Modify: `packages/core/src/types/design-system.ts`
- Test: `packages/core/src/types/design-system.test.ts` (if exists, else create)

**Step 1: Write the failing test**

```typescript
// Test that config schema accepts and defaults provider field
import { describe, it, expect } from 'vitest'
import { DesignSystemConfigSchema } from './design-system.js'

describe('DesignSystemConfig provider field', () => {
  it('should default provider to "shadcn" when not specified', () => {
    const config = DesignSystemConfigSchema.parse({
      /* minimal valid config without provider */
    })
    expect(config.provider).toBe('shadcn')
  })

  it('should accept provider: "custom"', () => {
    const config = DesignSystemConfigSchema.parse({
      /* minimal valid config with provider: 'custom' */
    })
    expect(config.provider).toBe('custom')
  })
})
```

Note: You'll need to use a real minimal config fixture. Check `packages/core/src/config/minimal-config.ts` for the shape.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/types/design-system.test.ts`
Expected: FAIL — provider not in schema

**Step 3: Add provider to schema**

In `packages/core/src/types/design-system.ts`, add to `DesignSystemConfigSchema`:

```typescript
provider: z.enum(['shadcn', 'custom']).default('shadcn'),
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/types/design-system.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/types/design-system.ts packages/core/src/types/design-system.test.ts
git commit -m "feat(core): add provider field to design system config schema"
```

---

## Phase 2: ShadcnProvider — Core Implementation

### Task 2.1: Create ShadcnProvider skeleton with `list()` and `getComponentAPI()`

**Files:**
- Create: `packages/cli/src/providers/shadcn-provider.ts`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { ShadcnProvider } from './shadcn-provider.js'

describe('ShadcnProvider', () => {
  const provider = new ShadcnProvider()

  it('has id "shadcn"', () => {
    expect(provider.id).toBe('shadcn')
  })

  it('lists all shadcn components', () => {
    const components = provider.list()
    expect(components.length).toBeGreaterThan(40)
    expect(components.find(c => c.id === 'sidebar')).toBeTruthy()
    expect(components.find(c => c.id === 'button')).toBeTruthy()
  })

  it('returns ComponentAPI for sidebar', () => {
    const api = provider.getComponentAPI('sidebar')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('SidebarProvider')
    expect(api!.subcomponents).toContain('SidebarMenu')
    expect(api!.subcomponents).toContain('SidebarMenuButton')
    expect(api!.antiPatterns.length).toBeGreaterThan(0)
  })

  it('returns null for unknown component', () => {
    expect(provider.getComponentAPI('nonexistent')).toBeNull()
  })

  it('marks all components as managed', () => {
    const components = provider.list()
    expect(components.every(c => c.managed === true)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: FAIL

**Step 3: Implement ShadcnProvider with component registry data**

Create `packages/cli/src/providers/shadcn-provider.ts` with:
- Full list of ~56 shadcn components with metadata
- ComponentAPI definitions for key components (Sidebar, Sheet, Dialog, DropdownMenu, Select, NavigationMenu, Command, Tabs)
- Other components get basic API (name, import path, no anti-patterns)

Reference the shadcn component list from the design doc research.

**Step 4: Run tests**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/providers/
git commit -m "feat(cli): add ShadcnProvider with component registry and API data"
```

---

### Task 2.2: Implement `ShadcnProvider.install()` with fallback

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts`
- Create: `packages/cli/src/providers/fallback-provider.ts`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts` (add tests)

**Step 1: Write failing tests**

```typescript
describe('ShadcnProvider.install()', () => {
  it('calls npx shadcn add for the component', async () => {
    // Mock child_process.exec
    // Verify `npx shadcn@latest add button --yes --overwrite` is called
  })

  it('falls back to bundled template on network error', async () => {
    // Mock exec to throw ENOTFOUND
    // Verify FallbackProvider.install() is called
    // Verify warning is logged
  })

  it('falls back on timeout (15s)', async () => {
    // Mock exec to hang
    // Verify fallback after timeout
  })

  it('skips install if component file already exists', async () => {
    // Mock fs.existsSync to return true
    // Verify exec is NOT called
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/cli/src/providers/shadcn-provider.test.ts`
Expected: FAIL

**Step 3: Implement install() with exec + fallback**

```typescript
async install(name: string, projectRoot: string): Promise<void> {
  const componentPath = path.join(projectRoot, 'components', 'ui', `${name}.tsx`)
  if (fs.existsSync(componentPath)) return

  try {
    await execWithTimeout(
      `npx shadcn@latest add ${name} --yes --overwrite`,
      { cwd: projectRoot, timeout: 15000 }
    )
  } catch {
    console.warn(`Network unavailable, using bundled template for ${name}`)
    await this.fallback.install(name, projectRoot)
  }
}
```

**FallbackProvider** wraps the existing `ComponentGenerator` + `shadcn-installer.ts` logic.

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/providers/
git commit -m "feat(cli): implement ShadcnProvider.install() with offline fallback"
```

---

### Task 2.3: Implement `ShadcnProvider.init()`

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts` (add tests)

**Step 1: Write failing tests**

```typescript
describe('ShadcnProvider.init()', () => {
  it('creates components.json with correct structure', async () => {
    // Use tmp directory
    // Call provider.init(tmpDir)
    // Verify components.json exists and has correct fields
  })

  it('does not overwrite existing components.json', async () => {
    // Create components.json first
    // Call init()
    // Verify original content preserved
  })
})
```

**Step 2-5:** Standard TDD cycle. Init writes `components.json` to the project root.

**Step 6: Commit**

```bash
git commit -m "feat(cli): implement ShadcnProvider.init() with components.json generation"
```

---

## Phase 3: CSS Variables — Sidebar, Chart, @theme

### Task 3.1: Add sidebar CSS variables to `buildCssVariables`

**Files:**
- Modify: `packages/core/src/utils/buildCssVariables.ts`
- Test: `packages/core/src/utils/buildCssVariables.test.ts`

**Step 1: Write failing tests**

```typescript
describe('sidebar CSS variables', () => {
  it('generates --sidebar-background from background token', () => {
    const result = buildCssVariables(configWithTokens)
    expect(result).toContain('--sidebar-background:')
    expect(result).toContain('--sidebar-foreground:')
    expect(result).toContain('--sidebar-primary:')
    expect(result).toContain('--sidebar-primary-foreground:')
    expect(result).toContain('--sidebar-accent:')
    expect(result).toContain('--sidebar-accent-foreground:')
    expect(result).toContain('--sidebar-border:')
    expect(result).toContain('--sidebar-ring:')
  })
})
```

**Step 2: Run, verify fail**

**Step 3: Add sidebar variables**

Derive from existing tokens:
- `--sidebar-background` = `background`
- `--sidebar-foreground` = `foreground`
- `--sidebar-primary` = `primary`
- `--sidebar-primary-foreground` = `contrastFg(primary)`
- `--sidebar-accent` = `muted`
- `--sidebar-accent-foreground` = `foreground`
- `--sidebar-border` = `border`
- `--sidebar-ring` = `primary`

**Step 4-5:** Run tests, commit.

```bash
git commit -m "feat(core): add sidebar CSS variables to buildCssVariables"
```

---

### Task 3.2: Add chart CSS variables

**Files:**
- Modify: `packages/core/src/utils/buildCssVariables.ts`
- Test: `packages/core/src/utils/buildCssVariables.test.ts`

**Step 1: Write failing tests**

```typescript
describe('chart CSS variables', () => {
  it('generates --chart-1 through --chart-5', () => {
    const result = buildCssVariables(configWithTokens)
    for (let i = 1; i <= 5; i++) {
      expect(result).toContain(`--chart-${i}:`)
    }
  })
})
```

**Step 2-3:** Implement. Generate 5 chart colors by varying hue from primary:
- chart-1 = primary
- chart-2 = secondary
- chart-3, chart-4, chart-5 = hue-shifted variations

**Step 4-5:** Run tests, commit.

```bash
git commit -m "feat(core): add chart CSS variables to buildCssVariables"
```

---

### Task 3.3: Add `--radius` to `buildCssVariables`

**Files:**
- Modify: `packages/core/src/utils/buildCssVariables.ts`
- Test: `packages/core/src/utils/buildCssVariables.test.ts`

Currently `--radius` is only in `ProjectScaffolder.generateGlobalsCss()`.
Add it to `buildCssVariables()` too for consistency.

TDD cycle. Commit:

```bash
git commit -m "feat(core): sync --radius between buildCssVariables and ProjectScaffolder"
```

---

### Task 3.4: Update ProjectScaffolder to include sidebar, chart, and @theme variables

**Files:**
- Modify: `packages/core/src/generators/ProjectScaffolder.ts`
- Test: verify via existing scaffolder tests or add new ones

**Step 1:** Write test that `generateGlobalsCss()` output includes `--sidebar-*`, `--chart-*`, and `@theme inline` block with `--color-sidebar: var(--sidebar)` etc.

**Step 2-5:** TDD cycle. Commit:

```bash
git commit -m "feat(core): update ProjectScaffolder with sidebar/chart vars and @theme block"
```

---

### Task 3.5: Implement `ShadcnProvider.getCssVariables()` and `getThemeBlock()`

**Files:**
- Modify: `packages/cli/src/providers/shadcn-provider.ts`
- Test: `packages/cli/src/providers/shadcn-provider.test.ts`

These methods delegate to `buildCssVariables()` from core. The provider adds the `@theme inline` block generation.

TDD cycle. Commit:

```bash
git commit -m "feat(cli): implement ShadcnProvider CSS variable and theme block generation"
```

---

## Phase 4: Update `coherent init`

### Task 4.1: Integrate ComponentProvider into init flow

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/commands/init.ts` — replace `ensureRegistryComponents` with `provider.install()`

**Step 1: Write failing test**

Test that `coherent init` in a tmp dir:
1. Creates `components.json`
2. Installs base component set via provider
3. Generates `globals.css` with sidebar/chart variables

**Step 2-5:** TDD cycle.

Key change: Replace the `ensureRegistryComponents` loop that calls `ComponentGenerator` with:

```typescript
const provider = new ShadcnProvider()
await provider.init(projectRoot)

const baseComponents = ['button', 'card', 'input', 'label', 'switch']
for (const name of baseComponents) {
  await provider.install(name, projectRoot)
}
```

Commit:

```bash
git commit -m "feat(cli): integrate ComponentProvider into coherent init"
```

---

### Task 4.2: Add next-themes to init

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/core/src/generators/ProjectScaffolder.ts` (layout generation)

**Step 1:** Test that init installs `next-themes` and layout includes `ThemeProvider`.

**Step 2-5:** TDD cycle.

Add to init:
- `pnpm add next-themes` (or add to generated package.json)
- Layout template wraps `<body>` children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
- `<html>` gets `suppressHydrationWarning`

Commit:

```bash
git commit -m "feat(cli): add next-themes integration to coherent init"
```

---

## Phase 5: Update `coherent chat`

### Task 5.1: Replace shadcn-installer with ComponentProvider in chat

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat/modification-handler.ts`

**Step 1:** Find all calls to `installShadcnComponent`, `isShadcnComponent`, `getShadcnComponent` in chat flow.

**Step 2:** Replace with:

```typescript
const provider = getComponentProvider(config) // returns ShadcnProvider or FallbackProvider

// Pre-flight: install missing components
for (const id of missingComponentIds) {
  await provider.install(id, projectRoot)
}
```

**Step 3:** In `regenerateFiles`, skip components where `managed === true` (shadcn components should not be regenerated by ComponentGenerator).

**Step 4:** Test the integration.

Commit:

```bash
git commit -m "feat(cli): use ComponentProvider in coherent chat flow"
```

---

### Task 5.2: Update modifier to include provider.list() in AI prompt

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts`

**Step 1:** In `buildComponentRegistry()`, include available (not yet installed) components from `provider.list()` in addition to installed components.

**Step 2:** For installed components, include `provider.getComponentAPI()` data.

Commit:

```bash
git commit -m "feat(cli): include provider component APIs in AI modifier prompt"
```

---

## Phase 6: Update `coherent fix` and `coherent preview`

### Task 6.1: Update fix command

**Files:**
- Modify: `packages/cli/src/commands/fix.ts`

Replace `installShadcnComponent` + `ComponentGenerator.generate()` with `provider.install()`.

Commit:

```bash
git commit -m "feat(cli): use ComponentProvider in coherent fix"
```

---

### Task 6.2: Update preview auto-install

**Files:**
- Modify: `packages/cli/src/commands/preview.ts`

Replace `autoInstallShadcnComponent` and `fixMissingComponentExports` to use `provider.install()`.

Commit:

```bash
git commit -m "feat(cli): use ComponentProvider in coherent preview auto-install"
```

---

## Phase 7: Shared Components — Sidebar & Header

### Task 7.1: Rewrite shared Sidebar to use shadcn Sidebar

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts` (update sidebar rules)
- Modify: `packages/core/src/generators/PageGenerator.ts` (`generateSharedSidebarCode`)

**Step 1:** Update `generateSharedSidebarCode()` to emit code using:
- `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`
- `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`
- `asChild` with `next/link`
- Built-in mobile responsive (no separate Sheet)

**Step 2:** Update design constraints SIDEBAR section.

**Step 3:** Ensure `provider.install('sidebar', projectRoot)` is called when nav type includes sidebar.

Commit:

```bash
git commit -m "feat: rewrite shared Sidebar to use shadcn Sidebar component"
```

---

### Task 7.2: Rewrite shared Header to use NavigationMenu

**Files:**
- Modify: `packages/core/src/generators/PageGenerator.ts` (header generation)

Update header generation for `navigation.type === 'top'` to use:
- `NavigationMenu`, `NavigationMenuItem`, `NavigationMenuLink`
- `Sheet` for mobile hamburger menu

Commit:

```bash
git commit -m "feat: rewrite shared Header to use shadcn NavigationMenu"
```

---

### Task 7.3: Update in-page navigation constraints

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts`

Add rule: "For in-page navigation with <= 5 items (e.g. Settings tabs), use shadcn Tabs with vertical orientation. Do NOT use the full Sidebar component."

Commit:

```bash
git commit -m "feat: add design constraint for in-page navigation using vertical Tabs"
```

---

## Phase 8: AI Context — Design Constraints

### Task 8.1: Update design constraints with real shadcn component APIs

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts`

Update the AVAILABLE COMPONENTS section with real shadcn APIs:
- Sidebar: SidebarProvider, SidebarMenu, SidebarMenuButton, etc.
- Select: Radix-based compound component
- DropdownMenu: asChild, variant="destructive"
- Sheet: side prop, mobile patterns
- Dialog: DialogHeader, DialogTitle, etc.
- Command: CommandInput, CommandGroup, CommandItem

Include anti-patterns:
- NEVER use Button for sidebar nav → SidebarMenuButton
- NEVER use native <select> → shadcn Select
- NEVER nest <button> → use asChild correctly

Commit:

```bash
git commit -m "feat: update design constraints with real shadcn component APIs"
```

---

### Task 8.2: Update component-rules autofix

**Files:**
- Modify: `packages/cli/src/utils/component-rules.ts`
- Test: `packages/cli/src/utils/component-rules.test.ts`

Update existing `buttonMissingGhostVariant` rule. Consider adding:
- Rule for Button with `w-full` + `variant="ghost"` missing `justify-start`
- Rule for DropdownMenuItem with `className="text-destructive"` → suggest `variant="destructive"`

TDD cycle for each new rule.

Commit:

```bash
git commit -m "feat: update component autofix rules for real shadcn patterns"
```

---

## Phase 9: Migration Command

### Task 9.1: Create `coherent migrate` command skeleton

**Files:**
- Create: `packages/cli/src/commands/migrate.ts`
- Modify: `packages/cli/src/index.ts` (register command)
- Test: `packages/cli/src/commands/migrate.test.ts`

**Step 1:** Write test for command registration and --dry-run flag.

**Step 2:** Implement skeleton with commander:

```typescript
program
  .command('migrate')
  .description('Upgrade project to use real shadcn/ui components')
  .option('--dry-run', 'Preview changes without applying')
  .option('--yes', 'Skip confirmation prompts')
  .option('--rollback', 'Undo last migration')
  .action(migrateAction)
```

Commit:

```bash
git commit -m "feat(cli): add coherent migrate command skeleton"
```

---

### Task 9.2: Implement template hash comparison

**Files:**
- Create: `packages/cli/src/data/template-hashes.json`
- Create: `packages/cli/src/utils/template-hash.ts`
- Test: `packages/cli/src/utils/template-hash.test.ts`

Generate hashes of current template outputs. Compare against user's component files to determine if they've been modified.

```typescript
export function isTemplateUnmodified(filePath: string, componentId: string): boolean
```

TDD cycle. Commit:

```bash
git commit -m "feat(cli): add template hash comparison for safe migration"
```

---

### Task 9.3: Implement migration backup and rollback

**Files:**
- Modify: `packages/cli/src/commands/migrate.ts`
- Test: add backup/rollback tests

Implement:
- Backup to `.coherent/backups/pre-migrate-[timestamp]/`
- Guard file `.coherent/migration-in-progress`
- Rollback: copy from backup, remove guard
- Automatic rollback on failure

TDD cycle. Commit:

```bash
git commit -m "feat(cli): implement migration backup and rollback"
```

---

### Task 9.4: Implement migration core logic

**Files:**
- Modify: `packages/cli/src/commands/migrate.ts`

Implement the 13-step migration sequence from the design doc:

1. Backup
2. Create guard file
3. Dry-run validation
4. Install Radix deps
5. Replace unmodified component files (`npx shadcn add --overwrite`)
6. `tsc --noEmit` → collect errors
7. Fix page API mismatches
8. Clean up layout.tsx inline `<style>`
9. Update globals.css (sidebar, chart, @theme)
10. `tsc --noEmit` → verify clean
11. `next build` → if fail → rollback
12. Remove guard
13. Report

TDD each sub-step. This is the largest task — break into sub-commits as needed.

Commit:

```bash
git commit -m "feat(cli): implement full migration logic with safety checks"
```

---

### Task 9.5: Add migration guard to `coherent chat`

**Files:**
- Modify: `packages/cli/src/commands/chat.ts`

Check for `.coherent/migration-in-progress` at start. If exists, abort with:
"Migration in progress. Run `coherent migrate --continue` or `coherent migrate --rollback`."

Commit:

```bash
git commit -m "feat(cli): block coherent chat during migration"
```

---

## Phase 10: Integration Testing

### Task 10.1: Integration test for init with ShadcnProvider

**Files:**
- Create: `packages/cli/src/commands/__tests__/init-integration.test.ts`

Test in tmp dir:
1. `coherent init` creates project
2. `components.json` exists with correct structure
3. Base components installed as files
4. `globals.css` has sidebar/chart/theme variables
5. `layout.tsx` includes ThemeProvider

Commit:

```bash
git commit -m "test: add integration test for init with ComponentProvider"
```

---

### Task 10.2: Integration test for migration

**Files:**
- Create: `packages/cli/src/commands/__tests__/migrate-integration.test.ts`

Test:
1. Create a "legacy" project (template components)
2. Run migration
3. Verify component files replaced
4. Verify globals.css updated
5. Verify layout.tsx cleaned
6. Verify build passes

Commit:

```bash
git commit -m "test: add integration test for coherent migrate"
```

---

### Task 10.3: Final verification

**Step 1:** Run full test suite

```bash
pnpm test
```

**Step 2:** Run lint + typecheck + build

```bash
pnpm lint && pnpm typecheck && pnpm build
```

**Step 3:** Manual smoke test

```bash
cd /tmp && coherent init test-project && cd test-project && coherent preview
```

**Step 4:** Commit and push

```bash
git push origin main
```

**Step 5:** Publish

```bash
cd packages/core && pnpm publish --access public
cd packages/cli && pnpm publish --access public
```

---

## Summary

| Phase | Tasks | Estimated Time |
|-------|-------|---------------|
| 1. Foundation (types) | 2 | 15 min |
| 2. ShadcnProvider | 3 | 45 min |
| 3. CSS Variables | 5 | 30 min |
| 4. Init flow | 2 | 30 min |
| 5. Chat flow | 2 | 30 min |
| 6. Fix/Preview | 2 | 15 min |
| 7. Shared components | 3 | 45 min |
| 8. AI constraints | 2 | 20 min |
| 9. Migration | 5 | 90 min |
| 10. Integration tests | 3 | 30 min |
| **Total** | **29 tasks** | **~5.5 hours** |

Dependencies:
- Phase 2 depends on Phase 1
- Phases 3-8 can partially parallelize
- Phase 9 depends on Phases 2-3
- Phase 10 depends on all previous phases
