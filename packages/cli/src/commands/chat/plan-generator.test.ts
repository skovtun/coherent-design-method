import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  ArchitecturePlanSchema,
  routeToKey,
  getPageGroup,
  getPageType,
  generateArchitecturePlan,
  savePlan,
  loadPlan,
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

describe('generateArchitecturePlan', () => {
  it('returns parsed plan from AI response', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        appName: 'TestApp',
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
        sharedComponents: [],
        pageNotes: { dashboard: { type: 'app', sections: ['Stats'] } },
      }),
    }

    const result = await generateArchitecturePlan(
      [{ name: 'Dashboard', id: 'dashboard', route: '/dashboard' }],
      'Create a dashboard app',
      mockProvider as any,
      'sidebar',
    )
    expect(result?.appName).toBe('TestApp')
    expect(result?.groups[0].id).toBe('app')
  })

  it('returns null on AI failure', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockRejectedValue(new Error('fail')),
    }

    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result).toBeNull()
  })

  it('returns null on invalid schema', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({ invalid: true }),
    }

    const result = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(result).toBeNull()
  })
})

describe('savePlan / loadPlan', () => {
  it('saves and loads plan from .coherent/plan.json', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-'))
    mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
    const plan = ArchitecturePlanSchema.parse({
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dash'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    savePlan(tmpDir, plan)
    const loaded = loadPlan(tmpDir)
    expect(loaded?.groups[0].id).toBe('app')
    rmSync(tmpDir, { recursive: true })
  })

  it('loadPlan returns null when file missing', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-missing-'))
    expect(loadPlan(tmpDir)).toBeNull()
    rmSync(tmpDir, { recursive: true })
  })

  it('loadPlan returns null on corrupt JSON', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-corrupt-'))
    mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
    writeFileSync(join(tmpDir, '.coherent', 'plan.json'), 'not json')
    expect(loadPlan(tmpDir)).toBeNull()
    rmSync(tmpDir, { recursive: true })
  })

  it('savePlan clears cached plan', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'plan-cache-'))
    mkdirSync(join(tmpDir, '.coherent'), { recursive: true })
    const planV1 = ArchitecturePlanSchema.parse({
      groups: [{ id: 'v1', layout: 'sidebar', pages: ['/a'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    const planV2 = ArchitecturePlanSchema.parse({
      groups: [{ id: 'v2', layout: 'header', pages: ['/b'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    savePlan(tmpDir, planV1)
    loadPlan(tmpDir) // populates cache
    savePlan(tmpDir, planV2) // must clear cache
    const loaded = loadPlan(tmpDir)
    expect(loaded?.groups[0].id).toBe('v2')
    rmSync(tmpDir, { recursive: true })
  })
})
