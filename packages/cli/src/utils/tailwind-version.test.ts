import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isTailwindV4, generateV4GlobalsCss } from './tailwind-version.js'
import { existsSync, readFileSync } from 'fs'
import type { DesignSystemConfig } from '@getcoherent/core'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)

describe('isTailwindV4', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('detects @tailwindcss/postcss in devDependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      devDependencies: { '@tailwindcss/postcss': '^4.0.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects tailwindcss: "^4" in dependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { tailwindcss: '^4.0.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects tailwindcss: "4.x" in dependencies', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      dependencies: { tailwindcss: '4.1.0' },
    }))
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('detects @import "tailwindcss" in globals.css', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: {} })
      return '@import "tailwindcss";'
    })
    expect(isTailwindV4('/project')).toBe(true)
  })

  it('returns false for v3 project', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation((p: any) => {
      if (String(p).includes('package.json')) return JSON.stringify({ dependencies: { tailwindcss: '^3.4.0' } })
      return '@tailwind base;\n@tailwind components;\n@tailwind utilities;'
    })
    expect(isTailwindV4('/project')).toBe(false)
  })

  it('returns false when no package.json and no globals.css', () => {
    mockExistsSync.mockReturnValue(false)
    expect(isTailwindV4('/project')).toBe(false)
  })
})

const mockConfig = {
  name: 'Test',
  theme: { defaultMode: 'light' as const },
  tokens: {
    colors: {
      light: {
        background: '#ffffff',
        foreground: '#09090b',
        primary: '#2563eb',
        secondary: '#f1f5f9',
        muted: '#f1f5f9',
        accent: '#f1f5f9',
        border: '#e2e8f0',
        success: '#16a34a',
        warning: '#eab308',
        error: '#dc2626',
        info: '#2563eb',
      },
      dark: {
        background: '#09090b',
        foreground: '#fafafa',
        primary: '#3b82f6',
        secondary: '#1e293b',
        muted: '#1e293b',
        accent: '#1e293b',
        border: '#1e293b',
        success: '#22c55e',
        warning: '#facc15',
        error: '#ef4444',
        info: '#3b82f6',
      },
    },
    radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
    spacing: {},
    typography: {},
  },
  components: [],
  pages: [],
} as unknown as DesignSystemConfig

describe('generateV4GlobalsCss', () => {
  const css = generateV4GlobalsCss(mockConfig)

  it('contains --color-transparent in @theme inline', () => {
    expect(css).toContain('--color-transparent: transparent')
  })

  it('contains --color-black and --color-white', () => {
    expect(css).toContain('--color-black:')
    expect(css).toContain('--color-white:')
  })

  it('contains all 10 sidebar color aliases in @theme inline', () => {
    const sidebarVars = [
      '--color-sidebar-background',
      '--color-sidebar-foreground',
      '--color-sidebar-primary',
      '--color-sidebar-primary-foreground',
      '--color-sidebar-accent',
      '--color-sidebar-accent-foreground',
      '--color-sidebar-border',
      '--color-sidebar-ring',
      '--color-sidebar-muted',
      '--color-sidebar-muted-foreground',
    ]
    for (const v of sidebarVars) {
      expect(css).toContain(v)
    }
  })

  it('contains chart color aliases in @theme inline', () => {
    for (let i = 1; i <= 5; i++) {
      expect(css).toContain(`--color-chart-${i}`)
    }
  })

  it('contains --radius-xs', () => {
    expect(css).toContain('--radius-xs')
  })

  it('contains sidebar base variables in :root', () => {
    expect(css).toContain('--sidebar-background:')
    expect(css).toContain('--sidebar-foreground:')
    expect(css).toContain('--sidebar-muted:')
    expect(css).toContain('--sidebar-muted-foreground:')
  })

  it('contains chart base variables in :root', () => {
    expect(css).toContain('--chart-1:')
    expect(css).toContain('--chart-5:')
  })

  it('contains sidebar and chart variables in .dark', () => {
    const darkSection = css.split('.dark {')[1]
    expect(darkSection).toBeDefined()
    expect(darkSection).toContain('--sidebar-background:')
    expect(darkSection).toContain('--chart-1:')
  })
})
