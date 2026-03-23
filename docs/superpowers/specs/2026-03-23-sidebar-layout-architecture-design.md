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
| `app/layout.tsx` | Header + Footer (wrapped in ShowWhenNotAuthRoute) | Clean shell: `<html><body>{children}</body></html>` + DS button |
| `app/(public)/layout.tsx` | `<main>` with max-w-7xl | Header + `<main>` with max-w-7xl + Footer |
| `app/(app)/layout.tsx` | `<main>` with max-w-7xl | SidebarProvider + AppSidebar + SidebarInset (with breadcrumbs top bar + mini footer inside) |
| `app/(auth)/layout.tsx` | Centered, no nav | Centered, no nav (unchanged) |

### `(app)/layout.tsx` structure for sidebar

```tsx
'use client'

import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/shared/theme-toggle'

function getBreadcrumb(pathname: string): string {
  const segments = pathname.replace(/^\//, '').split('/')
  const page = segments[0] || 'dashboard'
  return page.charAt(0).toUpperCase() + page.slice(1)
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <span className="text-sm text-muted-foreground">{getBreadcrumb(pathname)}</span>
          </div>
          <ThemeToggle />
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

Key differences from v1:
- **`'use client'`** directive — required for `usePathname()`.
- **Dynamic breadcrumb** — derives page name from `usePathname()` instead of hardcoded text. Capitalizes first segment (e.g., `/tasks/123` → "Tasks").
- **ThemeToggle** in top bar — extracted from Header into a separate shared component `theme-toggle.tsx`, rendered on the right side of the top bar. Available on all pages.

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

### Layout type `both`

`both` is treated identically to `sidebar` in all layout generation. The `(app)` layout gets the sidebar+breadcrumbs pattern. The `(public)` layout gets Header+Footer. No separate handling for `both`.

### Design System button

The floating "Design System" link (`/design-system`) currently lives inside `<Header>`. When sidebar is active, Header is only on public pages — the DS button would disappear from app pages.

Fix: move the DS button to the root layout `app/layout.tsx`. It's a fixed-position element (`fixed bottom-4 right-4 z-50`) so it works regardless of where it's rendered in the component tree. Root layout is always present.

### ThemeToggle extraction

Currently `ThemeToggle` is an inline function inside `components/shared/header.tsx`. Extract it to `components/shared/theme-toggle.tsx` as a standalone shared component so it can be imported by both Header (for public pages) and the app layout top bar (for sidebar pages).

### `ShowWhenNotAuthRoute` removal

When sidebar layout is active:
- Header and Footer are in `(public)/layout.tsx`, not root layout.
- Auth pages are in `(auth)` group and never see Header/Footer.
- `ShowWhenNotAuthRoute` wrapper in root layout is unnecessary.

When generating root layout for sidebar:
- Do NOT generate `ShowWhenNotAuthRoute` component.
- Do NOT import or wrap anything with it.

When `header` layout is active: behavior unchanged — `ShowWhenNotAuthRoute` still used in root layout.

### `coherent fix` support

`coherent fix` Step 4b already calls `ensurePlanGroupLayouts`. Additional behavior when sidebar is detected:

1. **Strip Header/Footer from root layout** — regex-based removal of `<Header />`, `<Footer />`, `<ShowWhenNotAuthRoute>` wrappers, and their imports from `app/layout.tsx`.
2. **Ensure `(public)` layout has Header+Footer** — if `(public)/layout.tsx` exists but lacks Header/Footer imports, rewrite it.
3. **Install required shadcn components** — `separator` and `breadcrumb` must be installed for the top bar.

### Migration algorithm for existing projects

When `coherent fix` detects `app:sidebar` in the plan and root layout contains `<Header`:

1. Read `app/layout.tsx`
2. Remove lines matching: `import.*Header`, `import.*Footer`, `import.*ShowWhenNotAuthRoute`, `<Header`, `<Footer`, `<ShowWhenNotAuthRoute`, `</ShowWhenNotAuthRoute>`
3. Write cleaned root layout
4. If `(public)/layout.tsx` lacks Header/Footer, regenerate it with the public layout template
5. Regenerate `(app)/layout.tsx` with the sidebar template

### Required shadcn components

The sidebar top bar requires these shadcn components (auto-installed by `coherent fix`):

- `separator` — vertical divider between SidebarTrigger and breadcrumb
- `breadcrumb` — breadcrumb components (optional, for future multi-level breadcrumbs)
- `sidebar` — already required and installed

## Changes by file

### `packages/cli/src/commands/chat/code-generator.ts`

1. **`buildAppLayoutCode(navType)`** — update the `sidebar`/`both` branch to include `'use client'`, `usePathname`-based breadcrumbs, `ThemeToggle`, and mini footer inside `SidebarInset`.

2. **`buildGroupLayoutCode(layout, pages)`** — same change for `sidebar`/`both` branch.

3. **New: `buildPublicLayoutCodeForSidebar()`** — generates `(public)` layout with Header + Footer + max-w-7xl.

4. **`regenerateLayout()`** — when effective nav type is `sidebar`:
   - Skip `integrateSharedLayoutIntoRootLayout` (don't inject Header/Footer into root layout).
   - Skip `ensureAuthRouteGroup` (no ShowWhenNotAuthRoute needed).
   - Ensure `(public)` layout has Header + Footer.
   - Move DS button to root layout.

### `packages/core/src/generators/ProjectScaffolder.ts`

5. **`generateRootLayout()`** — when `navType === 'sidebar'`:
   - Do NOT call `integrateSharedLayoutIntoRootLayout`.
   - Still generate Header, Footer, ThemeToggle as shared components.
   - Add DS button directly to root layout body.

### `packages/core/src/generators/PageGenerator.ts`

6. **New: `generateThemeToggleCode()`** — extracted ThemeToggle component code.

### `packages/cli/src/commands/fix.ts`

7. **Step 4b enhancement** — when plan has sidebar:
   - Strip Header/Footer/ShowWhenNotAuthRoute from root layout.
   - Ensure `(public)` layout has Header + Footer.
   - Install `separator` component if missing.

### `packages/cli/src/utils/auth-route-group.ts`

8. **`ensureAuthRouteGroup()`** — accept optional `skipWhenSidebar` flag. When sidebar layout is active, skip the ShowWhenNotAuthRoute wrapping.

## What does NOT change

- `generateSharedSidebarCode()` — already has logo in SidebarHeader
- `generateInitialHeaderCode()` / `generateInitialFooterCode()` — still generated as shared components for use in `(public)` layout
- Auth layout — stays centered, no nav
- `header` nav type behavior — completely unchanged

## Testing

- Unit test: `buildAppLayoutCode('sidebar')` output contains `SidebarTrigger`, `Separator`, `ThemeToggle`, `usePathname`, `getBreadcrumb`, `footer`, does NOT contain `max-w-7xl`
- Unit test: `buildAppLayoutCode('header')` output unchanged
- Unit test: `buildPublicLayoutCodeForSidebar()` output contains `Header`, `Footer`, `max-w-7xl`
- Unit test: ThemeToggle extraction — `generateThemeToggleCode()` returns valid component
- Integration: `coherent chat` with sidebar plan produces correct layout hierarchy
- Integration: `coherent fix` on existing project with sidebar strips root Header/Footer, migrates to group layouts
- Integration: DS button visible on all pages including app pages with sidebar
