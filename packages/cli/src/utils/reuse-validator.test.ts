import { describe, it, expect } from 'vitest'
import { validateReuse } from './reuse-validator.js'
import type { SharedComponentsManifest } from '@getcoherent/core'

const manifest: SharedComponentsManifest = {
  shared: [
    {
      id: 'CID-001',
      name: 'StatsCard',
      type: 'data-display',
      file: 'components/shared/stats-card.tsx',
      usedIn: [],
      description: 'Metric card',
      propsInterface: '{ icon: LucideIcon; value: string; label: string }',
      dependencies: [],
    },
    {
      id: 'CID-002',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
      usedIn: ['app/layout.tsx'],
      dependencies: [],
    },
  ],
  nextId: 3,
}

describe('validateReuse', () => {
  it('warns when relevant component is not imported', () => {
    const code = `import { Card } from '@/components/ui/card'
export default function Dashboard() {
  return <Card><div className="text-2xl font-bold">1,234</div><p>Total Users</p></Card>
}`
    const warnings = validateReuse(manifest, code, 'app')
    const missed = warnings.filter(w => w.type === 'missed-reuse')
    expect(missed.length).toBeGreaterThan(0)
    expect(missed[0].componentId).toBe('CID-001')
  })

  it('does not warn when component is imported and used', () => {
    const code = `import { StatsCard } from '@/components/shared/stats-card'
export default function Dashboard() {
  return <StatsCard icon={Users} value="1,234" label="Total" />
}`
    const warnings = validateReuse(manifest, code, 'app')
    expect(warnings.filter(w => w.type === 'missed-reuse')).toHaveLength(0)
  })

  it('does not warn for irrelevant component types', () => {
    const code = `export default function Dashboard() { return <div>Dashboard</div> }`
    const warnings = validateReuse(manifest, code, 'app')
    const headerWarnings = warnings.filter(w => w.componentId === 'CID-002')
    expect(headerWarnings).toHaveLength(0)
  })

  it('does not warn for layout-mounted components (AppSidebar in layout.tsx)', () => {
    const layoutMountedManifest: SharedComponentsManifest = {
      shared: [
        {
          id: 'CID-009',
          name: 'AppSidebar',
          type: 'navigation',
          file: 'components/shared/app-sidebar.tsx',
          usedIn: ['app/(app)/layout.tsx'],
          dependencies: [],
        },
        {
          id: 'CID-007',
          name: 'FilterBar',
          type: 'form',
          file: 'components/shared/filter-bar.tsx',
          usedIn: ['app/(app)/projects/page.tsx'],
          dependencies: [],
        },
      ],
      nextId: 10,
    }
    const code = `export default function Settings() { return <div>Settings</div> }`
    const warnings = validateReuse(layoutMountedManifest, code, 'app')
    const sidebarWarnings = warnings.filter(w => w.componentId === 'CID-009')
    expect(sidebarWarnings).toHaveLength(0)
    const filterWarnings = warnings.filter(w => w.componentId === 'CID-007')
    expect(filterWarnings.length).toBeGreaterThan(0)
  })

  it('respects plannedComponentNames — only warns for components planned for this page', () => {
    const planned = new Set(['StatsCard'])
    const code = `export default function Settings() { return <div>Settings</div> }`
    const warnings = validateReuse(manifest, code, 'app', undefined, planned)
    expect(warnings.filter(w => w.type === 'missed-reuse')).toHaveLength(1)
    expect(warnings[0].componentName).toBe('StatsCard')

    const emptyPlan = new Set<string>()
    const warningsEmpty = validateReuse(manifest, code, 'app', undefined, emptyPlan)
    expect(warningsEmpty.filter(w => w.type === 'missed-reuse')).toHaveLength(0)
  })

  it('warns on duplicate creation', () => {
    const code = `export default function Dashboard() { return <div /> }`
    const newFiles = [
      {
        name: 'MetricCard',
        type: 'data-display' as const,
        file: 'components/metric-card.tsx',
        propsInterface: '{ icon: LucideIcon; value: string; label: string }',
      },
    ]
    const warnings = validateReuse(manifest, code, 'app', newFiles)
    const dupes = warnings.filter(w => w.type === 'duplicate-creation')
    expect(dupes.length).toBeGreaterThan(0)
    expect(dupes[0].message).toContain('StatsCard')
  })
})
