import { describe, it, expect, vi, beforeEach } from 'vitest'
import { needsGlobalsFix } from './fix-globals-css.js'
import { existsSync, readFileSync } from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('./tailwind-version.js', () => ({
  isTailwindV4: vi.fn(),
  generateV4GlobalsCss: vi.fn(() => '/* mock */'),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const { isTailwindV4: mockIsTailwindV4 } = await import('./tailwind-version.js')

describe('needsGlobalsFix', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns false when globals.css does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(needsGlobalsFix('/project')).toBe(false)
  })

  it('returns true for v4 project missing --color-transparent', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue('@import "tailwindcss";\n@theme inline {\n  --color-background: var(--background);\n}')
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --color-sidebar-background', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-background: var(--background);\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --color-black', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-sidebar-background: var(--sidebar-background);\n  --color-chart-1: var(--chart-1);\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns true for v4 project missing --radius-xs', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue(
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n  --color-sidebar-background: x;\n  --color-chart-1: x;\n  --color-black: #000;\n  --color-white: #fff;\n}'
    )
    expect(needsGlobalsFix('/project')).toBe(true)
  })

  it('returns false for complete v4 globals', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    const completeV4 = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-sidebar-background: var(--sidebar-background);
  --color-chart-1: var(--chart-1);
  --radius-xs: 0.125rem;
}`
    mockReadFileSync.mockReturnValue(completeV4)
    expect(needsGlobalsFix('/project')).toBe(false)
  })

  it('returns true for v3-style globals in v4 project', () => {
    mockExistsSync.mockReturnValue(true)
    vi.mocked(mockIsTailwindV4).mockReturnValue(true)
    mockReadFileSync.mockReturnValue('@tailwind base;\n@tailwind components;\n@tailwind utilities;')
    expect(needsGlobalsFix('/project')).toBe(true)
  })
})
