import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  ArchitecturePlanSchema,
  AtmosphereSchema,
  routeToKey,
  getPageGroup,
  getPageType,
  generateArchitecturePlan,
  generateSharedComponentsFromPlan,
  updateArchitecturePlan,
  savePlan,
  loadPlan,
  extractAtmosphereFromMessage,
  renderAtmosphereDirective,
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

describe('ArchitecturePlanSchema synonym normalization', () => {
  it('normalizes layout synonyms', () => {
    const plan = {
      groups: [
        { id: 'app', layout: 'horizontal', pages: ['/dashboard'] },
        { id: 'auth', layout: 'vertical', pages: ['/login'] },
        { id: 'marketing', layout: 'top', pages: ['/'] },
        { id: 'empty', layout: 'empty', pages: ['/404'] },
      ],
      sharedComponents: [],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.groups[0].layout).toBe('header')
      expect(result.data.groups[1].layout).toBe('sidebar')
      expect(result.data.groups[2].layout).toBe('header')
      expect(result.data.groups[3].layout).toBe('none')
    }
  })

  it('normalizes pageNote type synonyms', () => {
    const plan = {
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: {
        dashboard: { type: 'application', sections: ['Stats'] },
        home: { type: 'landing', sections: ['Hero'] },
        login: { type: 'authentication', sections: ['Form'] },
      },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageNotes['dashboard'].type).toBe('app')
      expect(result.data.pageNotes['home'].type).toBe('marketing')
      expect(result.data.pageNotes['login'].type).toBe('auth')
    }
  })

  it('normalizes component type synonyms', () => {
    const plan = {
      groups: [],
      sharedComponents: [
        { name: 'A', description: 'd', props: '{}', usedBy: ['/x'], type: 'component' },
        { name: 'B', description: 'd', props: '{}', usedBy: ['/x'], type: 'hero' },
      ],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents[0].type).toBe('widget')
      expect(result.data.sharedComponents[1].type).toBe('section')
    }
  })

  it('trims whitespace before normalization', () => {
    const plan = {
      groups: [{ id: 'app', layout: ' sidebar ', pages: ['/d'] }],
      sharedComponents: [],
      pageNotes: { d: { type: ' app ', sections: [] } },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.groups[0].layout).toBe('sidebar')
      expect(result.data.pageNotes['d'].type).toBe('app')
    }
  })

  it('still rejects truly invalid values', () => {
    const plan = {
      groups: [{ id: 'app', layout: 'foobar', pages: [] }],
      sharedComponents: [],
      pageNotes: {},
    }
    expect(ArchitecturePlanSchema.safeParse(plan).success).toBe(false)
  })
})

