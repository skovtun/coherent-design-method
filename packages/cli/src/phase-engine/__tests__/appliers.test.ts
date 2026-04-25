import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { DesignSystemManager } from '@getcoherent/core'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  createConfigDeltaApplier,
  createComponentsApplier,
  createModificationApplier,
  createPagesApplier,
  createReplaceWelcomeApplier,
  defaultAppliers,
} from '../appliers.js'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { generateWelcomeComponent, WELCOME_MARKER } from '../../utils/welcome-content.js'
import type { ArtifactApplierContext } from '../session-lifecycle.js'
import type { SessionMeta } from '../session-store.js'

async function makeContext(
  projectRoot: string,
  overrides: Partial<ArtifactApplierContext> = {},
): Promise<{ ctx: ArtifactApplierContext; store: InMemorySessionStore; uuid: string }> {
  const store = new InMemorySessionStore()
  const meta = await store.create()
  const ctx: ArtifactApplierContext = {
    projectRoot,
    uuid: meta.uuid,
    sessionDir: join(projectRoot, '.coherent', 'session', meta.uuid),
    store,
    meta: meta as SessionMeta,
    ...overrides,
  }
  return { ctx, store, uuid: meta.uuid }
}

function setupProject(name = 'Test'): string {
  const projectRoot = mkdtempSync(join(tmpdir(), 'coherent-appliers-'))
  const config = createMinimalConfig(name)
  const configContent = `export const config = ${JSON.stringify(config, null, 2)} as const\n`
  writeFileSync(join(projectRoot, 'design-system.config.ts'), configContent)
  return projectRoot
}

describe('createConfigDeltaApplier', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  it('applies name delta to design-system.config.ts', async () => {
    projectRoot = setupProject('OldName')
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(uuid, 'config-delta.json', JSON.stringify({ name: 'NewName' }))

    const applier = createConfigDeltaApplier()
    const results = await applier.apply(ctx)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatch(/name:.*OldName.*NewName/)

    // Re-read the config from disk to confirm it persisted.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    expect(dsm.getConfig().name).toBe('NewName')
  })

  it('applies navigationType delta', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(uuid, 'config-delta.json', JSON.stringify({ navigationType: 'sidebar' }))

    const applier = createConfigDeltaApplier()
    const results = await applier.apply(ctx)

    expect(results).toHaveLength(1)
    expect(results[0]).toMatch(/navigation\.type/)

    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    expect(dsm.getConfig().navigation?.type).toBe('sidebar')
  })

  it('is a no-op when config-delta.json is absent', async () => {
    projectRoot = setupProject()
    const { ctx } = await makeContext(projectRoot)

    const results = await createConfigDeltaApplier().apply(ctx)
    expect(results).toEqual([])
  })

  it('is a no-op when delta fields are already current', async () => {
    projectRoot = setupProject('SameName')
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(uuid, 'config-delta.json', JSON.stringify({ name: 'SameName' }))

    const results = await createConfigDeltaApplier().apply(ctx)
    expect(results).toEqual([])
  })
})

describe('createComponentsApplier', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  it('writes each generated component to components/shared/ and registers it in the manifest', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(
      uuid,
      'components-generated.json',
      JSON.stringify({
        components: [
          { name: 'Hero', code: 'export function Hero(){ return <div/> }', file: 'components/shared/hero.tsx' },
          {
            name: 'PricingTable',
            code: 'export function PricingTable(){ return <div/> }',
            file: 'components/shared/pricing-table.tsx',
          },
        ],
      }),
    )

    const results = await createComponentsApplier().apply(ctx)

    expect(results).toHaveLength(2)
    expect(existsSync(join(projectRoot, 'components/shared/hero.tsx'))).toBe(true)
    expect(existsSync(join(projectRoot, 'components/shared/pricing-table.tsx'))).toBe(true)

    // Manifest updated.
    const manifestPath = join(projectRoot, 'coherent.components.json')
    expect(existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    expect(manifest.shared.map((e: { name: string }) => e.name).sort()).toEqual(['Hero', 'PricingTable'])
  })

  it('is a no-op when components-generated.json is absent', async () => {
    projectRoot = setupProject()
    const { ctx } = await makeContext(projectRoot)
    expect(await createComponentsApplier().apply(ctx)).toEqual([])
  })

  it('is a no-op when components list is empty', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(uuid, 'components-generated.json', JSON.stringify({ components: [] }))
    expect(await createComponentsApplier().apply(ctx)).toEqual([])
  })

  it('runs autoFixCode on component source before writing (codex R3 P2 #9)', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    // Raw Tailwind colors inside a component — same generation mistake
    // autoFix already handles for pages. Should be rewritten to semantic
    // tokens before the component lands on disk.
    await store.writeArtifact(
      uuid,
      'components-generated.json',
      JSON.stringify({
        components: [
          {
            name: 'Hero',
            code: `export function Hero(){ return <div className="bg-gray-100 text-blue-600">Hi</div> }`,
            file: 'components/shared/hero.tsx',
          },
        ],
      }),
    )

    const results = await createComponentsApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatch(/auto-fix/)

    const written = readFileSync(join(projectRoot, 'components/shared/hero.tsx'), 'utf-8')
    expect(written).not.toContain('bg-gray-100')
    expect(written).not.toContain('text-blue-600')
  })

  it('skips entries with empty code', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(
      uuid,
      'components-generated.json',
      JSON.stringify({
        components: [
          { name: 'Hero', code: '', file: 'components/shared/hero.tsx' },
          { name: 'Valid', code: 'export function Valid(){}', file: 'components/shared/valid.tsx' },
        ],
      }),
    )
    const results = await createComponentsApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(existsSync(join(projectRoot, 'components/shared/valid.tsx'))).toBe(true)
    expect(existsSync(join(projectRoot, 'components/shared/hero.tsx'))).toBe(false)
  })
})

