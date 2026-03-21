import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShadcnProvider } from './shadcn-provider.js'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

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

  it('returns ComponentAPI for dialog', () => {
    const api = provider.getComponentAPI('dialog')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('Dialog')
    expect(api!.subcomponents).toContain('DialogContent')
    expect(api!.subcomponents).toContain('DialogHeader')
    expect(api!.subcomponents).toContain('DialogTitle')
  })

  it('returns ComponentAPI for select', () => {
    const api = provider.getComponentAPI('select')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('Select')
    expect(api!.subcomponents).toContain('SelectTrigger')
    expect(api!.subcomponents).toContain('SelectContent')
    expect(api!.subcomponents).toContain('SelectItem')
  })

  it('returns ComponentAPI for dropdown-menu', () => {
    const api = provider.getComponentAPI('dropdown-menu')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('DropdownMenu')
    expect(api!.subcomponents).toContain('DropdownMenuTrigger')
    expect(api!.subcomponents).toContain('DropdownMenuContent')
    expect(api!.subcomponents).toContain('DropdownMenuItem')
  })

  it('returns null for unknown component', () => {
    expect(provider.getComponentAPI('nonexistent')).toBeNull()
  })

  it('marks all components as managed', () => {
    const components = provider.list()
    expect(components.every(c => c.managed === true)).toBe(true)
  })
})

describe('ShadcnProvider.install()', () => {
  const provider = new ShadcnProvider()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls npx shadcn@latest add for the component', async () => {
    const { exec } = await import('node:child_process')
    const { existsSync } = await import('node:fs')

    const execMock = vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (cb) cb(null, { stdout: 'Done', stderr: '' })
      },
    )

    const result = await provider.install('button', '/tmp/test-project', {
      exec: execMock as unknown as typeof exec,
      existsSync: (() => false) as typeof existsSync,
    })

    expect(result).toBeUndefined()
    expect(execMock).toHaveBeenCalledTimes(1)
    const cmd = execMock.mock.calls[0][0] as string
    expect(cmd).toContain('npx shadcn@latest add button')
    expect(cmd).toContain('--yes')
    expect(cmd).toContain('--overwrite')
  })

  it('skips install if component file already exists', async () => {
    const { exec } = await import('node:child_process')
    const { existsSync } = await import('node:fs')

    const execMock = vi.fn()

    await provider.install('button', '/tmp/test-project', {
      exec: execMock as unknown as typeof exec,
      existsSync: (() => true) as typeof existsSync,
    })

    expect(execMock).not.toHaveBeenCalled()
  })

  it('falls back on exec error and logs warning', async () => {
    const { exec } = await import('node:child_process')
    const { existsSync } = await import('node:fs')

    const execMock = vi.fn((_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      if (cb) cb(new Error('ENOTFOUND'))
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.install('button', '/tmp/test-project', {
      exec: execMock as unknown as typeof exec,
      existsSync: (() => false) as typeof existsSync,
    })

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not install button'))
  })

  it('re-installs when force=true even if file exists', async () => {
    const { exec } = await import('node:child_process')
    const { existsSync } = await import('node:fs')

    const execMock = vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (cb) cb(null, { stdout: 'Done', stderr: '' })
      },
    )

    await provider.install(
      'button',
      '/tmp/test-project',
      {
        exec: execMock as unknown as typeof exec,
        existsSync: (() => true) as typeof existsSync,
      },
      true,
    )

    expect(execMock).toHaveBeenCalledTimes(1)
  })
})

