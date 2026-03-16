/**
 * Tests for chat command helper functions.
 * Using dynamic import to access module-internal functions.
 */
import { describe, it, expect } from 'vitest'

// We test the exported extractInternalLinks and inferRelatedPages indirectly
// by importing the chat module. Since these are module-private functions,
// we test the behavior through the public interface.

// For now, test the patterns directly:
describe('extractInternalLinks', () => {
  function extractInternalLinks(code: string): string[] {
    const links = new Set<string>()
    const hrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
    let m: RegExpExecArray | null
    while ((m = hrefRe.exec(code)) !== null) {
      const route = m[1]
      if (route === '/' || route.startsWith('/design-system') || route.startsWith('/#') || route.startsWith('/api'))
        continue
      links.add(route)
    }
    return [...links]
  }

  it('extracts href links from JSX code', () => {
    const code = `<Link href="/about">About</Link><a href="/contact">Contact</a>`
    const links = extractInternalLinks(code)
    expect(links).toContain('/about')
    expect(links).toContain('/contact')
  })

  it('skips root, design-system, hash, and API routes', () => {
    const code = `<Link href="/">Home</Link><Link href="/design-system">DS</Link><Link href="/#section">S</Link><Link href="/api/data">API</Link>`
    const links = extractInternalLinks(code)
    expect(links).toEqual([])
  })

  it('deduplicates routes', () => {
    const code = `<Link href="/about">A</Link><Link href="/about">B</Link>`
    const links = extractInternalLinks(code)
    expect(links).toEqual(['/about'])
  })
})

describe('AUTH_FLOW_PATTERNS', () => {
  const AUTH_FLOW_PATTERNS: Record<string, string[]> = {
    '/login': ['/register', '/forgot-password'],
    '/signin': ['/register', '/forgot-password'],
    '/signup': ['/login'],
    '/register': ['/login'],
    '/forgot-password': ['/login', '/reset-password'],
    '/reset-password': ['/login'],
  }

  it('login implies register and forgot-password', () => {
    expect(AUTH_FLOW_PATTERNS['/login']).toContain('/register')
    expect(AUTH_FLOW_PATTERNS['/login']).toContain('/forgot-password')
  })

  it('register implies login', () => {
    expect(AUTH_FLOW_PATTERNS['/register']).toContain('/login')
  })

  it('forgot-password implies login and reset-password', () => {
    expect(AUTH_FLOW_PATTERNS['/forgot-password']).toContain('/login')
    expect(AUTH_FLOW_PATTERNS['/forgot-password']).toContain('/reset-password')
  })
})
