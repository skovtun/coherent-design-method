# Sidebar Layout Architecture

## Problem

When `app:sidebar` is set in the architecture plan, the generated app has three visual bugs:

1. **Duplicate navigation** — Root layout renders `<Header>` with nav links (Dashboard, Projects, Tasks...) globally. The `(app)` group layout also renders `<AppSidebar>` with the same links. Both appear on every app page.
2. **Sidebar overlaps footer** — `<Footer>` sits outside `<SidebarProvider>` in the root layout, so it renders below the sidebar's full-height container, causing visual overlap.
3. **Content not full-width** — `<Header>` uses `max-w-7xl`, constraining width, while sidebar layout expects edge-to-edge content.

## Root Cause

`ProjectScaffolder.generateRootLayout()` always injects `<Header>` and `<Footer>` into `app/layout.tsx` (wrapped in `ShowWhenNotAuthRoute`). This works for `header` nav type but breaks `sidebar` because app pages get both the global Header/Footer AND the group-level Sidebar.

## Design

### Layout responsibility shift

When any plan group uses `sidebar` layout, move Header and Footer out of root layout and into group layouts:

| Layout file | `header` nav type (current, unchanged) | `sidebar` nav type (new) |
|---|---|---|
| `app/layout.tsx` | Header + Footer (wrapped in ShowWhenNotAuthRoute) | Clean shell: `<html><body>{children}</body></html>` |
| `app/(public)/layout.tsx` | `<main>` with max-w-7xl | Header + `<main>` with max-w-7xl + Footer |
| `app/(app)/layout.tsx` | `<main>` with max-w-7xl | SidebarProvider + AppSidebar + SidebarInset (with breadcrumbs top bar + mini footer inside) |
| `app/(auth)/layout.tsx` | Centered, no nav | Centered, no nav (unchanged) |

### `(app)/layout.tsx` structure for sidebar

```tsx
import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">Dashboard</span>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground">
          © 2026 My App
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

The breadcrumb text is static in the layout. Individual pages can override it via metadata or a context provider in a future iteration.

### `(public)/layout.tsx` structure for sidebar

```tsx
import { Header } from '@/components/shared/header'
import { Footer } from '@/components/shared/footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      <Footer />
    </>
  )
}
```

### AppSidebar — logo placement

`generateSharedSidebarCode` already renders app name in `SidebarHeader`. No change needed.

### `coherent fix` support

`coherent fix` Step 4b already calls `ensurePlanGroupLayouts`. It will generate the updated sidebar layout when the plan has `app:sidebar`. Additionally, when sidebar is detected, `coherent fix` should strip Header/Footer from root layout if present.

## Changes by file

### `packages/cli/src/commands/chat/code-generator.ts`

1. **`buildAppLayoutCode(navType)`** — update the `sidebar`/`both` branch to include breadcrumbs top bar and mini footer inside `SidebarInset`.

2. **`buildGroupLayoutCode(layout, pages)`** — same change for `sidebar`/`both` branch.

3. **`regenerateLayout()`** — when effective nav type is `sidebar`, skip `integrateSharedLayoutIntoRootLayout` (which injects Header/Footer into root layout). Instead, ensure `(public)` layout has Header + Footer.

### `packages/core/src/generators/ProjectScaffolder.ts`

4. **`generateRootLayout()`** — when `navType === 'sidebar'`, do NOT call `integrateSharedLayoutIntoRootLayout`. Still generate Header and Footer shared components (they're needed for public pages), but don't inject them into root layout.

### `packages/cli/src/commands/chat/code-generator.ts`

5. **`ensureAppRouteGroupLayout()`** — when writing `(public)` group layout and sidebar is active, wrap children with Header + Footer.

### `packages/cli/src/commands/fix.ts`

6. **Step 4b** — when plan has sidebar, check if root layout contains `<Header` or `<Footer` and strip them if so.

### `packages/cli/src/utils/auth-route-group.ts`

7. **`ensureAuthRouteGroup()`** — when sidebar layout is active, skip the ShowWhenNotAuthRoute wrapping (Header/Footer won't be in root layout).

## What does NOT change

- `generateSharedSidebarCode()` — already has logo in SidebarHeader
- `generateInitialHeaderCode()` / `generateInitialFooterCode()` — still generated as shared components for use in `(public)` layout
- Auth layout — stays centered, no nav
- `header` nav type behavior — completely unchanged

## Testing

- Unit test: `buildAppLayoutCode('sidebar')` output contains `SidebarTrigger`, `Separator`, `footer`, does NOT contain `max-w-7xl`
- Unit test: `buildAppLayoutCode('header')` output unchanged
- Integration: `coherent chat` with sidebar plan produces correct layout hierarchy
- Integration: `coherent fix` on existing project with sidebar strips root Header/Footer and generates correct group layouts
