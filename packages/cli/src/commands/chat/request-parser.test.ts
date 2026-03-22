import { describe, it, expect } from 'vitest'
import { inferRelatedPages } from './request-parser.js'

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
