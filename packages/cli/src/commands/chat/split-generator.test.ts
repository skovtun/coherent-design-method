import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseNavTypeFromPlan,
  extractAppNameFromPrompt,
  buildSharedComponentsSummary,
  buildSharedComponentsNote,
  extractSharedComponents,
  formatPlanSummary,
} from './split-generator.js'
import { ArchitecturePlanSchema } from './plan-generator.js'
import { inferPageType } from './modification-handler.js'
import { detectPageType } from '../../agents/page-templates.js'
import { readAnchorPageCodeFromDisk } from './utils.js'
import { buildLightweightPagePrompt } from '../../agents/modifier.js'

vi.mock('../../utils/ai-provider.js', () => ({
  createAIProvider: vi.fn(),
}))

vi.mock('../../providers/index.js', () => ({
  getComponentProvider: vi.fn(() => ({
    listNames: () => ['Button', 'Card', 'Input'],
    installComponent: vi.fn(async () => ({ success: true, componentDef: null })),
  })),
}))

vi.mock('@getcoherent/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@getcoherent/core')>()
  return {
    ...actual,
    loadManifest: vi.fn(async () => ({ shared: [], nextId: 1 })),
    generateSharedComponent: vi.fn(async (_root: string, input: { name: string }) => ({
      id: `CID-001`,
      name: input.name,
      file: `components/shared/${input.name.toLowerCase().replace(/([A-Z])/g, (m: string, c: string, i: number) => (i ? `-${c.toLowerCase()}` : c.toLowerCase()))}.tsx`,
    })),
  }
})

vi.mock('../../utils/quality-validator.js', () => ({
  autoFixCode: vi.fn(async (code: string) => ({ code, fixes: [] })),
}))

