import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DesignSystemManager } from '@getcoherent/core'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import { createConfigDeltaApplier, createComponentsApplier, createPagesApplier, defaultAppliers } from '../appliers.js'
import { createMinimalConfig } from '../../utils/minimal-config.js'
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
  it('returns config-delta, components, pages — in that order', () => {
    const appliers = defaultAppliers()
    expect(appliers.map(a => a.name)).toEqual(['config-delta', 'components', 'pages'])
  })
})
