# Component Registry — Real shadcn Components + Provider Abstraction

> Replace template-based component generation with real shadcn/ui components
> via a pluggable Component Registry architecture.

## Problem

The CLI generates its own "shadcn-like" component templates instead of using
real shadcn/ui components. This causes:

- **Broken components**: Select is a native `<select>` pretending to be a
  compound component (nested `<select>` elements). DropdownMenu ignores
  `asChild` (nested `<button>` elements — invalid HTML).
- **Missing components**: No Sidebar, Sheet, Command, NavigationMenu —
  the AI generates ad-hoc replacements from Button/Link.
- **Styling bugs**: Button without `justify-start` in sidebar navigation,
  accent color mismatches, missing CSS variables.
- **Maintenance burden**: 18 hardcoded templates + 47 installer definitions
  that diverge from upstream shadcn with every release.

## Decision

**Approach C (Hybrid):** Use real shadcn CLI (`npx shadcn add`) for UI
components. Keep our generators for pages, shared components, and
design tokens. Wrap everything in a vendor-agnostic Component Registry
so the system can support other libraries in the future.

## Architecture

### 1. Component Registry — Provider Abstraction

```typescript
interface ComponentProvider {
  id: string                          // 'shadcn' | 'custom' | future providers
  init(projectRoot: string): Promise<void>
  install(name: string, projectRoot: string): Promise<void>
  list(): ComponentMeta[]
  getComponentAPI(name: string): ComponentAPI | null
  getCssVariables(tokens: DesignTokens): string
  getThemeBlock(tokens: DesignTokens): string  // @theme inline for Tailwind v4
}

interface ComponentAPI {
  name: string
  subcomponents: string[]
  importPath: string
  keyProps: Record<string, string>
  usage: string
  antiPatterns: string[]
}
```

**ShadcnProvider** implements this for shadcn/ui. **FallbackProvider** uses
bundled templates when offline. Future providers (Radix standalone, MUI,
custom corporate) implement the same interface.

Custom user components live in `@/components/` (not `ui/`), registered in
`design-system.config.ts` with `source: 'custom'`, and are not managed by
any provider.

### 2. CSS Variables & Theme Mapping

Extend `getCssVariables()` to generate the full shadcn variable set:

**New variables (light + dark):**

| Group | Variables |
|-------|-----------|
| Sidebar (8) | `--sidebar-background`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring` |
| Chart (5) | `--chart-1` through `--chart-5` |
| Radius | `--radius` (sync with `buildCssVariables`) |

**`@theme inline` block** must include Tailwind v4 mappings for all new
variables (e.g. `--color-sidebar: var(--sidebar)`) so utilities like
`bg-sidebar` work.

**Color format:** Stay with hex. OKLCH conversion available as future option.

**`components.json`** generated at init:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "rsc": true,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 3. Shared Components

Shared components use real shadcn primitives:

| Component | shadcn primitives used |
|-----------|----------------------|
| Sidebar (`components/shared/sidebar.tsx`) | `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarHeader`, `SidebarFooter` |
| Header (`components/shared/header.tsx`) | `NavigationMenu`, `NavigationMenuItem`, `NavigationMenuLink` + `Sheet` for mobile |
| Footer | Plain HTML + Tailwind (no shadcn needed) |

**Navigation type selection:**

| `navigation.type` | Result |
|-------------------|--------|
| `'sidebar'` | shadcn Sidebar + minimal Header |
| `'top'` | Header with NavigationMenu + Footer |
| `'both'` | Sidebar + Header (no nav in header) |

**In-page navigation** (e.g. Settings sidebar with 3-5 items): Use shadcn
`Tabs` with vertical orientation, not the full Sidebar component.

### 4. AI Context — Design Constraints

`ComponentProvider.getComponentAPI(name)` returns API descriptions embedded
in the AI prompt:

- Installed components: full API (subcomponents, props, usage, anti-patterns)
- Available components from provider: names only (AI can request installation)
- Custom components: full API from `design-system.config.ts`

Token optimization: only send APIs for installed + relevant components,
not the full 56-component catalog.

### 5. Offline Fallback

Three-level fallback:

```
Level 1: npx shadcn add [name]     → network available
Level 2: FallbackProvider           → bundled templates (current 18)
Level 3: error + manual instruction → component not in either source
```

- Timeout for `npx shadcn add`: 15 seconds
- Existing component files are never re-downloaded (cache by file existence)
- Warning logged when using fallback templates

### 6. Migration (`coherent migrate`)

New command for existing projects:

```bash
coherent migrate            # interactive
coherent migrate --dry-run  # preview changes
coherent migrate --yes      # auto-approve
coherent migrate --rollback # undo
```

**Safe execution order:**

```
 1. Backup → .coherent/backups/pre-migrate-[timestamp]/
 2. Create .coherent/migration-in-progress guard file
 3. Dry-run validation + report
 4. Install Radix dependencies (pnpm add @radix-ui/react-*)
 5. Replace component files (npx shadcn add --overwrite)
     - Only unmodified files (hash comparison with template-hashes.json)
     - Modified files: skip + warning
 6. tsc --noEmit → collect type errors
 7. Fix page API mismatches (guided by type errors):
     - DropdownMenuItem className="text-destructive" → variant="destructive"
     - Select API alignment
     - asChild corrections
 8. Clean up layout.tsx inline <style> → consolidate into globals.css
 9. Update globals.css:
     - Add --sidebar-*, --chart-* variables
     - Add @theme inline mappings
