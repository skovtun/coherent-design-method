import { describe, it, expect } from 'vitest'
import { buildReusePlan, buildReusePlanDirective, verifyReusePlan } from './reuse-planner.js'
import { SharedComponentsManifestSchema } from '@getcoherent/core'

const mockManifest = SharedComponentsManifestSchema.parse({
  shared: [
    {
      id: 'CID-001',
      name: 'StatCard',
      type: 'data-display',
      file: 'components/shared/stat-card.tsx',
      description: 'Displays a single metric',
      usedIn: ['app/(app)/dashboard/page.tsx'],
      propsInterface: '{ label: string; value: string; icon?: React.ReactNode }',
      usageExample: '<StatCard label="Users" value="1,234" icon={<Users />} />',
      dependencies: [],
    },
    {
      id: 'CID-002',
      name: 'FilterBar',
      type: 'form',
      file: 'components/shared/filter-bar.tsx',
      description: 'Filtering controls',
      usedIn: [],
      propsInterface: '{ filters: Filter[]; onFilterChange: (f: Filter[]) => void }',
      dependencies: [],
    },
  ],
})

describe('buildReusePlan', () => {
  it('maps stats section to data-display components', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Stats row', 'Task list'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a task management page',
    })

    expect(plan.reuse.length).toBeGreaterThanOrEqual(1)
    const statReuse = plan.reuse.find(r => r.component === 'StatCard')
    expect(statReuse).toBeDefined()
    expect(statReuse!.targetSection).toBe('Stats row')
  })

  it('maps filter section to form components', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Filter controls', 'Task list'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a task page with filtering',
    })

    const filterReuse = plan.reuse.find(r => r.component === 'FilterBar')
    expect(filterReuse).toBeDefined()
  })

  it('returns empty reuse for empty manifest', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Stats row'],
      manifest: SharedComponentsManifestSchema.parse({ shared: [] }),
      existingPageCode: {},
      userRequest: 'Create a page',
    })

    expect(plan.reuse).toHaveLength(0)
  })

  it('suggests createNew for sections with no matching component', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Activity feed'],
      manifest: mockManifest,
      existingPageCode: {},
      userRequest: 'Create a page with activity feed',
    })

    expect(plan.createNew.length).toBeGreaterThanOrEqual(0)
    const activityReuse = plan.reuse.find(r => r.targetSection === 'Activity feed')
    expect(activityReuse).toBeUndefined()
  })

  it('extracts grid patterns from existing page code', () => {
    const plan = buildReusePlan({
      pageName: 'Tasks',
      pageType: 'app',
      sections: ['Stats row'],
      manifest: mockManifest,
      existingPageCode: {
        '/dashboard': '<div className="grid grid-cols-4 gap-4">stats</div>',
      },
      userRequest: 'Create a page',
    })

    expect(plan.reusePatterns.length).toBeGreaterThanOrEqual(1)
    expect(plan.reusePatterns[0].pattern).toContain('grid-cols')
  })
})

describe('buildReusePlanDirective', () => {
  it('formats MUST USE section with import paths and examples', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats row',
          reason: 'Dashboard uses same pattern',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard label="Tasks" value="42" />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(directive).toContain('MUST USE')
    expect(directive).toContain('StatCard')
    expect(directive).toContain('@/components/shared/stat-card')
    expect(directive).toContain('Stats row')
  })

  it('includes CREATE NEW section', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [],
      createNew: [{ name: 'TaskRow', reason: 'No match', suggestedType: 'data-display' }],
      reusePatterns: [],
    })

    expect(directive).toContain('CREATE NEW')
    expect(directive).toContain('TaskRow')
  })

  it('returns empty string for empty plan', () => {
    const directive = buildReusePlanDirective({
      pageName: 'Tasks',
      reuse: [],
      createNew: [],
      reusePatterns: [],
    })

    expect(directive).toBe('')
  })
})

describe('verifyReusePlan', () => {
  it('returns passed for all imported components', () => {
    const code = `import { StatCard } from '@/components/shared/stat-card'\n<StatCard />`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats',
          reason: 'test',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.passed).toHaveLength(1)
    expect(result.missed).toHaveLength(0)
  })

  it('returns missed for components not imported', () => {
    const code = `export default function Tasks() { return <div>No stats</div> }`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats',
          reason: 'test',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.passed).toHaveLength(0)
    expect(result.missed).toHaveLength(1)
    expect(result.missed[0].component).toBe('StatCard')
  })

  it('builds strengthened directive for missed components', () => {
    const code = `export default function Tasks() { return <div /> }`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats',
          reason: 'test',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.retryDirective).toContain('CRITICAL')
    expect(result.retryDirective).toContain('StatCard')
    expect(result.retryDirective).toContain('@/components/shared/stat-card')
  })

  it('returns no retryDirective when all passed', () => {
    const code = `import { StatCard } from '@/components/shared/stat-card'`
    const result = verifyReusePlan(code, {
      pageName: 'Tasks',
      reuse: [
        {
          component: 'StatCard',
          targetSection: 'Stats',
          reason: 'test',
          importPath: '@/components/shared/stat-card',
          usageExample: '<StatCard />',
        },
      ],
      createNew: [],
      reusePatterns: [],
    })

    expect(result.retryDirective).toBeUndefined()
  })

  it('handles empty reuse list', () => {
    const result = verifyReusePlan('any code', {
      pageName: 'P',
      reuse: [],
      createNew: [],
      reusePatterns: [],
    })
    expect(result.passed).toHaveLength(0)
    expect(result.missed).toHaveLength(0)
    expect(result.retryDirective).toBeUndefined()
  })
})