describe('createPagesApplier', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  async function writePageArtifact(
    store: InMemorySessionStore,
    uuid: string,
    page: {
      id: string
      name: string
      route: string
      pageType: 'marketing' | 'app' | 'auth'
      pageCode: string | null
    },
  ) {
    const request =
      page.pageCode === null
        ? null
        : {
            type: 'add-page' as const,
            target: page.id,
            changes: { id: page.id, name: page.name, route: page.route, pageCode: page.pageCode },
          }
    await store.writeArtifact(
      uuid,
      `page-${page.id}.json`,
      JSON.stringify({
        id: page.id,
        name: page.name,
        route: page.route,
        pageType: page.pageType,
        request,
      }),
    )
  }

  it('writes each page to its route-group fs path and registers it in DSM', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'home',
      name: 'Home',
      route: '/',
      pageType: 'marketing',
      pageCode: 'export default function Home(){ return <main>Welcome</main> }',
    })
    await writePageArtifact(store, uuid, {
      id: 'leads',
      name: 'Leads',
      route: '/leads',
      pageType: 'app',
      pageCode: 'export default function Leads(){ return <main>Leads</main> }',
    })
    await writePageArtifact(store, uuid, {
      id: 'login',
      name: 'Login',
      route: '/login',
      pageType: 'auth',
      pageCode: 'export default function Login(){ return <main>Login</main> }',
    })

    const results = await createPagesApplier().apply(ctx)
    expect(results).toHaveLength(3)

    // Marketing route → app/
    expect(existsSync(join(projectRoot, 'app/page.tsx'))).toBe(true)
    // App route → (app)/
    expect(existsSync(join(projectRoot, 'app/(app)/leads/page.tsx'))).toBe(true)
    // Auth route → (auth)/
    expect(existsSync(join(projectRoot, 'app/(auth)/login/page.tsx'))).toBe(true)

    // DSM reflects the pages.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    const pages = dsm.getConfig().pages
    expect(pages.map((p: { id: string }) => p.id).sort()).toEqual(['home', 'leads', 'login'])
  })

  it('skips pages with empty pageCode and reports them in results', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'empty',
      name: 'Empty',
      route: '/empty',
      pageType: 'app',
      pageCode: '',
    })
    await writePageArtifact(store, uuid, {
      id: 'null-req',
      name: 'NullReq',
      route: '/null-req',
      pageType: 'app',
      pageCode: null,
    })

    const results = await createPagesApplier().apply(ctx)
    expect(results).toContain('skipped empty (empty pageCode)')
    expect(results).toContain('skipped null-req (no AI request)')
    expect(existsSync(join(projectRoot, 'app/(app)/empty/page.tsx'))).toBe(false)
  })

  it('is a no-op when no page artifacts exist', async () => {
    projectRoot = setupProject()
    const { ctx } = await makeContext(projectRoot)
    expect(await createPagesApplier().apply(ctx)).toEqual([])
  })

  it('runs autoFixCode on pageCode before writing (codex R2 P2)', async () => {
    // Raw Tailwind colors (`bg-gray-100`, `text-blue-600`) are a known
    // generation mistake the chat rail auto-fixes to semantic tokens. The
    // skill rail must do the same so `coherent check` doesn't immediately
    // flag skill-generated pages as broken on first open.
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    const rawCode = `export default function Home() {
  return <main className="bg-gray-100 text-blue-600">Hello</main>
}`
    await writePageArtifact(store, uuid, {
      id: 'home',
      name: 'Home',
      route: '/',
      pageType: 'marketing',
      pageCode: rawCode,
    })

    const results = await createPagesApplier().apply(ctx)
    expect(results).toHaveLength(1)
    // Applied-list surfaces the auto-fix count so the user sees which pages
    // got corrected.
    expect(results[0]).toMatch(/auto-fix/)

    const written = readFileSync(join(projectRoot, 'app/page.tsx'), 'utf-8')
    // Raw colors rewritten to semantic tokens — same transformation as
    // the chat rail's post-generation pass.
    expect(written).not.toContain('bg-gray-100')
    expect(written).not.toContain('text-blue-600')
    expect(written).toMatch(/bg-muted|bg-background/)
  })

  it('populates sidebar nav.items from generated app pages when navigation.type is sidebar', async () => {
    // The original v0.10 skill-rail bug surfaced by M15: sidebar layout
    // rendered with empty `<SidebarContent />` because nav.items stayed
    // at the init-seed `[{label:'Home', route:'/'}]` and no phase
    // appended generated routes. Pages applier now mirrors API rail's
    // append logic from `commands/chat/split-generator.ts:580`.
    projectRoot = setupProject()
    // Flip nav.type to sidebar (mimics what config-delta applier does
    // earlier in the chain when the plan emits navigationType:'sidebar').
    const dsmPre = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPre.load()
    const cfgPre = dsmPre.getConfig()
    cfgPre.navigation = { ...cfgPre.navigation!, type: 'sidebar' }
    dsmPre.updateConfig(cfgPre)
    await dsmPre.save()

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })
    await writePageArtifact(store, uuid, {
      id: 'transactions',
      name: 'Transactions',
      route: '/transactions',
      pageType: 'app',
      pageCode: 'export default function Transactions(){ return <div /> }',
    })
    // Auth + marketing pages should NOT land in the sidebar — they have
    // their own layout chrome.
    await writePageArtifact(store, uuid, {
      id: 'login',
      name: 'Login',
      route: '/login',
      pageType: 'auth',
      pageCode: 'export default function Login(){ return <div /> }',
    })
    await writePageArtifact(store, uuid, {
      id: 'pricing',
      name: 'Pricing',
      route: '/pricing',
      pageType: 'marketing',
      pageCode: 'export default function Pricing(){ return <div /> }',
    })

    const results = await createPagesApplier().apply(ctx)
    expect(results.some(r => r.startsWith('navigation.items:'))).toBe(true)

    const dsmPost = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPost.load()
    const items = dsmPost.getConfig().navigation?.items ?? []
    const routes = items.map((i: { route: string }) => i.route).sort()
    // Init seed `/` survives (append-only); /login + /pricing filtered out.
    expect(routes).toEqual(['/', '/dashboard', '/transactions'])
  })

  it('does not touch nav.items when navigation.type is header', async () => {
    projectRoot = setupProject()
    // Default nav.type from createMinimalConfig is 'header', no flip needed.
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })

    const results = await createPagesApplier().apply(ctx)
    // No nav.items entry in results.
    expect(results.find(r => r.startsWith('navigation.items:'))).toBeUndefined()

    const dsmPost = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPost.load()
    // Init seed alone — `/` only.
    const items = dsmPost.getConfig().navigation?.items ?? []
    expect(items.map((i: { route: string }) => i.route)).toEqual(['/'])
  })

  it('multi-turn (chat #2) preserves chat #1 sidebar nav.items — v0.11.1 hotfix', async () => {
    // v0.11.0 regression caught by dogfood: the pages applier sourced
    // sidebar routes from `pagesQueue` (current session only). Chat #2's
    // session has just the new page artifact, so existing items got reset
    // to [Home, NewRoute] and chat #1's sidebar entries vanished.
    //
    // Fix: source from `finalConfig.pages` (all registered app pages)
    // filtered by `requiresAuth`. buildSidebarNavItems is append-only +
    // idempotent, so re-running on a project with all entries already in
    // place is a no-op.
    projectRoot = setupProject()

    // Mimic post-chat-#1 state: nav.type=sidebar, config.pages already
    // contains the 4 chat-#1 app routes registered in DSM, but
    // navigation.items was NOT populated by the (broken) v0.11.0 applier.
    const dsmPre = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPre.load()
    const cfgPre = dsmPre.getConfig()
    const now = new Date().toISOString()
    cfgPre.navigation = { ...cfgPre.navigation!, type: 'sidebar' }
    cfgPre.pages = [
      ...cfgPre.pages,
      // Chat #1 app pages — registered via earlier (broken) applier run
      // that never added them to nav.items.
      {
        id: 'dashboard',
        name: 'Dashboard',
        route: '/dashboard',
        layout: 'centered',
        sections: [],
        title: 'Dashboard',
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'transactions',
        name: 'Transactions',
        route: '/transactions',
        layout: 'centered',
        sections: [],
        title: 'Transactions',
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'settings',
        name: 'Settings',
        route: '/settings',
        layout: 'centered',
        sections: [],
        title: 'Settings',
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'profile',
        name: 'Profile',
        route: '/profile',
        layout: 'centered',
        sections: [],
        title: 'Profile',
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
    ]
    dsmPre.updateConfig(cfgPre)
    await dsmPre.save()

    // Chat #2's session has only ONE page artifact (the new /reports).
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'reports',
      name: 'Reports',
      route: '/reports',
      pageType: 'app',
      pageCode: 'export default function Reports(){ return <div /> }',
    })

    await createPagesApplier().apply(ctx)

    const dsmPost = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPost.load()
    const items = dsmPost.getConfig().navigation?.items ?? []
    const routes = items.map((i: { route: string }) => i.route).sort()

    // CRITICAL: ALL 4 chat-#1 app routes + the new /reports must be in
    // sidebar items, plus the init-seeded `/` Home (append-only preserved).
    // v0.11.0 would have produced ['/', '/reports'] only — this test
    // would have caught the bug before ship.
    expect(routes).toEqual(['/', '/dashboard', '/profile', '/reports', '/settings', '/transactions'])
  })

  it('multi-turn idempotency — re-running on a fully-populated project is a no-op', async () => {
    // Defensive: if nav.items already contains every registered app
    // route, the applier should not re-add or reorder anything.
    projectRoot = setupProject()
    const dsmPre = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPre.load()
    const cfgPre = dsmPre.getConfig()
    const now = new Date().toISOString()
    cfgPre.navigation = {
      ...cfgPre.navigation!,
      type: 'sidebar',
      items: [
        { label: 'Home', route: '/', requiresAuth: false, order: 0 },
        { label: 'Dashboard', route: '/dashboard', requiresAuth: true, order: 1 },
      ],
    }
    cfgPre.pages = [
      ...cfgPre.pages,
      {
        id: 'dashboard',
        name: 'Dashboard',
        route: '/dashboard',
        layout: 'centered',
        sections: [],
        title: 'Dashboard',
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      },
    ]
    dsmPre.updateConfig(cfgPre)
    await dsmPre.save()

    // Empty session — no new pages.
    const { ctx } = await makeContext(projectRoot)
    const results = await createPagesApplier().apply(ctx)
    // No "navigation.items: +N" line in results — nothing changed.
    expect(results.find(r => r.startsWith('navigation.items:'))).toBeUndefined()

    const dsmPost = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPost.load()
    const items = dsmPost.getConfig().navigation?.items ?? []
    expect(items.map((i: { route: string }) => i.route).sort()).toEqual(['/', '/dashboard'])
  })

  it('multi-turn self-heals dropped chat-#1 items on next chat — v0.11.1', async () => {
    // Models the exact in-the-wild state after the v0.11.0 dogfood bug:
    // config.pages has all chat-#1 routes + chat-#2's /reports, but
    // nav.items contains only [Home, Reports]. The next chat (here:
    // chat-#3 adds /audit) runs the pages applier with at least one page
    // artifact, which triggers the nav.items rebuild from finalConfig.pages
    // and recovers the dropped routes.
    //
    // (No-artifact backfill — running the applier on an empty session —
    // is intentionally skipped; the applier short-circuits on
    // pageFiles.length===0. That backfill case is covered by
    // `coherent update` Step 9.)
    projectRoot = setupProject()
    const dsmPre = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPre.load()
    const cfgPre = dsmPre.getConfig()
    const now = new Date().toISOString()
    cfgPre.navigation = {
      ...cfgPre.navigation!,
      type: 'sidebar',
      // The broken state: Home + Reports only, missing chat-#1 routes.
      items: [
        { label: 'Home', route: '/', requiresAuth: false, order: 0 },
        { label: 'Reports', route: '/reports', requiresAuth: true, order: 1 },
      ],
    }
    cfgPre.pages = [
      ...cfgPre.pages,
      ...[
        ['dashboard', '/dashboard'],
        ['transactions', '/transactions'],
        ['settings', '/settings'],
        ['profile', '/profile'],
        ['reports', '/reports'],
      ].map(([id, route]) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        route,
        layout: 'centered' as const,
        sections: [],
        title: id,
        description: '',
        requiresAuth: true,
        noIndex: false,
        createdAt: now,
        updatedAt: now,
      })),
    ]
    dsmPre.updateConfig(cfgPre)
    await dsmPre.save()

    // Chat #3 adds one new page — applier wakes up, rebuilds items from
    // ALL of finalConfig.pages (including the dropped chat-#1 routes).
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writePageArtifact(store, uuid, {
      id: 'audit',
      name: 'Audit',
      route: '/audit',
      pageType: 'app',
      pageCode: 'export default function Audit(){ return <div /> }',
    })

    await createPagesApplier().apply(ctx)

    const dsmPost = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsmPost.load()
    const items = dsmPost.getConfig().navigation?.items ?? []
    const routes = items.map((i: { route: string }) => i.route).sort()
    // Healed: all 4 chat-#1 routes + /reports + the new /audit, plus init `/`.
    expect(routes).toEqual(['/', '/audit', '/dashboard', '/profile', '/reports', '/settings', '/transactions'])
  })

  it('updates an existing page entry in DSM rather than duplicating', async () => {
    projectRoot = setupProject()
    // createMinimalConfig already includes a 'home' page at '/'. Applying
    // another page artifact for the same id must mutate that entry in place,
    // not append a duplicate.
    const { ctx, store, uuid } = await makeContext(projectRoot)

    const before = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await before.load()
    const beforePages = before.getConfig().pages
    expect(beforePages.filter((p: { id: string }) => p.id === 'home')).toHaveLength(1)

    await writePageArtifact(store, uuid, {
      id: 'home',
      name: 'Home',
      route: '/',
      pageType: 'marketing',
      pageCode: 'export default function Home(){ return <main>Updated</main> }',
    })
    await createPagesApplier().apply(ctx)

    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    const afterPages = after.getConfig().pages
    // Still exactly one home page — updated in place.
    expect(afterPages.filter((p: { id: string }) => p.id === 'home')).toHaveLength(1)
    // And it now carries the generated-with-pageCode flag.
    expect(afterPages.find((p: { id: string }) => p.id === 'home')?.generatedWithPageCode).toBe(true)
  })
})

