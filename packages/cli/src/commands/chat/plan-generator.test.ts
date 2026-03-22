import { describe, it, expect } from 'vitest'
import {
  ArchitecturePlanSchema,
  routeToKey,
  getPageGroup,
  getPageType,
} from './plan-generator.js'

describe('routeToKey', () => {
  it('strips leading slash', () => {
    expect(routeToKey('/dashboard')).toBe('dashboard')
  })
  it('returns "home" for root', () => {
    expect(routeToKey('/')).toBe('home')
  })
  it('handles nested routes', () => {
    expect(routeToKey('/projects/[id]')).toBe('projects/[id]')
  })
})

describe('ArchitecturePlanSchema', () => {
  const validPlan = {
    appName: 'TaskFlow',
    groups: [
      { id: 'app', layout: 'sidebar', pages: ['/dashboard', '/tasks'] },
      { id: 'auth', layout: 'none', pages: ['/login'] },
    ],
    sharedComponents: [
      {
        name: 'StatCard',
        description: 'Metric card',
        props: '{ label: string; value: string }',
        usedBy: ['/dashboard'],
        type: 'widget',
        shadcnDeps: ['card'],
      },
    ],
    pageNotes: {
      dashboard: { type: 'app', sections: ['Stats row', 'Tasks table'] },
      login: { type: 'auth', sections: ['Login form'] },
    },
  }

  it('parses a valid plan', () => {
    const result = ArchitecturePlanSchema.safeParse(validPlan)
    expect(result.success).toBe(true)
  })

  it('rejects plan with invalid layout type', () => {
    const bad = { ...validPlan, groups: [{ id: 'x', layout: 'invalid', pages: [] }] }
    expect(ArchitecturePlanSchema.safeParse(bad).success).toBe(false)
  })

  it('defaults shadcnDeps to empty array', () => {
    const noDeps = {
      ...validPlan,
      sharedComponents: [
        {
          name: 'X',
          description: 'd',
          props: '{}',
          usedBy: ['/a'],
          type: 'widget',
        },
      ],
    }
    const result = ArchitecturePlanSchema.parse(noDeps)
    expect(result.sharedComponents[0].shadcnDeps).toEqual([])
  })

  it('caps sharedComponents at 8', () => {
    const tooMany = {
      ...validPlan,
      sharedComponents: Array.from({ length: 9 }, (_, i) => ({
        name: `C${i}`,
        description: 'd',
        props: '{}',
        usedBy: ['/a'],
        type: 'widget',
      })),
    }
    expect(ArchitecturePlanSchema.safeParse(tooMany).success).toBe(false)
  })
})

describe('getPageGroup', () => {
  const plan = ArchitecturePlanSchema.parse({
    groups: [
      { id: 'app', layout: 'sidebar', pages: ['/dashboard'] },
      { id: 'auth', layout: 'none', pages: ['/login'] },
    ],
    sharedComponents: [],
    pageNotes: {},
  })

  it('finds group for known route', () => {
    expect(getPageGroup('/dashboard', plan)?.id).toBe('app')
  })

  it('returns undefined for unknown route', () => {
    expect(getPageGroup('/unknown', plan)).toBeUndefined()
  })
})

describe('getPageType', () => {
  const plan = ArchitecturePlanSchema.parse({
    groups: [],
    sharedComponents: [],
    pageNotes: {
      dashboard: { type: 'app', sections: [] },
      home: { type: 'marketing', sections: [] },
    },
  })

  it('returns type from pageNotes', () => {
    expect(getPageType('/dashboard', plan)).toBe('app')
  })

  it('returns type for root route', () => {
    expect(getPageType('/', plan)).toBe('marketing')
  })

  it('defaults to app for unknown page', () => {
    expect(getPageType('/unknown', plan)).toBe('app')
  })
})