describe('parseNavTypeFromPlan', () => {
  it('extracts sidebar navType from plan response', () => {
    const planResult = {
      requests: [{ type: 'add-page', changes: { id: 'dashboard', name: 'Dashboard', route: '/dashboard' } }],
      navigation: { type: 'sidebar' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('sidebar')
  })

  it('extracts both navType', () => {
    const planResult = {
      requests: [],
      navigation: { type: 'both' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('both')
  })

  it('defaults to header when no navigation field', () => {
    const planResult = {
      requests: [{ type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } }],
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })

  it('defaults to header for invalid navType', () => {
    const planResult = {
      requests: [],
      navigation: { type: 'invalid-type' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })

  it('defaults to header when navigation is null', () => {
    const planResult = {
      requests: [],
      navigation: null,
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })
})

describe('extractAppNameFromPrompt', () => {
  it('extracts name from "called X"', () => {
    expect(extractAppNameFromPrompt('Build a project management app called TaskFlow')).toBe('TaskFlow')
  })

  it('extracts name from quoted "called"', () => {
    expect(extractAppNameFromPrompt('Create an app called "MyApp"')).toBe('MyApp')
  })

  it('extracts name from "build X app"', () => {
    expect(extractAppNameFromPrompt('build TaskFlow app with dashboard')).toBe('TaskFlow')
  })

  it('returns null when no app name', () => {
    expect(extractAppNameFromPrompt('add a login page and dashboard')).toBeNull()
  })

  it('skips generic words', () => {
    expect(extractAppNameFromPrompt('build a new app with login')).toBeNull()
  })
})

describe('buildSharedComponentsSummary', () => {
  it('returns undefined for empty manifest', () => {
    const manifest = { shared: [], nextId: 1 }
    expect(buildSharedComponentsSummary(manifest)).toBeUndefined()
  })

  it('formats entry without propsInterface', () => {
    const manifest = {
      shared: [
        {
          id: 'CID-001',
          name: 'Header',
          type: 'layout' as const,
          file: 'components/shared/header.tsx',
          usedIn: [],
          description: 'Main header',
        },
      ],
      nextId: 2,
    }
    const result = buildSharedComponentsSummary(manifest)!
    expect(result).toContain('CID-001 Header (layout)')
    expect(result).toContain('Import: @/components/shared/header')
    expect(result).not.toContain('Props:')
  })

  it('includes propsInterface when present', () => {
    const manifest = {
      shared: [
        {
          id: 'CID-003',
          name: 'FeatureCard',
          type: 'section' as const,
          file: 'components/shared/feature-card.tsx',
          usedIn: [],
          description: 'Feature card',
          propsInterface: '{ icon: React.ReactNode; title: string }',
        },
      ],
      nextId: 4,
    }
    const result = buildSharedComponentsSummary(manifest)!
    expect(result).toContain('CID-003 FeatureCard (section)')
    expect(result).toContain('Props: { icon: React.ReactNode; title: string }')
  })
})

describe('buildSharedComponentsNote', () => {
  it('returns note with summary when provided', () => {
    const summary = 'CID-001 FeatureCard (section)\n  Import: @/components/shared/feature-card'
    const result = buildSharedComponentsNote(summary)
    expect(result).toContain('SHARED COMPONENTS')
    expect(result).toContain('MANDATORY REUSE')
    expect(result).toContain('CID-001 FeatureCard')
  })

  it('returns undefined when summary is undefined', () => {
    const result = buildSharedComponentsNote(undefined)
    expect(result).toBeUndefined()
  })

  it('returns undefined when summary is empty', () => {
    const result = buildSharedComponentsNote('')
    expect(result).toBeUndefined()
  })
})

describe('inferPageType', () => {
  it('infers login from route', () => {
    expect(inferPageType('/login', 'Login')).toBe('login')
  })

  it('infers register from sign-up route', () => {
    expect(inferPageType('/sign-up', 'Sign Up')).toBe('register')
  })

  it('infers dashboard from name', () => {
    expect(inferPageType('/app', 'Dashboard')).toBe('dashboard')
  })

  it('infers pricing from route', () => {
    expect(inferPageType('/pricing', 'Plans')).toBe('pricing')
  })

  it('returns null for unknown page', () => {
    expect(inferPageType('/projects', 'Projects')).toBeNull()
  })

  it('infers team from route', () => {
    expect(inferPageType('/team', 'Team')).toBe('team')
  })

  it('infers tasks from route', () => {
    expect(inferPageType('/tasks', 'Tasks')).toBe('tasks')
  })

  it('infers task-detail from route with [id]', () => {
    expect(inferPageType('/tasks/[id]', 'Task Detail')).toBe('task-detail')
  })

  it('infers reset-password from route', () => {
    expect(inferPageType('/reset-password', 'Reset Password')).toBe('reset-password')
  })

  it('infers profile from route', () => {
    expect(inferPageType('/profile', 'Profile')).toBe('profile')
  })
})

function makeCode(lines: number): string {
  return Array(lines).fill('// line of code').join('\n')
}

describe('extractSharedComponents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns extracted components from valid AI response', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const { generateSharedComponent } = await import('@getcoherent/core')

    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [
          {
            name: 'FeatureCard',
            type: 'section',
            description: 'A feature card',
            propsInterface: '{ title: string }',
            code: makeCode(15),
          },
        ],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
    expect(generateSharedComponent).toHaveBeenCalledWith(
      '/tmp/project',
      expect.objectContaining({
        name: 'FeatureCard',
        type: 'section',
        description: 'A feature card',
        propsInterface: '{ title: string }',
      }),
    )
  })

  it('returns empty when AI provider does not support extraction', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    vi.mocked(createAIProvider).mockResolvedValue({} as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('filters out components with shadcn name collision', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')

    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [
          {
            name: 'Card',
            type: 'section',
            description: 'Collides with shadcn',
            propsInterface: '{}',
            code: makeCode(15),
          },
        ],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('filters out components with fewer than 10 lines', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')

    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [
          {
            name: 'Tiny',
            type: 'widget',
            description: 'Too small',
            propsInterface: '{}',
            code: makeCode(5),
          },
        ],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
  })

  it('handles AI failure gracefully', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')

    const mockAI = {
      extractSharedComponents: vi.fn(async () => {
        throw new Error('API error')
      }),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)
    expect(result.summary).toBeUndefined()
  })

  it('filters out components matching existing manifest names', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const { loadManifest } = await import('@getcoherent/core')

    vi.mocked(loadManifest).mockResolvedValue({
      shared: [{ id: 'CID-001', name: 'Header', type: 'layout', file: 'components/shared/header.tsx', usedIn: [] }],
      nextId: 2,
    })

    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [
          {
            name: 'Header',
            type: 'section',
            description: 'Duplicate of existing',
            propsInterface: '{}',
            code: makeCode(15),
          },
        ],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(0)

    // Restore default mock
    vi.mocked(loadManifest).mockResolvedValue({ shared: [], nextId: 1 })
  })

  it('keeps first when duplicate names in AI response', async () => {
    const { createAIProvider } = await import('../../utils/ai-provider.js')
    const { generateSharedComponent } = await import('@getcoherent/core')

    const mockAI = {
      extractSharedComponents: vi.fn(async () => ({
        components: [
          { name: 'FeatureCard', type: 'section', description: 'First', propsInterface: '{}', code: makeCode(15) },
          { name: 'FeatureCard', type: 'widget', description: 'Duplicate', propsInterface: '{}', code: makeCode(15) },
        ],
      })),
    }
    vi.mocked(createAIProvider).mockResolvedValue(mockAI as any)

    const result = await extractSharedComponents(makeCode(20), '/tmp/project', 'auto')
    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
    expect(generateSharedComponent).toHaveBeenCalledTimes(1)
  })
})

describe('detectPageType for auth pages', () => {
  it('returns register for register page', () => {
    expect(detectPageType('register')).toBe('register')
  })

  it('returns register for Register (capitalized)', () => {
    expect(detectPageType('Register')).toBe('register')
  })

  it('returns register for signup', () => {
    expect(detectPageType('signup')).toBe('register')
  })

  it('returns register for Sign Up', () => {
    expect(detectPageType('Sign Up')).toBe('register')
  })

  it('returns login for existing login patterns', () => {
    expect(detectPageType('login')).toBe('login')
    expect(detectPageType('signin')).toBe('login')
  })
})

describe('buildLightweightPagePrompt', () => {
  it('produces minimal prompt with page name and route', () => {
    const prompt = buildLightweightPagePrompt('Dashboard', '/dashboard', 'Use dark theme with cards.')
    expect(prompt).toContain('Dashboard')
    expect(prompt).toContain('/dashboard')
    expect(prompt).toContain('dark theme')
    expect(prompt).toContain('default export')
  })

  it('includes shared components summary when provided', () => {
    const prompt = buildLightweightPagePrompt('Projects', '/projects', '', 'CID-001 Header (layout)')
    expect(prompt).toContain('CID-001 Header')
  })

  it('omits shared components when not provided', () => {
    const prompt = buildLightweightPagePrompt('About', '/about', 'light theme')
    expect(prompt).not.toContain('shared components')
  })
})

describe('readAnchorPageCodeFromDisk', () => {
  it('returns null when file does not exist', () => {
    const result = readAnchorPageCodeFromDisk('/nonexistent', '/')
    expect(result).toBeNull()
  })
})

describe('formatPlanSummary', () => {
  it('formats groups and shared components for prompt', () => {
    const plan = ArchitecturePlanSchema.parse({
      groups: [
        { id: 'public', layout: 'header', pages: ['/', '/features'] },
        { id: 'app', layout: 'sidebar', pages: ['/dashboard', '/tasks'] },
      ],
      sharedComponents: [
        {
          name: 'StatsCard',
          description: 'Dashboard statistics card',
          props: '{ title: string; value: number }',
          usedBy: ['/dashboard'],
          type: 'widget',
          shadcnDeps: ['card'],
        },
      ],
      pageNotes: {
        dashboard: { type: 'app', sections: ['stats', 'table'] },
      },
    })

    const summary = formatPlanSummary(plan)
    expect(summary).toContain('public')
    expect(summary).toContain('header')
    expect(summary).toContain('app')
    expect(summary).toContain('sidebar')
    expect(summary).toContain('StatsCard')
    expect(summary).toContain('Dashboard statistics card')
  })

  it('returns empty string for plan with no groups', () => {
    const plan = ArchitecturePlanSchema.parse({
      groups: [],
      sharedComponents: [],
      pageNotes: {},
    })
    const summary = formatPlanSummary(plan)
    expect(summary).toBe('')
  })
})
