import { describe, it, expect } from 'vitest'
import { parseNavTypeFromPlan, extractAppNameFromPrompt } from './split-generator.js'
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
