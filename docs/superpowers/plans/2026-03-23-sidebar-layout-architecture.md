# Sidebar Layout Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix sidebar layout so Header/Footer are per-group (not global), with breadcrumbs top bar in app pages and proper active link highlighting.

**Architecture:** Move Header/Footer from root layout into group layouts. When `sidebar` nav type is active, root layout becomes a clean shell. `(public)` gets Header+Footer, `(app)` gets Sidebar+SidebarInset with breadcrumbs top bar, ThemeToggle, and mini footer. `isActive` in sidebar uses `startsWith` for nested route support.

**Tech Stack:** TypeScript, Next.js App Router, shadcn/ui Sidebar, vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/cli/src/commands/chat/code-generator.ts` | `buildAppLayoutCode`, `buildGroupLayoutCode`, `buildPublicLayoutCodeForSidebar`, `regenerateLayout` |
| Modify | `packages/core/src/generators/PageGenerator.ts` | `generateSharedSidebarCode` isActive fix, body classes, `generateThemeToggleCode` |
| Modify | `packages/core/src/generators/ProjectScaffolder.ts` | `generateRootLayout` sidebar-aware |
| Modify | `packages/cli/src/commands/fix.ts` | Step 4b sidebar migration |
| Modify | `packages/cli/src/commands/export.ts` | DS button cleanup from root layout |
| Modify | `packages/cli/src/utils/auth-route-group.ts` | Skip wrapping when sidebar |
| Create | `packages/cli/src/commands/chat/code-generator.test.ts` | Tests for layout code builders |
| Modify | `packages/core/src/generators/PageGenerator.test.ts` | Tests for sidebar isActive, body classes |

---

### Task 1: Fix sidebar `isActive` to use `startsWith`

**Files:**
- Modify: `packages/core/src/generators/PageGenerator.ts:1021`
- Modify: `packages/core/src/generators/PageGenerator.test.ts`

- [ ] **Step 1: Write failing test**

In `PageGenerator.test.ts`, add test:
```typescript
it('sidebar isActive uses startsWith for nested route support', () => {
  const config = createMinimalConfig({ navigation: { enabled: true, type: 'sidebar', items: [{ route: '/tasks', label: 'Tasks' }] } })
  const generator = new PageGenerator(config)
  const code = generator.generateSharedSidebarCode()
  expect(code).toContain('pathname?.startsWith("/tasks")')
  expect(code).not.toContain('pathname === "/tasks"')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/core test -- --run PageGenerator`
Expected: FAIL — code currently contains `pathname === "/tasks"`

- [ ] **Step 3: Write minimal implementation**

In `PageGenerator.ts`, change the `menuItem` lambda (around line 1021):
```typescript
// Old:
isActive={pathname === "${item.route}"}
// New:
isActive={pathname?.startsWith("${item.route}")}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @getcoherent/core test -- --run PageGenerator`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/generators/PageGenerator.ts packages/core/src/generators/PageGenerator.test.ts
git commit -m "fix: sidebar isActive uses startsWith for nested route support"
```

---

### Task 2: Update `buildAppLayoutCode` for sidebar with breadcrumbs + mini footer

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts:257-305`
- Create: `packages/cli/src/commands/chat/code-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `code-generator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildAppLayoutCode } from './code-generator.js'

describe('buildAppLayoutCode', () => {
  it('sidebar layout includes SidebarTrigger and breadcrumbs', () => {
    const code = buildAppLayoutCode('sidebar', 'TestApp')
    expect(code).toContain('SidebarTrigger')
    expect(code).toContain('getBreadcrumb')
    expect(code).toContain('usePathname')
    expect(code).toContain("'use client'")
  })

  it('sidebar layout includes ThemeToggle', () => {
    const code = buildAppLayoutCode('sidebar', 'TestApp')
    expect(code).toContain('ThemeToggle')
    expect(code).toContain('@/components/shared/theme-toggle')
  })

  it('sidebar layout includes mini footer with app name', () => {
    const code = buildAppLayoutCode('sidebar', 'TestApp')
    expect(code).toContain('TestApp')
    expect(code).toContain('<footer')
    expect(code).toContain('border-t')
  })

  it('sidebar layout does NOT contain max-w-7xl', () => {
    const code = buildAppLayoutCode('sidebar', 'TestApp')
    expect(code).not.toContain('max-w-7xl')
  })

  it('sidebar layout includes Separator', () => {
    const code = buildAppLayoutCode('sidebar', 'TestApp')
    expect(code).toContain('Separator')
    expect(code).toContain('@/components/ui/separator')
  })

  it('header layout is unchanged (no SidebarTrigger)', () => {
    const code = buildAppLayoutCode('header')
    expect(code).not.toContain('SidebarTrigger')
    expect(code).toContain('max-w-7xl')
  })

  it('both layout is treated as sidebar', () => {
    const code = buildAppLayoutCode('both', 'TestApp')
    expect(code).toContain('SidebarTrigger')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @getcoherent/cli test -- --run code-generator`
Expected: FAIL — sidebar branch lacks breadcrumbs, ThemeToggle, mini footer

- [ ] **Step 3: Write implementation**

Update `buildAppLayoutCode` in `code-generator.ts`. The `hasSidebar` branch becomes:
```typescript
if (hasSidebar) {
  return `'use client'

import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/shared/theme-toggle'

function getBreadcrumb(pathname: string): string {
  const segments = pathname.replace(/^\\//, '').split('/')
  const page = segments[0] || 'dashboard'
  return page.charAt(0).toUpperCase() + page.slice(1)
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
          © ${new Date().getFullYear()} ${appName || 'My App'}
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
`
}
```

Also update function signature: `buildAppLayoutCode(navType?: string, appName?: string)`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run code-generator`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts packages/cli/src/commands/chat/code-generator.test.ts
git commit -m "feat: sidebar layout with breadcrumbs, ThemeToggle, mini footer"
```

---

### Task 3: Add `buildPublicLayoutCodeForSidebar` function

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts`
- Modify: `packages/cli/src/commands/chat/code-generator.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('buildPublicLayoutCodeForSidebar', () => {
  it('includes Header and Footer imports', () => {
    const code = buildPublicLayoutCodeForSidebar()
    expect(code).toContain("import { Header } from '@/components/shared/header'")
    expect(code).toContain("import { Footer } from '@/components/shared/footer'")
  })

  it('includes max-w-7xl content wrapper', () => {
    const code = buildPublicLayoutCodeForSidebar()
    expect(code).toContain('max-w-7xl')
  })

  it('renders Header before main and Footer after', () => {
    const code = buildPublicLayoutCodeForSidebar()
    const headerIdx = code.indexOf('<Header')
    const mainIdx = code.indexOf('<main')
    const footerIdx = code.indexOf('<Footer')
    expect(headerIdx).toBeLessThan(mainIdx)
    expect(mainIdx).toBeLessThan(footerIdx)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @getcoherent/cli test -- --run code-generator`
Expected: FAIL — function does not exist

- [ ] **Step 3: Write implementation**

Add to `code-generator.ts`:
```typescript
export function buildPublicLayoutCodeForSidebar(): string {
  return `import { Header } from '@/components/shared/header'
import { Footer } from '@/components/shared/footer'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @getcoherent/cli test -- --run code-generator`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts packages/cli/src/commands/chat/code-generator.test.ts
git commit -m "feat: add buildPublicLayoutCodeForSidebar for sidebar projects"
```

---

### Task 4: Update `regenerateLayout` to skip Header/Footer injection for sidebar

**Files:**
- Modify: `packages/cli/src/commands/chat/code-generator.ts` (regenerateLayout function)

- [ ] **Step 1: Read current regenerateLayout to understand the flow**

Check lines around `integrateSharedLayoutIntoRootLayout` and `ensureAuthRouteGroup` calls.

- [ ] **Step 2: Add sidebar guard**

Before the `integrateSharedLayoutIntoRootLayout` call, add:
```typescript
const hasSidebar = effectiveNavType === 'sidebar' || effectiveNavType === 'both'

if (!hasSidebar) {
  await integrateSharedLayoutIntoRootLayout(projectRoot)
  await ensureAuthRouteGroup(projectRoot)
}
```

When sidebar IS active, instead ensure public layout has Header+Footer:
```typescript
if (hasSidebar) {
  const publicLayoutPath = resolve(projectRoot, 'app', '(public)', 'layout.tsx')
  const publicCode = buildPublicLayoutCodeForSidebar()
  await mkdir(resolve(projectRoot, 'app', '(public)'), { recursive: true })
  await writeFile(publicLayoutPath, publicCode)
}
```

- [ ] **Step 3: Build and run all tests**

Run: `pnpm build && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/code-generator.ts
git commit -m "feat: regenerateLayout skips Header/Footer injection for sidebar"
```

---

### Task 5: Update `ProjectScaffolder.generateRootLayout` for sidebar

**Files:**
- Modify: `packages/core/src/generators/ProjectScaffolder.ts`
- Modify: `packages/core/src/generators/PageGenerator.ts` (body classes)

- [ ] **Step 1: Update ProjectScaffolder**

In `generateRootLayout()`, after generating shared components:
```typescript
if (navType === 'sidebar' || navType === 'both') {
  // Don't inject Header/Footer into root layout
  // They'll be in group layouts
} else {
  await integrateSharedLayoutIntoRootLayout(this.projectRoot)
}
```

- [ ] **Step 2: Update body classes in PageGenerator.generateLayout**

Find where body classes are emitted (`min-h-screen flex flex-col`). Add a parameter or check nav type. When sidebar: use `min-h-svh` without `flex flex-col`.

- [ ] **Step 3: Build and run all tests**

Run: `pnpm build && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/generators/ProjectScaffolder.ts packages/core/src/generators/PageGenerator.ts
git commit -m "feat: ProjectScaffolder sidebar-aware root layout generation"
```

---

### Task 6: Update `coherent fix` Step 4b for sidebar migration

**Files:**
- Modify: `packages/cli/src/commands/fix.ts`

- [ ] **Step 1: Add migration logic after ensurePlanGroupLayouts**

When plan has sidebar group:
```typescript
const hasSidebar = plan.groups.some(g => g.layout === 'sidebar' || g.layout === 'both')
if (hasSidebar && !dryRun) {
  // Strip Header/Footer from root layout
  const rootLayoutPath = resolve(projectRoot, 'app', 'layout.tsx')
  if (existsSync(rootLayoutPath)) {
    let rootCode = readFileSync(rootLayoutPath, 'utf-8')
    if (rootCode.includes('<Header')) {
      rootCode = rootCode
        .replace(/import\s*\{[^}]*Header[^}]*\}[^;\n]*[;\n]?\s*/g, '')
        .replace(/import\s*\{[^}]*Footer[^}]*\}[^;\n]*[;\n]?\s*/g, '')
        .replace(/import\s+ShowWhenNotAuthRoute[^;\n]*[;\n]?\s*/g, '')
        .replace(/<ShowWhenNotAuthRoute>[\s\S]*?<\/ShowWhenNotAuthRoute>/g, '')
        .replace(/\s*<Header\s*\/>\s*/g, '')
        .replace(/\s*<Footer\s*\/>\s*/g, '')
      // Fix body classes
      rootCode = rootCode.replace('min-h-screen flex flex-col', 'min-h-svh')
      writeFileSync(rootLayoutPath, rootCode, 'utf-8')
      fixes.push('Stripped Header/Footer from root layout (sidebar mode)')
      console.log(chalk.green('  ✔ Stripped Header/Footer from root layout (sidebar mode)'))
    }
  }

  // Ensure (public) layout has Header+Footer
  const publicLayoutPath = resolve(projectRoot, 'app', '(public)', 'layout.tsx')
  if (existsSync(publicLayoutPath)) {
    const publicCode = readFileSync(publicLayoutPath, 'utf-8')
    if (!publicCode.includes('<Header')) {
      const { buildPublicLayoutCodeForSidebar } = await import('./chat/code-generator.js')
      writeFileSync(publicLayoutPath, buildPublicLayoutCodeForSidebar(), 'utf-8')
      fixes.push('Added Header/Footer to (public) layout')
      console.log(chalk.green('  ✔ Added Header/Footer to (public) layout'))
    }
  }

  // Install separator if missing
  // (handled by existing component installation logic)
}
```

- [ ] **Step 2: Build and run all tests**

Run: `pnpm build && pnpm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/fix.ts
git commit -m "feat: coherent fix migrates root layout for sidebar projects"
```

---

### Task 7: Update `coherent export` and `ensureAuthRouteGroup`

**Files:**
- Modify: `packages/cli/src/commands/export.ts`
- Modify: `packages/cli/src/utils/auth-route-group.ts`

- [ ] **Step 1: Update export.ts**

Add DS FAB cleanup from root layout (not just Header):
```typescript
// Clean root layout — remove Design System FAB link
const rootLayoutPath = resolve(outDir, 'app', 'layout.tsx')
if (existsSync(rootLayoutPath)) {
  let rootLayout = readFileSync(rootLayoutPath, 'utf-8')
  rootLayout = rootLayout.replace(/<Link\s[^>]*href="\/design-system"[^>]*>[\s\S]*?<\/Link>/g, '')
  writeFileSync(rootLayoutPath, rootLayout, 'utf-8')
}
```

- [ ] **Step 2: Update auth-route-group.ts**

Add sidebar check at the beginning of `ensureAuthRouteGroup`:
```typescript
export async function ensureAuthRouteGroup(projectRoot: string, skipWhenSidebar = false): Promise<void> {
  if (skipWhenSidebar) return
  // ... existing logic
}
```

- [ ] **Step 3: Build and run all tests**

Run: `pnpm build && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/export.ts packages/cli/src/utils/auth-route-group.ts
git commit -m "feat: export cleans DS button from root layout, auth-route-group respects sidebar"
```

---

### Task 8: Final verification and publish

- [ ] **Step 1: Full build + typecheck + test**

```bash
pnpm build && pnpm typecheck && pnpm test
```
Expected: All pass

- [ ] **Step 2: Manual test on test-projector**

```bash
cd ~/test-projector
coherent fix
coherent preview
```
Verify:
- Dashboard loads with sidebar (no duplicate header)
- Footer inside content area (not overlapping sidebar)
- Breadcrumbs show current page name
- ThemeToggle works in top bar
- Tasks page: /tasks/123 highlights Tasks in sidebar
- Landing page: full Header + Footer
- Auth pages: no navigation

- [ ] **Step 3: Bump version, commit, push, publish**

```bash
# In coherent-design-method/
# Bump both packages to next version
pnpm build
git add -A && git commit -m "feat: sidebar layout architecture — breadcrumbs, per-group Header/Footer"
git push
cd packages/core && pnpm publish --access public --no-git-checks
cd ../cli && pnpm publish --access public --no-git-checks
```

- [ ] **Step 4: Install and verify**

```bash
npm cache clean --force && sleep 10
npm install -g @getcoherent/cli@latest
coherent --version
```