describe('ShadcnProvider.getCssVariables()', () => {
  const provider = new ShadcnProvider()
  const tokens = {
    colors: {
      light: {
        primary: '#3B82F6',
        secondary: '#10B981',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        background: '#FFFFFF',
        foreground: '#0F172A',
        muted: '#F1F5F9',
        border: '#E2E8F0',
      },
      dark: {
        primary: '#60A5FA',
        secondary: '#34D399',
        success: '#4ADE80',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#60A5FA',
        background: '#0F172A',
        foreground: '#F1F5F9',
        muted: '#1E293B',
        border: '#334155',
      },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
    typography: {
      fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
      },
      fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
      lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
    },
    radius: { none: '0', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
  }

  it('delegates to buildCssVariables and returns valid CSS', () => {
    const css = provider.getCssVariables(tokens)
    expect(css).toContain(':root {')
    expect(css).toContain('.dark {')
    expect(css).toContain('--sidebar-background:')
    expect(css).toContain('--chart-1:')
    expect(css).toContain('--radius:')
  })

  it('getThemeBlock returns @theme inline mappings', () => {
    const theme = provider.getThemeBlock(tokens)
    expect(theme).toContain('@theme inline')
    expect(theme).toContain('--color-sidebar-background')
    expect(theme).toContain('--color-sidebar-foreground')
  })
})

describe('ShadcnProvider integration', () => {
  it('init + install + list flow works end-to-end', async () => {
    const provider = new ShadcnProvider()
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'integration-'))

    try {
      await provider.init(tmpDir)
      expect(existsSync(path.join(tmpDir, 'components.json'))).toBe(true)

      const components = provider.list()
      expect(components.length).toBeGreaterThan(10)

      const api = provider.getComponentAPI('button')
      expect(api).not.toBeNull()
      expect(api!.subcomponents).toContain('Button')

      expect(provider.has('button')).toBe(true)
      expect(provider.has('nonexistent-widget')).toBe(false)

      expect(provider.listNames()).toContain('button')
      expect(provider.listNames()).toContain('sidebar')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('ShadcnProvider.installComponent()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'install-component-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns { success: false } for unknown component', async () => {
    const provider = new ShadcnProvider()
    const result = await provider.installComponent('nonexistent', tmpDir)
    expect(result.success).toBe(false)
    expect(result.componentDef).toBeNull()
  })

  it('creates components.json via init() before install', async () => {
    const provider = new ShadcnProvider()
    expect(existsSync(path.join(tmpDir, 'components.json'))).toBe(false)

    vi.spyOn(provider, 'install').mockImplementation(async (name, root) => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      mkdirSync(path.join(root, 'components', 'ui'), { recursive: true })
      writeFileSync(path.join(root, 'components', 'ui', `${name}.tsx`), `export function Button() {}`)
    })

    await provider.installComponent('button', tmpDir)
    expect(existsSync(path.join(tmpDir, 'components.json'))).toBe(true)
  })

  it('returns success=true and componentDef when file is created', async () => {
    const provider = new ShadcnProvider()
    vi.spyOn(provider, 'install').mockImplementation(async (name, root) => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      mkdirSync(path.join(root, 'components', 'ui'), { recursive: true })
      writeFileSync(path.join(root, 'components', 'ui', `${name}.tsx`), 'export function Button() {}')
    })

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(true)
    expect(result.componentDef).not.toBeNull()
    expect(result.componentDef!.id).toBe('button')
  })

  it('returns success=false when install silently fails', async () => {
    const provider = new ShadcnProvider()
    vi.spyOn(provider, 'install').mockImplementation(async () => {
      // npx fails silently, no file created
    })

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(false)
    expect(result.componentDef).toBeNull()
  })

  it('skips install when file exists and force=false', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'existing')

    const installSpy = vi.spyOn(provider, 'install').mockImplementation(async () => {})

    const result = await provider.installComponent('button', tmpDir)
    expect(result.success).toBe(true)
    expect(result.componentDef).not.toBeNull()
    expect(installSpy).not.toHaveBeenCalled()
  })

  it('re-installs when force=true even if file exists', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'existing')

    const installSpy = vi.spyOn(provider, 'install').mockImplementation(async () => {})

    const result = await provider.installComponent('button', tmpDir, { force: true })
    expect(installSpy).toHaveBeenCalledWith('button', tmpDir, expect.anything(), true)
    expect(result.success).toBe(true)
  })
})