describe('defaultAppliers', () => {
  it('returns config-delta → modification → components → pages → replace-welcome → layout → fix-globals-css', () => {
    // Ordering matters — see appliers.ts `defaultAppliers` doc:
    //  - modification (v0.11.3) runs BEFORE pages so deletes happen
    //    first; the rename pattern `[delete X, add Y]` ends with only
    //    Y. Also runs the hard-fail guard for AI-dependent types
    //    BEFORE any pages land, killing silent partial-apply.
    //  - replace-welcome runs AFTER pages (sees generated pages on disk
    //    + in artifacts) but BEFORE layout (so sidebar's
    //    app/page.tsx → app/(public)/page.tsx move carries the redirect,
    //    not the welcome scaffold).
    const appliers = defaultAppliers()
    expect(appliers.map(a => a.name)).toEqual([
      'config-delta',
      'modification',
      'components',
      'pages',
      'replace-welcome',
      'layout',
      'fix-globals-css',
    ])
  })
})

describe('createReplaceWelcomeApplier', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  async function writeGeneratedPage(
    store: InMemorySessionStore,
    uuid: string,
    page: {
      id: string
      name: string
      route: string
      pageType: 'marketing' | 'app' | 'auth'
      pageCode: string
    },
  ) {
    const request = {
      type: 'add-page' as const,
      target: page.id,
      changes: { id: page.id, name: page.name, route: page.route, pageCode: page.pageCode },
    }
    await store.writeArtifact(
      uuid,
      `page-${page.id}.json`,
      JSON.stringify({
        id: page.id,
        name: page.name,
        route: page.route,
        pageType: page.pageType,
        request,
      }),
    )
  }

  function writeRoot(root: string, rel: string, content: string): void {
    const abs = resolve(root, rel)
    mkdirSync(resolve(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }

  it('codex P1 #1 — replaces scaffold and picks /dashboard even though config seeds Home at "/"', async () => {
    // The bug this guards: createMinimalConfig seeds a placeholder page
    // {id:'home', route:'/'} into config.pages. If the applier sourced
    // its primary route from config.pages, it would always see `/` first
    // and the replacement would silently no-op. The applier must read
    // generated pages from page-<id>.json artifacts instead.
    projectRoot = setupProject()
    writeRoot(projectRoot, 'app/page.tsx', generateWelcomeComponent('', 'skill'))

    const { ctx, store, uuid } = await makeContext(projectRoot)
    // Only one generated page, /dashboard — no `/` in the AI output.
    await writeGeneratedPage(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toContain('redirect("/dashboard")')

    // app/page.tsx is now a redirect, not the scaffold.
    const after = readFileSync(join(projectRoot, 'app/page.tsx'), 'utf-8')
    expect(after).toContain('redirect("/dashboard")')
    expect(after).toContain(WELCOME_MARKER) // marker preserved on redirect output
    expect(after).not.toContain('useState<Mode>')

    // homePagePlaceholder is flipped to false.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    expect(dsm.getConfig().settings.homePagePlaceholder).toBe(false)
  })

  it('codex P1 #2 — replaces scaffold at app/(public)/page.tsx after sidebar move', async () => {
    // Models the second-chat scenario or a project where regenerateLayout
    // already moved app/page.tsx → app/(public)/page.tsx for sidebar nav.
    // Replace-welcome must rewrite the (public) location, not look only at
    // app/page.tsx and miss the scaffold.
    projectRoot = setupProject()
    writeRoot(projectRoot, 'app/(public)/page.tsx', generateWelcomeComponent('', 'skill'))

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeGeneratedPage(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toContain('app/(public)/page.tsx')
    expect(readFileSync(join(projectRoot, 'app/(public)/page.tsx'), 'utf-8')).toContain('redirect("/dashboard")')

    // No app/page.tsx was created — sidebar layout uses (public)/page.tsx
    // for `/`. Exactly one `/` route handler exists.
    expect(existsSync(join(projectRoot, 'app/page.tsx'))).toBe(false)
  })

  it('is a no-op when homePagePlaceholder is already false', async () => {
    projectRoot = setupProject()
    // Manually flip the flag in the project config.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    const cfg = dsm.getConfig()
    cfg.settings.homePagePlaceholder = false
    dsm.updateConfig(cfg)
    await dsm.save()

    writeRoot(projectRoot, 'app/page.tsx', generateWelcomeComponent('', 'skill'))
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeGeneratedPage(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toEqual([])
    // File untouched.
    expect(readFileSync(join(projectRoot, 'app/page.tsx'), 'utf-8')).toContain('useState<Mode>')
  })

  it('is a no-op when the generated batch produced no usable pages', async () => {
    projectRoot = setupProject()
    writeRoot(projectRoot, 'app/page.tsx', generateWelcomeComponent('', 'skill'))
    // No page-*.json artifacts at all.
    const { ctx } = await makeContext(projectRoot)

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toEqual([])
    // Scaffold preserved.
    expect(readFileSync(join(projectRoot, 'app/page.tsx'), 'utf-8')).toContain('useState<Mode>')
  })

  it('does not trample a user-edited home page', async () => {
    projectRoot = setupProject()
    const userPage = `export default function HomePage(){ return <main>my page</main> }\n`
    writeRoot(projectRoot, 'app/page.tsx', userPage)

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeGeneratedPage(store, uuid, {
      id: 'dashboard',
      name: 'Dashboard',
      route: '/dashboard',
      pageType: 'app',
      pageCode: 'export default function Dashboard(){ return <div /> }',
    })

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toEqual([])
    // User content untouched.
    expect(readFileSync(join(projectRoot, 'app/page.tsx'), 'utf-8')).toBe(userPage)
    // Flag NOT flipped — flip-on-success contract: only flips when we
    // actually replaced a scaffold. User-edited project keeps the flag
    // as-is so future runs can still react if the user reverts.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await dsm.load()
    expect(dsm.getConfig().settings.homePagePlaceholder).toBe(true)
  })

  it('skips pages with empty pageCode when picking the primary route', async () => {
    projectRoot = setupProject()
    writeRoot(projectRoot, 'app/page.tsx', generateWelcomeComponent('', 'skill'))

    const { ctx, store, uuid } = await makeContext(projectRoot)
    // Empty page artifact — should be ignored by the primary picker.
    await writeGeneratedPage(store, uuid, {
      id: 'broken',
      name: 'Broken',
      route: '/broken',
      pageType: 'app',
      pageCode: '',
    })
    await writeGeneratedPage(store, uuid, {
      id: 'settings',
      name: 'Settings',
      route: '/settings',
      pageType: 'app',
      pageCode: 'export default function Settings(){ return <div /> }',
    })

    const results = await createReplaceWelcomeApplier().apply(ctx)
    expect(results).toHaveLength(1)
    // /settings won, /broken was skipped because its pageCode was empty.
    expect(results[0]).toContain('redirect("/settings")')
  })
})

describe('createModificationApplier (v0.11.3)', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
  })

  async function writeRequests(store: InMemorySessionStore, uuid: string, requests: unknown[]): Promise<void> {
    await store.writeArtifact(uuid, 'modification-requests.json', JSON.stringify({ requests }))
  }

  function seedPageInConfig(
    projectRoot: string,
    page: { id: string; name: string; route: string; group?: 'app' | 'auth' | 'public' },
  ): void {
    // Seed an existing page on disk + in DSM. Mirrors a project's
    // post-chat-#1 state: page is registered, file exists, nav has
    // an entry. The test cleans up via tmp dir.
    const dsm = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    return (async () => {
      await dsm.load()
      const cfg = dsm.getConfig()
      const now = new Date().toISOString()
      cfg.pages = [
        ...cfg.pages,
        {
          id: page.id,
          name: page.name,
          route: page.route,
          layout: 'centered',
          sections: [],
          title: page.name,
          description: '',
          requiresAuth: page.group !== 'public',
          noIndex: false,
          createdAt: now,
          updatedAt: now,
        },
      ]
      cfg.navigation = {
        ...cfg.navigation!,
        items: [
          ...(cfg.navigation?.items ?? []),
          { label: page.name, route: page.route, requiresAuth: true, order: cfg.navigation?.items?.length ?? 1 },
        ],
      }
      dsm.updateConfig(cfg)
      await dsm.save()

      // Page file on disk under the matching route group.
      const groupSlug = page.group === 'auth' ? '(auth)' : page.group === 'public' ? '' : '(app)'
      const slug = page.route.replace(/^\//, '')
      const baseSegments = groupSlug ? ['app', groupSlug, slug] : ['app', slug]
      const dir = join(projectRoot, ...baseSegments)
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'page.tsx'),
        `export default function ${page.name}(){ return <div>${page.name}</div> }\n`,
        'utf-8',
      )
    })() as unknown as void
  }

  it('is a no-op when modification-requests.json is absent', async () => {
    projectRoot = setupProject()
    const { ctx } = await makeContext(projectRoot)
    expect(await createModificationApplier().apply(ctx)).toEqual([])
  })

  it('is a no-op when artifact contains only add-page (deferred to pages applier)', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [
      {
        type: 'add-page',
        target: 'new',
        changes: { id: 'reports', name: 'Reports', route: '/reports' },
      },
    ])
    const results = await createModificationApplier().apply(ctx)
    expect(results).toEqual([])
  })

  it('delete-page: removes file, drops from config.pages and nav.items', async () => {
    projectRoot = setupProject()
    await seedPageInConfig(projectRoot, { id: 'transactions', name: 'Transactions', route: '/transactions' })
    // Confirm setup landed.
    const beforePagePath = join(projectRoot, 'app', '(app)', 'transactions', 'page.tsx')
    expect(existsSync(beforePagePath)).toBe(true)

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [{ type: 'delete-page', target: 'transactions' }])
    const results = await createModificationApplier().apply(ctx)

    expect(results).toHaveLength(1)
    expect(results[0]).toContain('delete-page: Transactions')
    expect(existsSync(beforePagePath)).toBe(false)

    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    const cfg = after.getConfig()
    expect(cfg.pages.find(p => p.id === 'transactions')).toBeUndefined()
    expect(cfg.navigation?.items?.find(i => i.route === '/transactions')).toBeUndefined()
  })

  it('delete-page: refuses to delete the root page "/"', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    // The init seed already includes a Home page at "/".
    await writeRequests(store, uuid, [{ type: 'delete-page', target: '/' }])
    const results = await createModificationApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toContain('refusing to delete root page')

    // Seeded Home is still in config.
    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    expect(after.getConfig().pages.find(p => p.route === '/')).toBeDefined()
  })

  it('delete-page: clear error when target does not exist', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [{ type: 'delete-page', target: 'nonexistent' }])
    const results = await createModificationApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toContain('no match for "nonexistent"')
  })

  it('delete-component: removes file + manifest entry', async () => {
    projectRoot = setupProject()
    // Seed a shared component file + manifest entry.
    const sharedDir = join(projectRoot, 'components', 'shared')
    mkdirSync(sharedDir, { recursive: true })
    writeFileSync(join(sharedDir, 'feature-card.tsx'), 'export function FeatureCard(){ return <div /> }', 'utf-8')
    writeFileSync(
      join(projectRoot, 'coherent.components.json'),
      JSON.stringify(
        {
          shared: [
            {
              id: 'CID-009',
              name: 'FeatureCard',
              type: 'widget',
              file: 'components/shared/feature-card.tsx',
              usedIn: [],
              createdAt: new Date().toISOString(),
              dependencies: [],
            },
          ],
          nextId: 10,
        },
        null,
        2,
      ),
    )

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [{ type: 'delete-component', target: 'CID-009' }])
    const results = await createModificationApplier().apply(ctx)

    expect(results).toHaveLength(1)
    expect(results[0]).toContain('delete-component: CID-009')
    expect(existsSync(join(sharedDir, 'feature-card.tsx'))).toBe(false)

    const manifestRaw = readFileSync(join(projectRoot, 'coherent.components.json'), 'utf-8')
    const manifest = JSON.parse(manifestRaw) as { shared: Array<{ id: string }> }
    expect(manifest.shared.find(e => e.id === 'CID-009')).toBeUndefined()
  })

  it('rename pattern: [delete-page X, add-page Y] processes the delete; pages applier handles the add', async () => {
    // The exact bug from the v0.11.2 dogfood report. Plan AI emitted
    // both requests; pre-v0.11.3 skill rail silently dropped delete-page
    // and only Activity got added, leaving Transactions on disk.
    projectRoot = setupProject()
    await seedPageInConfig(projectRoot, { id: 'transactions', name: 'Transactions', route: '/transactions' })

    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [
      { type: 'delete-page', target: 'transactions' },
      { type: 'add-page', target: 'new', changes: { id: 'activity', name: 'Activity', route: '/activity' } },
    ])

    // Modification applier: handles ONLY the delete (add-page deferred to
    // pages applier which reads page-<id>.json artifacts written by the
    // page phase, not the planner request directly).
    const results = await createModificationApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toContain('delete-page: Transactions')

    // Verify post-delete state.
    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    const cfg = after.getConfig()
    expect(cfg.pages.find(p => p.id === 'transactions')).toBeUndefined()
    expect(existsSync(join(projectRoot, 'app', '(app)', 'transactions', 'page.tsx'))).toBe(false)
  })

  it('GUARD: throws on unsupported request types BEFORE applying handled types', async () => {
    // Codex audit P1 — silent partial-apply is the failure mode we need
    // to kill. If the planner emits an AI-dependent type alongside a
    // simple destructive op, the destructive op MUST NOT proceed because
    // the user's overall intent (which includes the AI op) cannot be
    // satisfied. Surface the error early.
    projectRoot = setupProject()
    await seedPageInConfig(projectRoot, { id: 'transactions', name: 'Transactions', route: '/transactions' })
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [
      { type: 'delete-page', target: 'transactions' },
      { type: 'link-shared', target: 'home', changes: { sharedIdOrName: 'CID-003' } },
    ])

    await expect(createModificationApplier().apply(ctx)).rejects.toThrow(/skill rail does not yet support/)

    // CRITICAL: the delete-page MUST NOT have been applied. The whole
    // session is reject-on-load — partial apply is what we're killing.
    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    expect(after.getConfig().pages.find(p => p.id === 'transactions')).toBeDefined()
    expect(existsSync(join(projectRoot, 'app', '(app)', 'transactions', 'page.tsx'))).toBe(true)
  })

  it('GUARD: surfaces every unsupported type in the error message', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await writeRequests(store, uuid, [
      { type: 'update-page', target: 'home', changes: { pageCode: '...' } },
      { type: 'modify-layout-block', target: 'header' },
      { type: 'promote-and-link', target: 'home' },
    ])
    await expect(createModificationApplier().apply(ctx)).rejects.toThrow(
      /update-page.*modify-layout-block.*promote-and-link/,
    )
  })

  it('handles malformed artifact JSON without crashing the session', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    await store.writeArtifact(uuid, 'modification-requests.json', '{ this is not json')
    expect(await createModificationApplier().apply(ctx)).toEqual([])
  })

  it('update-token: applies the token mutation via dsm.updateToken', async () => {
    projectRoot = setupProject()
    const { ctx, store, uuid } = await makeContext(projectRoot)
    // Path format mirrors how the API rail's request-parser produces
    // update-token: target is the dotted path, changes.value is the new value.
    await writeRequests(store, uuid, [
      { type: 'update-token', target: 'colors.light.primary', changes: { value: '#10B981' } },
    ])
    const results = await createModificationApplier().apply(ctx)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatch(/update-token: colors\.light\.primary/)

    const after = new DesignSystemManager(join(projectRoot, 'design-system.config.ts'))
    await after.load()
    expect(after.getConfig().tokens.colors.light.primary).toBe('#10B981')
  })
})
