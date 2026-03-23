import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isTailwindV4 } from './tailwind-version.js'
import { existsSync, readFileSync } from 'fs'

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
