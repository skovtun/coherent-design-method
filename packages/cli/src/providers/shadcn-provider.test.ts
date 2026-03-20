import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShadcnProvider } from './shadcn-provider.js'

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
      expect.stringContaining('using bundled template'),
    )
  })
})
