import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildAppLayoutCode,
  buildGroupLayoutCode,
  ensureAppRouteGroupLayout,
  ensurePlanGroupLayouts,
  regenerateComponent,
  scanAndInstallSharedDeps,
} from './code-generator.js'
import { ArchitecturePlanSchema } from './plan-generator.js'

vi.mock('../../providers/index.js', () => ({
  getComponentProvider: vi.fn(() => ({
    listNames: () => ['Button', 'Card', 'Input', 'Sheet'],
    has: (id: string) => ['button', 'card', 'input', 'sheet'].includes(id),
    installComponent: vi.fn(async () => ({ success: true, componentDef: null })),
  })),
}))
import type { DesignSystemConfig } from '@getcoherent/core'

describe('buildAppLayoutCode', () => {
  it('generates header layout by default (no navType)', () => {
    const code = buildAppLayoutCode()
    expect(code).toContain('max-w-7xl')
    expect(code).not.toContain('Sidebar')
  })

  it('generates header layout for navType "header"', () => {
    const code = buildAppLayoutCode('header')
    expect(code).toContain('max-w-7xl')
    expect(code).not.toContain('Sidebar')
  })

  it('generates sidebar layout for navType "sidebar"', () => {
    const code = buildAppLayoutCode('sidebar')
    expect(code).toContain('Sidebar')
    expect(code).toContain('flex')
    expect(code).not.toContain('max-w-7xl')
  })

  it('generates sidebar layout for navType "both"', () => {
    const code = buildAppLayoutCode('both')
    expect(code).toContain('Sidebar')
    expect(code).toContain('flex')
  })
})

describe('ensureAppRouteGroupLayout', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'layout-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates (app)/layout.tsx when missing', async () => {
    await ensureAppRouteGroupLayout(tmpDir, 'sidebar')
    const content = readFileSync(join(tmpDir, 'app', '(app)', 'layout.tsx'), 'utf-8')
    expect(content).toContain('Sidebar')
  })

  it('does NOT overwrite existing layout by default', async () => {
    const layoutDir = join(tmpDir, 'app', '(app)')
    mkdirSync(layoutDir, { recursive: true })
    writeFileSync(join(layoutDir, 'layout.tsx'), 'original')

    await ensureAppRouteGroupLayout(tmpDir, 'sidebar')
    const content = readFileSync(join(layoutDir, 'layout.tsx'), 'utf-8')
    expect(content).toBe('original')
  })

  it('DOES overwrite layout when forceUpdate=true', async () => {
    const layoutDir = join(tmpDir, 'app', '(app)')
    mkdirSync(layoutDir, { recursive: true })
    writeFileSync(join(layoutDir, 'layout.tsx'), 'old header layout')

    await ensureAppRouteGroupLayout(tmpDir, 'sidebar', true)
    const content = readFileSync(join(layoutDir, 'layout.tsx'), 'utf-8')
    expect(content).toContain('Sidebar')
    expect(content).not.toBe('old header layout')
  })

  it('updates from header to sidebar layout on nav change', async () => {
    const layoutDir = join(tmpDir, 'app', '(app)')
    mkdirSync(layoutDir, { recursive: true })
    const headerCode = buildAppLayoutCode('header')
    writeFileSync(join(layoutDir, 'layout.tsx'), headerCode)

    await ensureAppRouteGroupLayout(tmpDir, 'sidebar', true)
    const content = readFileSync(join(layoutDir, 'layout.tsx'), 'utf-8')
    expect(content).toContain('Sidebar')
    expect(content).not.toContain('max-w-7xl')
  })
})

