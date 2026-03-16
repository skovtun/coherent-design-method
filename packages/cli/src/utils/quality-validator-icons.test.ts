/**
 * Regression tests for lucide-react icon autofix.
 * Isolated from main test file because module mock is needed.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('module', () => ({
  createRequire: () => (moduleId: string) => {
    if (moduleId === 'lucide-react') {
      return {
        Settings: () => null,
        Circle: () => null,
        Home: () => null,
        User: () => null,
        Bell: () => null,
        Shield: () => null,
        BarChart3: () => null,
        Database: () => null,
        Layers: () => null,
        FileText: () => null,
        AlertTriangle: () => null,
        Search: () => null,
        ChevronRight: () => null,
      }
    }
    throw new Error(`Cannot find module '${moduleId}'`)
  },
}))

import { autoFixCode } from './quality-validator.js'

describe('autoFixCode — unimported icon references', () => {
  it('renames SettingsIcon → Settings when Settings exists in lucide-react', async () => {
    const code = `import { Home, User, Bell, Shield, AlertTriangle } from "lucide-react"

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <SettingsIcon className="size-4" />
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('SettingsIcon')
    expect(fixed).toContain('Settings')
    expect(fixed).toContain('Settings')
    const importMatch = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(importMatch).toBeTruthy()
    expect(importMatch![1]).toContain('Settings')
    expect(fixes.some(f => f.includes('SettingsIcon') || f.includes('Settings'))).toBe(true)
  })

  it('adds missing icon to import when used in JSX but not imported', async () => {
    const code = `import { Home } from "lucide-react"

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <Search className="size-4" />
    </div>
  )
}`
    const { code: fixed } = await autoFixCode(code)
    const importMatch = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(importMatch).toBeTruthy()
    expect(importMatch![1]).toContain('Search')
  })

  it('replaces completely unknown icon with Circle fallback', async () => {
    const code = `import { Home } from "lucide-react"

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <MagicalUnicornIcon className="size-4" />
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('MagicalUnicornIcon')
    expect(fixed).toContain('Circle')
    expect(fixes.some(f => f.includes('MagicalUnicornIcon'))).toBe(true)
  })

  it('does not touch locally defined components', async () => {
    const code = `import { Home } from "lucide-react"

function CustomCard({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>
}

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <CustomCard >content</CustomCard>
    </div>
  )
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('CustomCard')
    expect(fixed).not.toContain('Circle')
  })
})