10. tsc --noEmit → verify clean
11. next build → if fails → automatic rollback
12. Remove .coherent/migration-in-progress
13. Report: "Migration complete. X components updated, Y pages fixed."
```

**Guards:**
- `coherent chat` blocked while `.coherent/migration-in-progress` exists
- Automatic rollback on any step failure
- Template hash comparison prevents overwriting user customizations

### 7. Dark Mode — next-themes

Replace manual `classList.toggle('dark')` with `next-themes`:

- Install `next-themes` during `coherent init`
- Add `ThemeProvider` to layout.tsx
- Prevents FOUC (flash of unstyled content) on SSR
- Automatic system preference detection
- Recommended by shadcn

### 8. Config Backwards Compatibility

Add `provider` field to `design-system.config.ts` schema:

```typescript
provider: z.enum(['shadcn', 'custom']).default('shadcn')
```

Old configs without this field default to `'shadcn'`.

Shadcn-sourced components in config are simplified (no variants/sizes):

```typescript
{ id: 'sidebar', name: 'Sidebar', source: 'shadcn', category: 'navigation' }
```

Full `ComponentDefinition` (with variants, sizes, baseClassName) remains
for `source: 'custom'` components only.

### 9. CLI Integration Points

| Command | Change |
|---------|--------|
| `coherent init` | `provider.init()` → `components.json` + `npx shadcn add` base set + `next-themes` |
| `coherent chat` | On-demand `provider.install()` for missing components. `regenerateFiles` skips `managed` (shadcn) components. `buildComponentRegistry` includes `provider.list()`. |
| `coherent fix` | Uses `provider.install()` instead of `ComponentGenerator` for shadcn components |
| `coherent preview` | Auto-install on "Module not found" via `provider.install()` with fallback |
| `coherent export` | No changes needed |
| `coherent migrate` | New command (see section 6) |

`extractComponentIdsFromCode` regex unchanged — import paths stay
`@/components/ui/{id}`.

## Testing Strategy

### Unit tests (vitest)

- `ComponentProvider` interface contract (mock provider)
- `ShadcnProvider.getCssVariables()` — tokens → full CSS variable set
- `ShadcnProvider.getThemeBlock()` — tokens → @theme inline block
- `ShadcnProvider.install()` — mock exec + fallback on error
- `components.json` generation structure
- Migration dry-run (snapshot of changes)
- Migration rollback (backup → modify → rollback → verify)
- `autoFixCode` updates for new shadcn patterns

### Integration tests

- `coherent init` → verify `components.json` + component files created
- `coherent chat` → mock AI generates Sidebar import → verify installed
- `coherent migrate` full flow → template project → migrate → build passes
- Offline fallback → mock network failure → verify bundled templates used

### Smoke tests

- `coherent init && coherent preview` — project starts
- `coherent migrate && next build` — project builds after migration

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `next-themes` | Dark mode with SSR support |
| `@radix-ui/react-*` | Installed transitively by `npx shadcn add` |
| shadcn component deps (`cmdk`, `vaul`, `recharts`, etc.) | Installed transitively by `npx shadcn add` |

## Risks

| Risk | Mitigation |
|------|-----------|
| `npx shadcn add` requires network | Three-level fallback with bundled templates |
| shadcn breaking changes | Pin shadcn CLI version in our deps; test in CI |
| Migration breaks user project | Automatic backup + rollback + build verification |
| AI generates wrong component usage | Updated design constraints + autoFixCode rules |
| Vendor lock-in to shadcn | ComponentProvider abstraction allows future providers |
