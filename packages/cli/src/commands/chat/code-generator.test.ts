import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildAppLayoutCode, ensureAppRouteGroupLayout, regenerateComponent } from './code-generator.js'
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
