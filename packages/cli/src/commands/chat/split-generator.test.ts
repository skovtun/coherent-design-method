import { describe, it, expect } from 'vitest'
import { parseNavTypeFromPlan, extractAppNameFromPrompt, buildSharedComponentsSummary } from './split-generator.js'
import { inferPageType } from './modification-handler.js'

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
      shared: [{
        id: 'CID-001', name: 'Header', type: 'layout' as const,
        file: 'components/shared/header.tsx', usedIn: [],
        description: 'Main header',
      }],
      nextId: 2,
    }
    const result = buildSharedComponentsSummary(manifest)!
    expect(result).toContain('CID-001 Header (layout)')
    expect(result).toContain('Import: @/components/shared/header')
    expect(result).not.toContain('Props:')
  })

  it('includes propsInterface when present', () => {
    const manifest = {
      shared: [{
        id: 'CID-003', name: 'FeatureCard', type: 'section' as const,
        file: 'components/shared/feature-card.tsx', usedIn: [],
        description: 'Feature card',
        propsInterface: '{ icon: React.ReactNode; title: string }',
      }],
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
