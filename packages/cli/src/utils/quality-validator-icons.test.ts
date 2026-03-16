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
    const importMatch = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(importMatch).toBeTruthy()
    expect(importMatch![1]).toContain('Settings')
    expect(fixes.some(f => f.includes('SettingsIcon') || f.includes('Settings'))).toBe(true)
  })

  it('replaces completely unknown *Icon with Circle fallback', async () => {
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

  it('does NOT replace UI components like Button, Card, Avatar', async () => {
    const code = `import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Home, Settings } from "lucide-react"

export default function Page() {
  return (
    <Card className="p-4">
      <CardHeader >
        <CardTitle >Dashboard</CardTitle>
      </CardHeader>
      <CardContent >
        <Avatar className="size-8">
          <AvatarImage src="/photo.jpg" />
          <AvatarFallback >JD</AvatarFallback>
        </Avatar>
        <Button variant="outline">
          <Home className="size-4" />
          Click me
        </Button>
      </CardContent>
    </Card>
  )
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('Button')
    expect(fixed).toContain('Card')
    expect(fixed).toContain('CardContent')
    expect(fixed).toContain('CardHeader')
    expect(fixed).toContain('CardTitle')
    expect(fixed).toContain('Avatar')
    expect(fixed).toContain('AvatarImage')
    expect(fixed).toContain('AvatarFallback')
    expect(fixed).not.toContain('Circle')
  })

  it('does not touch locally defined components', async () => {
    const code = `import { Home } from "lucide-react"

function CustomIcon({ children }: { children: React.ReactNode }) {
  return <div className="icon">{children}</div>
}

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <CustomIcon >content</CustomIcon>
    </div>
  )
}`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('CustomIcon')
    expect(fixed).not.toContain('Circle')
  })
})