describe('regenerateComponent', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'regen-comp-'))
    mkdirSync(join(tmpDir, 'components', 'ui'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('skips shadcn-sourced components (installed by npx shadcn add)', async () => {
    const realSheet = '// Real shadcn Sheet with SheetContent, SheetTrigger...'
    writeFileSync(join(tmpDir, 'components', 'ui', 'sheet.tsx'), realSheet)

    const config = {
      components: [{ id: 'sheet', name: 'Sheet', source: 'shadcn' }],
      pages: [],
      tokens: {},
    } as unknown as DesignSystemConfig

    await regenerateComponent('sheet', config, tmpDir)
    const content = readFileSync(join(tmpDir, 'components', 'ui', 'sheet.tsx'), 'utf-8')
    expect(content).toBe(realSheet)
  })

  it('regenerates custom-sourced components', async () => {
    writeFileSync(join(tmpDir, 'components', 'ui', 'custom-widget.tsx'), 'old code')

    const config = {
      components: [
        {
          id: 'custom-widget',
          name: 'CustomWidget',
          source: 'custom',
          template: '<div>Custom Widget</div>',
        },
      ],
      pages: [],
      tokens: {},
    } as unknown as DesignSystemConfig

    await regenerateComponent('custom-widget', config, tmpDir)
    const content = readFileSync(join(tmpDir, 'components', 'ui', 'custom-widget.tsx'), 'utf-8')
    expect(content).not.toBe('old code')
  })
})

describe('scanAndInstallSharedDeps', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'scan-deps-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when shared dir does not exist', async () => {
    const result = await scanAndInstallSharedDeps(tmpDir)
    expect(result).toEqual([])
  })

  it('detects ui component imports in shared files', async () => {
    const sharedDir = join(tmpDir, 'components', 'shared')
    mkdirSync(sharedDir, { recursive: true })
    writeFileSync(
      join(sharedDir, 'header.tsx'),
      `import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet'\nexport function Header() { return <div>Header</div> }`,
    )
    mkdirSync(join(tmpDir, 'components', 'ui'), { recursive: true })

    const result = await scanAndInstallSharedDeps(tmpDir)
    expect(result).toContain('sheet')
  })

  it('skips already-installed components', async () => {
    const sharedDir = join(tmpDir, 'components', 'shared')
    mkdirSync(sharedDir, { recursive: true })
    writeFileSync(
      join(sharedDir, 'header.tsx'),
      `import { Button } from '@/components/ui/button'\nexport function Header() { return <div>Header</div> }`,
    )
    const uiDir = join(tmpDir, 'components', 'ui')
    mkdirSync(uiDir, { recursive: true })
    writeFileSync(join(uiDir, 'button.tsx'), 'export function Button() {}')

    const result = await scanAndInstallSharedDeps(tmpDir)
    expect(result).toEqual([])
  })
})

describe('buildGroupLayoutCode', () => {
  it('generates header layout for header group', () => {
    const code = buildGroupLayoutCode('header', ['/features', '/pricing'])
    expect(code).toContain('max-w-7xl')
    expect(code).not.toContain('Sidebar')
  })

  it('generates sidebar layout for sidebar group', () => {
    const code = buildGroupLayoutCode('sidebar', ['/dashboard', '/tasks'])
    expect(code).toContain('Sidebar')
    expect(code).toContain('flex')
  })

  it('generates centered wrapper for none layout', () => {
    const code = buildGroupLayoutCode('none', ['/login'])
    expect(code).toContain('children')
    expect(code).not.toContain('Sidebar')
    expect(code).not.toContain('max-w-7xl')
  })
})

describe('ensurePlanGroupLayouts', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'plan-layout-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates layout files for each plan group', async () => {
    const plan = ArchitecturePlanSchema.parse({
      groups: [
        { id: 'public', layout: 'header', pages: ['/features'] },
        { id: 'app', layout: 'sidebar', pages: ['/dashboard'] },
        { id: 'auth', layout: 'none', pages: ['/login'] },
      ],
      sharedComponents: [],
      pageNotes: {},
    })

    await ensurePlanGroupLayouts(tmpDir, plan)

    const publicLayout = readFileSync(join(tmpDir, 'app', '(public)', 'layout.tsx'), 'utf-8')
    expect(publicLayout).toContain('max-w-7xl')

    const appLayout = readFileSync(join(tmpDir, 'app', '(app)', 'layout.tsx'), 'utf-8')
    expect(appLayout).toContain('Sidebar')

    const authLayout = readFileSync(join(tmpDir, 'app', '(auth)', 'layout.tsx'), 'utf-8')
    expect(authLayout).toContain('children')
    expect(authLayout).not.toContain('Sidebar')
  })
})