describe('ArchitecturePlanSchema safe defaults', () => {
  it('parses plan with missing sharedComponents and pageNotes', () => {
    const minimal = {
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
    }
    const result = ArchitecturePlanSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents).toEqual([])
      expect(result.data.pageNotes).toEqual({})
    }
  })

  it('parses shared component with missing props and description', () => {
    const plan = {
      groups: [],
      sharedComponents: [{ name: 'Card', usedBy: ['/dashboard'], type: 'widget' }],
      pageNotes: {},
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sharedComponents[0].props).toBe('{}')
      expect(result.data.sharedComponents[0].description).toBe('')
    }
  })

  it('parses pageNote with missing sections', () => {
    const plan = {
      groups: [],
      sharedComponents: [],
      pageNotes: { home: { type: 'marketing' } },
    }
    const result = ArchitecturePlanSchema.safeParse(plan)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pageNotes['home'].sections).toEqual([])
    }
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
  it('returns plan and empty warnings on success', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockResolvedValue({
        appName: 'TestApp',
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
        sharedComponents: [],
        pageNotes: { dashboard: { type: 'app', sections: ['Stats'] } },
      }),
    }

    const { plan, warnings } = await generateArchitecturePlan(
      [{ name: 'Dashboard', id: 'dashboard', route: '/dashboard' }],
      'Create a dashboard app',
      mockProvider as any,
      'sidebar',
    )
    expect(plan?.appName).toBe('TestApp')
    expect(plan?.groups[0].id).toBe('app')
    expect(warnings).toEqual([])
  })

  it('returns null plan with warnings on AI failure', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockRejectedValue(new Error('API timeout')),
    }

    const { plan, warnings } = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(plan).toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes('API timeout'))).toBe(true)
  })

  it('returns null plan with validation warnings on invalid schema', async () => {
    const mockProvider = {
      generateJSON: vi.fn().mockResolvedValue({ invalid: true }),
    }

    const { plan, warnings } = await generateArchitecturePlan([], 'test', mockProvider as any, null)
    expect(plan).toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('Validation')
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

describe('updateArchitecturePlan', () => {
  it('sends existing plan as context to AI and returns updated plan', async () => {
    const existingPlan = ArchitecturePlanSchema.parse({
      appName: 'MyApp',
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: { dashboard: { type: 'app', sections: ['Stats'] } },
    })
    const mockProvider = {
      generateJSON: vi.fn().mockResolvedValue({
        appName: 'MyApp',
        groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard', '/billing'] }],
        sharedComponents: [],
        pageNotes: {
          dashboard: { type: 'app', sections: ['Stats'] },
          billing: { type: 'app', sections: ['Plans table'] },
        },
      }),
    }
    const result = await updateArchitecturePlan(
      existingPlan,
      [{ name: 'Billing', id: 'billing', route: '/billing' }],
      'Add a billing page',
      mockProvider as any,
    )
    expect(result.groups[0].pages).toContain('/billing')
    expect(result.pageNotes['billing']).toBeDefined()
    expect(mockProvider.generateJSON).toHaveBeenCalled()
  })

  it('deterministically merges new pages into existing plan when AI update fails', async () => {
    const existingPlan = ArchitecturePlanSchema.parse({
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }],
      sharedComponents: [],
      pageNotes: {},
    })
    const mockProvider = {
      generateJSON: vi.fn().mockRejectedValue(new Error('AI fail')),
    }
    const result = await updateArchitecturePlan(
      existingPlan,
      [{ name: 'Billing', id: 'billing', route: '/billing' }],
      'Add billing',
      mockProvider as any,
    )
    expect(result.groups[0].pages).toContain('/billing')
    expect(result.pageNotes['billing']).toBeDefined()
    expect(result.pageNotes['billing'].type).toBe('app')
    expect(result.groups[0].pages).toContain('/dashboard')
  })
})

describe('generateSharedComponentsFromPlan', () => {
  it('returns generated component code for each planned component', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        requests: [
          {
            type: 'add-page',
            changes: {
              name: 'StatCard',
              pageCode:
                'import { Card } from "@/components/ui/card"\nexport default function StatCard({ label, value }: { label: string; value: string }) { return <Card><p>{label}</p><p>{value}</p></Card> }',
            },
          },
        ],
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
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
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, 'dark theme', '/tmp', mockProvider as any)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('StatCard')
    expect(results[0].code).toContain('export function StatCard')
    expect(results[0].code).not.toContain('export default')
  })

  it('skips components that fail generation', async () => {
    let callCount = 0
    const mockProvider = {
      parseModification: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) throw new Error('AI fail')
        return {
          requests: [
            {
              type: 'add-page',
              changes: {
                name: 'B',
                pageCode: 'export default function B() { return <div/> }',
              },
            },
          ],
        }
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        { name: 'A', description: 'd', props: '{}', usedBy: ['/x'], type: 'widget' },
        { name: 'B', description: 'd', props: '{}', usedBy: ['/x'], type: 'widget' },
      ],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, '', '/tmp', mockProvider as any)
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('B')
  })

  it('rejects code missing any export', async () => {
    const mockProvider = {
      parseModification: vi.fn().mockResolvedValue({
        requests: [
          {
            type: 'add-page',
            changes: {
              name: 'Bad',
              pageCode: 'function Bad() { return <div/> }',
            },
          },
        ],
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        {
          name: 'Bad',
          description: 'd',
          props: '{}',
          usedBy: ['/x'],
          type: 'widget',
        },
      ],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, '', '/tmp', mockProvider as any)
    expect(results).toHaveLength(0)
  })

  it('converts export default to named export in fallback path', async () => {
    let callCount = 0
    const mockProvider = {
      parseModification: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) throw new Error('batch fail')
        return {
          requests: [
            {
              type: 'add-page',
              changes: {
                name: 'FilterBar',
                pageCode: 'export default function FilterBar({ filters }: { filters: string[] }) { return <div/> }',
              },
            },
          ],
        }
      }),
    }
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [
        { name: 'Unused', description: 'd', props: '{}', usedBy: ['/x'], type: 'widget' },
        {
          name: 'FilterBar',
          description: 'Filter bar',
          props: '{ filters: string[] }',
          usedBy: ['/tasks'],
          type: 'form',
        },
      ],
      pageNotes: {},
    })
    const results = await generateSharedComponentsFromPlan(plan, '', '/tmp', mockProvider as any)
    expect(results).toHaveLength(1)
    expect(results[0].code).toContain('export function FilterBar')
    expect(results[0].code).not.toContain('export default')
  })
})

