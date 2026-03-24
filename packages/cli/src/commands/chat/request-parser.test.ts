import { describe, it, expect } from 'vitest'
import { inferRelatedPages, detectExplicitRootPage, isAppOnlyRequest, normalizeRequest } from './request-parser.js'
import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'

describe('inferRelatedPages', () => {
  it('infers /reset-password transitively from /login', () => {
    const pages = [{ name: 'Login', id: 'login', route: '/login' }]
    const inferred = inferRelatedPages(pages)
    const routes = inferred.map(p => p.route)
    expect(routes).toContain('/forgot-password')
    expect(routes).toContain('/reset-password')
  })

  it('infers /reset-password directly from /forgot-password', () => {
    const pages = [{ name: 'Forgot Password', id: 'forgot-password', route: '/forgot-password' }]
    const inferred = inferRelatedPages(pages)
    expect(inferred.map(p => p.route)).toContain('/reset-password')
  })

  it('does not produce infinite loops with circular refs', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Sign Up', id: 'signup', route: '/signup' },
    ]
    const inferred = inferRelatedPages(pages)
    const routes = inferred.map(p => p.route)
    expect(routes).not.toContain('/login')
    expect(routes).not.toContain('/signup')
    expect(routes).toContain('/forgot-password')
  })

  it('does not duplicate already-planned pages', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Forgot Password', id: 'forgot-password', route: '/forgot-password' },
    ]
    const inferred = inferRelatedPages(pages)
    const forgotCount = inferred.filter(p => p.route === '/forgot-password').length
    expect(forgotCount).toBe(0)
  })
})

describe('detectExplicitRootPage', () => {
  it('detects "main page is registration"', () => {
    const pages = [
      { name: 'Registration', id: 'signup', route: '/signup' },
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    ]
    expect(detectExplicitRootPage('main page is registration', pages)).toBe('signup')
  })

  it('detects "start with login page"', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    ]
    expect(detectExplicitRootPage('create an app, start with login page', pages)).toBe('login')
  })

  it('detects Russian "стартовая страница — регистрация"', () => {
    const pages = [
      { name: 'Registration', id: 'signup', route: '/signup' },
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    ]
    expect(detectExplicitRootPage('стартовая страница — registration, потом dashboard', pages)).toBe('signup')
  })

  it('returns null when no explicit root', () => {
    const pages = [
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
      { name: 'Settings', id: 'settings', route: '/settings' },
    ]
    expect(detectExplicitRootPage('create a dashboard app', pages)).toBeNull()
  })
})

describe('isAppOnlyRequest', () => {
  it('returns true for auth + app pages only', () => {
    const pages = [
      { name: 'Login', id: 'login', route: '/login' },
      { name: 'Dashboard', id: 'dashboard', route: '/dashboard' },
    ]
    expect(isAppOnlyRequest(pages)).toBe(true)
  })

  it('returns false when marketing pages exist', () => {
    const pages = [
      { name: 'Pricing', id: 'pricing', route: '/pricing' },
      { name: 'About', id: 'about', route: '/about' },
    ]
    expect(isAppOnlyRequest(pages)).toBe(false)
  })

  it('returns true for single auth page', () => {
    const pages = [{ name: 'Login', id: 'login', route: '/login' }]
    expect(isAppOnlyRequest(pages)).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(isAppOnlyRequest([])).toBe(false)
  })
})

const MINIMAL_CONFIG = {
  name: 'Test',
  pages: [],
  components: [],
  tokens: { colors: { light: {}, dark: {} } },
  settings: { appType: 'saas' },
} as unknown as DesignSystemConfig

describe('normalizeRequest — update-token color auto-conversion', () => {
  it('converts CSS color name to hex', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: 'indigo' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#4B0082')
  })

  it('converts Tailwind color name to hex', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.dark.primary',
      changes: { value: 'indigo-500' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#6366F1')
  })

  it('passes through valid hex unchanged', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: '#4F46E5' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('#4F46E5')
  })

  it('does not convert non-color token paths', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'spacing.md',
      changes: { value: '1.5rem' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('1.5rem')
  })

  it('leaves unrecognized values untouched for color paths', () => {
    const req: ModificationRequest = {
      type: 'update-token',
      target: 'colors.light.primary',
      changes: { value: 'some-random-string' },
    }
    const result = normalizeRequest(req, MINIMAL_CONFIG) as ModificationRequest
    expect(result.changes.value).toBe('some-random-string')
  })
})
