import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseNavTypeFromPlan,
  extractAppNameFromPrompt,
  buildSharedComponentsSummary,
  extractSharedComponents,
} from './split-generator.js'
import { inferPageType } from './modification-handler.js'
import { readAnchorPageCodeFromDisk } from './utils.js'

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

describe('readAnchorPageCodeFromDisk', () => {
  it('returns null when file does not exist', () => {
    const result = readAnchorPageCodeFromDisk('/nonexistent', '/')
    expect(result).toBeNull()
  })
})