describe('extractAtmosphereFromMessage', () => {
  it('detects "premium and focused, Notion meets Linear" as dark-zinc monochrome tight', () => {
    const a = extractAtmosphereFromMessage(
      'Build a project app. The design should feel premium and focused — think Notion meets Linear.',
    )
    expect(a.background).toBe('dark-zinc')
    expect(a.spacing).toBe('tight')
    expect(a.accents).toBe('monochrome')
    expect(a.primaryHint).toBe('zinc')
    expect(a.fontStyle).toBe('mono-labels')
  })

  it('detects "bold and playful" as gradient-bold + multi-gradient', () => {
    const a = extractAtmosphereFromMessage('Make it bold and playful for consumer onboarding.')
    expect(a.background).toBe('gradient-bold')
    expect(a.heroLayout).toBe('centered-bold')
    expect(a.spacing).toBe('wide')
    expect(a.accents).toBe('multi-gradient')
  })

  it('detects "editorial" as left-editorial with serif headings', () => {
    const a = extractAtmosphereFromMessage('Editorial blog with long-form content.')
    expect(a.background).toBe('minimal-paper')
    expect(a.heroLayout).toBe('left-editorial')
    expect(a.fontStyle).toBe('serif-headings')
  })

  it('detects "developer" as code-bg + emerald primary', () => {
    const a = extractAtmosphereFromMessage('Developer tool with terminal vibe and CLI aesthetic.')
    expect(a.background).toBe('code-bg')
    expect(a.heroLayout).toBe('code-preview')
    expect(a.accents).toBe('code-mono')
    expect(a.primaryHint).toBe('emerald')
  })

  it('returns empty object for vague input', () => {
    const a = extractAtmosphereFromMessage('Build me an app')
    expect(Object.keys(a).length).toBe(0)
  })
})

describe('renderAtmosphereDirective', () => {
  it('emits empty string for undefined atmosphere', () => {
    expect(renderAtmosphereDirective(undefined)).toBe('')
  })

  it('emits empty string for default atmosphere with no mood phrase', () => {
    const def = AtmosphereSchema.parse({})
    expect(renderAtmosphereDirective(def)).toBe('')
  })

  it('emits imperative directive when atmosphere is non-default', () => {
    const out = renderAtmosphereDirective({
      moodPhrase: 'premium, Notion meets Linear',
      background: 'dark-zinc',
      heroLayout: 'split-text-image',
      spacing: 'tight',
      accents: 'monochrome',
      fontStyle: 'mono-labels',
      primaryHint: 'zinc',
    })
    expect(out).toContain('ATMOSPHERE DIRECTIVE')
    expect(out).toContain('bg-zinc-950')
    expect(out).toContain('mono')
    expect(out).toContain('REJECT these defaults')
  })
})