describe('ShadcnProvider.installBatch()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'install-batch-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns failure for unknown component IDs', async () => {
    const provider = new ShadcnProvider()
    const results = await provider.installBatch(['nonexistent'], tmpDir)
    expect(results.get('nonexistent')?.success).toBe(false)
  })

  it('calls init() before batch install', async () => {
    const provider = new ShadcnProvider()
    const initSpy = vi.spyOn(provider, 'init')
    vi.spyOn(provider, 'install').mockImplementation(async () => {})

    await provider.installBatch(['button'], tmpDir)
    expect(initSpy).toHaveBeenCalledWith(tmpDir)
  })

  it('installs multiple components via single exec call and returns results', async () => {
    const provider = new ShadcnProvider()
    const { exec } = await import('node:child_process')
    const execMock = vi.fn((_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      const { mkdirSync: mk, writeFileSync: wf } = require('node:fs')
      mk(path.join(tmpDir, 'components', 'ui'), { recursive: true })
      wf(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'export {}')
      wf(path.join(tmpDir, 'components', 'ui', 'card.tsx'), 'export {}')
      if (cb) cb(null)
    })

    const results = await provider.installBatch(['button', 'card'], tmpDir, undefined, {
      exec: execMock as unknown as typeof exec,
      existsSync,
    })

    expect(execMock).toHaveBeenCalledTimes(1)
    const cmd = execMock.mock.calls[0][0] as string
    expect(cmd).toContain('button card')
    expect(results.get('button')?.success).toBe(true)
    expect(results.get('button')?.componentDef?.id).toBe('button')
    expect(results.get('card')?.success).toBe(true)
    expect(results.get('card')?.componentDef?.id).toBe('card')
  })

  it('skips already-installed components when force=false', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync: mk, writeFileSync: wf } = await import('node:fs')
    mk(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    wf(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'existing')

    const { exec } = await import('node:child_process')
    const execMock = vi.fn((_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      const fs = require('node:fs')
      fs.mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'components', 'ui', 'card.tsx'), 'export {}')
      if (cb) cb(null)
    })

    const results = await provider.installBatch(['button', 'card'], tmpDir, undefined, {
      exec: execMock as unknown as typeof exec,
      existsSync,
    })
    expect(results.get('button')?.success).toBe(true)
    expect(results.get('card')?.success).toBe(true)
    // Only card should have been in the exec call (button already exists)
    if (execMock.mock.calls.length > 0) {
      const cmd = execMock.mock.calls[0][0] as string
      expect(cmd).not.toContain('button')
      expect(cmd).toContain('card')
    }
  })

  it('handles mixed valid and invalid IDs', async () => {
    const provider = new ShadcnProvider()
    const { exec } = await import('node:child_process')
    const execMock = vi.fn((_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      const fs = require('node:fs')
      fs.mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'export {}')
      if (cb) cb(null)
    })

    const results = await provider.installBatch(['button', 'nonexistent', 'also-fake'], tmpDir, undefined, {
      exec: execMock as unknown as typeof exec,
      existsSync,
    })

    expect(results.get('button')?.success).toBe(true)
    expect(results.get('nonexistent')?.success).toBe(false)
    expect(results.get('also-fake')?.success).toBe(false)
  })

  it('re-installs with force=true even if files exist', async () => {
    const provider = new ShadcnProvider()
    const { mkdirSync: mk, writeFileSync: wf } = await import('node:fs')
    mk(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    wf(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'old content')

    const { exec } = await import('node:child_process')
    const execMock = vi.fn((_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
      const fs = require('node:fs')
      fs.writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'new content')
      if (cb) cb(null)
    })

    const results = await provider.installBatch(
      ['button'],
      tmpDir,
      { force: true },
      {
        exec: execMock as unknown as typeof exec,
        existsSync,
      },
    )

    expect(execMock).toHaveBeenCalledTimes(1)
    expect(results.get('button')?.success).toBe(true)
  })
})

describe('ShadcnProvider.init()', () => {
  const provider = new ShadcnProvider()
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shadcn-init-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates components.json with Tailwind v4-compatible structure', async () => {
    await provider.init(tmpDir)

    const jsonPath = path.join(tmpDir, 'components.json')
    expect(existsSync(jsonPath)).toBe(true)

    const content = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(content.$schema).toBe('https://ui.shadcn.com/schema.json')
    expect(content.style).toBe('new-york')
    expect(content.rsc).toBe(true)
    expect(content.tsx).toBe(true)
    expect(content.aliases.ui).toBe('@/components/ui')
    expect(content.aliases.utils).toBe('@/lib/utils')
    expect(content.tailwind.config).toBe('')
    expect(content.tailwind.css).toBe('app/globals.css')
    expect(content.iconLibrary).toBe('lucide')
  })

  it('does not overwrite existing components.json', async () => {
    const jsonPath = path.join(tmpDir, 'components.json')
    writeFileSync(jsonPath, JSON.stringify({ custom: true }))

    await provider.init(tmpDir)

    const content = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(content.custom).toBe(true)
    expect(content.$schema).toBeUndefined()
  })
})
