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

    const execMock = vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('ENOTFOUND'))
      },
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await provider.install('button', '/tmp/test-project', {
      exec: execMock as unknown as typeof exec,
      existsSync: (() => false) as typeof existsSync,
    })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not install button'),
    )
  })
})

describe('ShadcnProvider.getCssVariables()', () => {
  const provider = new ShadcnProvider()
  const tokens = {
    colors: {
      light: {
        primary: '#3B82F6', secondary: '#10B981', success: '#22C55E',
        warning: '#F59E0B', error: '#EF4444', info: '#3B82F6',
        background: '#FFFFFF', foreground: '#0F172A', muted: '#F1F5F9', border: '#E2E8F0',
      },
      dark: {
        primary: '#60A5FA', secondary: '#34D399', success: '#4ADE80',
        warning: '#FBBF24', error: '#F87171', info: '#60A5FA',
        background: '#0F172A', foreground: '#F1F5F9', muted: '#1E293B', border: '#334155',
      },
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
    typography: {
      fontFamily: { sans: 'Inter', mono: 'JetBrains Mono' },
      fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
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

describe('ShadcnProvider.init()', () => {
  const provider = new ShadcnProvider()
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'shadcn-init-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates components.json with correct structure', async () => {
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
