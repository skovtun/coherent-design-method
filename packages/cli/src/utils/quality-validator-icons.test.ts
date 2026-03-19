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
        Badge: () => null,
        ArrowRight: () => null,
        Star: () => null,
        Zap: () => null,
        TrendingUp: () => null,
        CheckCircle: () => null,
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

  it('does NOT replace UI components when AI puts them in lucide import (hallucination)', async () => {
    const code = `import { ArrowRight, Star, Zap, Button, Card, CardHeader, CardTitle, CardContent } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export default function Page() {
  return (
    <div>
      <ArrowRight className="size-4" />
      <Star className="size-4" />
      <Card className="p-4">
        <CardHeader >
          <CardTitle >Title</CardTitle>
        </CardHeader>
        <CardContent >
          <Button variant="outline">Click</Button>
        </CardContent>
      </Card>
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('Button')
    expect(fixed).toContain('Card')
    expect(fixed).toContain('CardHeader')
    expect(fixed).toContain('CardTitle')
    expect(fixed).toContain('CardContent')
    expect(fixed).not.toContain('import { Circle } from "@/components/ui/button"')
    expect(fixed).not.toContain('import { Circle, Circle')
    const lucideImport = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(lucideImport).toBeTruthy()
    expect(lucideImport![1]).not.toContain('Button')
    expect(lucideImport![1]).not.toContain('Card')
    expect(lucideImport![1]).toContain('ArrowRight')
    expect(lucideImport![1]).toContain('Star')
    expect(fixes.some(f => f.includes('conflicts with UI component') || f.includes('removed'))).toBe(true)
  })

  it('removes valid lucide name from lucide import when also imported from UI (Badge)', async () => {
    const code = `import { Home, Badge } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function Page() {
  return (
    <div>
      <Home className="size-4" />
      <Badge variant="outline">New</Badge>
    </div>
  )
}`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('Badge')
    const lucideImport = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
    expect(lucideImport).toBeTruthy()
    expect(lucideImport![1]).not.toContain('Badge')
    expect(lucideImport![1]).toContain('Home')
    expect(fixed).toContain('import { Badge } from "@/components/ui/badge"')
    expect(fixes.some(f => f.includes('Badge') && f.includes('conflicts'))).toBe(true)
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
