import { describe, it, expect } from 'vitest'
import { detectComponentIssues, applyComponentRules } from './component-rules.js'

// Real-world patterns from TaskFlow demo project

const SETTINGS_SIDEBAR_BUTTON = `"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { User, Bell, Zap } from 'lucide-react'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')

  const sidebarItems = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Zap }
  ]

  return (
    <div className="flex gap-6">
      <div className="w-48 space-y-1">
        {sidebarItems.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={\`flex items-center gap-3 rounded-md px-3 py-2 text-sm w-full text-left transition-colors \${
                activeTab === item.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }\`}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}`

const PROJECT_TAB_BUTTONS = `"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function ProjectPage() {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="border-b">
      <div className="flex gap-6">
        <Button
          className={\`pb-2 text-sm font-medium transition-colors \${
            activeTab === 'overview'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }\`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </Button>
        <Button
          className={\`pb-2 text-sm font-medium transition-colors \${
            activeTab === 'tasks'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }\`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
        </Button>
      </div>
    </div>
  )
}`

const CORRECT_BUTTONS = `"use client"

import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

export default function Page() {
  return (
    <div>
      <Button>Save</Button>
      <Button variant="outline" size="sm">Cancel</Button>
      <Button variant="ghost" className="text-muted-foreground">Ghost</Button>
      <Button variant={isActive ? 'default' : 'outline'} size="sm">Filter</Button>
      <Button className="w-full" asChild>
        <a href="/dashboard">Go</a>
      </Button>
      <Button>
        <Save className="size-4 mr-2 shrink-0" />
        Save Changes
      </Button>
    </div>
  )
}`

const BUTTON_WITH_CN = `"use client"

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Page() {
  const [active, setActive] = useState('a')
  return (
    <Button
      className={cn(
        "flex items-center gap-2",
        active === 'a' ? "bg-accent" : "text-muted-foreground"
      )}
      onClick={() => setActive('a')}
    >
      Tab A
    </Button>
  )
}`

describe('detectComponentIssues', () => {
  it('detects Button without variant with text-muted-foreground in sidebar', () => {
    const issues = detectComponentIssues(SETTINGS_SIDEBAR_BUTTON)
    expect(issues.length).toBeGreaterThanOrEqual(1)
    expect(issues[0].type).toBe('BUTTON_MISSING_VARIANT')
    expect(issues[0].severity).toBe('error')
  })

  it('detects multiple Buttons without variant in tab navigation', () => {
    const issues = detectComponentIssues(PROJECT_TAB_BUTTONS)
    expect(issues.length).toBe(2)
    expect(issues.every(i => i.type === 'BUTTON_MISSING_VARIANT')).toBe(true)
  })

  it('does not flag Buttons with explicit variant or no style overrides', () => {
    const issues = detectComponentIssues(CORRECT_BUTTONS)
    const buttonIssues = issues.filter(i => i.type === 'BUTTON_MISSING_VARIANT')
    expect(buttonIssues).toHaveLength(0)
  })

  it('detects Button with cn() containing text-muted-foreground', () => {
    const issues = detectComponentIssues(BUTTON_WITH_CN)
    expect(issues.length).toBeGreaterThanOrEqual(1)
    expect(issues[0].type).toBe('BUTTON_MISSING_VARIANT')
  })
})

describe('applyComponentRules', () => {
  it('adds variant="ghost" to sidebar Button without variant', () => {
    const { code, fixes } = applyComponentRules(SETTINGS_SIDEBAR_BUTTON)
    expect(code).toContain('<Button\n              variant="ghost"')
    expect(code).not.toMatch(/<Button\s+key=/m)
    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(fixes[0]).toContain('variant="ghost"')
  })

  it('adds variant="ghost" to tab Buttons without variant', () => {
    const { code } = applyComponentRules(PROJECT_TAB_BUTTONS)
    expect(code).toMatch(/<Button\s+variant="ghost"/g)
    const ghostMatches = code.match(/variant="ghost"/g)
    expect(ghostMatches).toHaveLength(2)
  })

  it('does not modify Buttons with explicit variant', () => {
    const { code, fixes } = applyComponentRules(CORRECT_BUTTONS)
    expect(code).toBe(CORRECT_BUTTONS)
    expect(fixes).toHaveLength(0)
  })

  it('adds variant="ghost" to Button with cn() and text-muted-foreground', () => {
    const { code, fixes } = applyComponentRules(BUTTON_WITH_CN)
    expect(code).toContain('variant="ghost"')
    expect(fixes.length).toBeGreaterThanOrEqual(1)
  })

  it('is idempotent — applying fix twice does not double-insert', () => {
    const { code: first } = applyComponentRules(PROJECT_TAB_BUTTONS)
    const { code: second, fixes } = applyComponentRules(first)
    expect(second).toBe(first)
    expect(fixes).toHaveLength(0)
  })

  it('fixes single-line Button with text-muted-foreground', () => {
    const code = '<Button className="text-muted-foreground hover:bg-accent">Tab</Button>'
    const { code: fixed } = applyComponentRules(code)
    expect(fixed).toContain('variant="ghost"')
  })

  it('preserves all other attributes when adding variant', () => {
    const { code } = applyComponentRules(SETTINGS_SIDEBAR_BUTTON)
    expect(code).toContain('onClick={() => setActiveTab(item.id)}')
    expect(code).toContain('className={')
    expect(code).toContain('key={item.id}')
  })
})
