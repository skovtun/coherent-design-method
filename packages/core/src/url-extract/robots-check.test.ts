import { describe, it, expect, vi } from 'vitest'
import { defaultRobotsCheck, parseRobots, matchPath, patternMatches } from './robots-check.js'

describe('patternMatches', () => {
  it('empty pattern → matches all', () => {
    expect(patternMatches('/foo', '')).toBe(true)
  })

  it('plain prefix match', () => {
    expect(patternMatches('/private/page', '/private')).toBe(true)
    expect(patternMatches('/public/page', '/private')).toBe(false)
  })

  it('* wildcard matches any sequence', () => {
    expect(patternMatches('/foo/123/bar', '/foo/*/bar')).toBe(true)
    expect(patternMatches('/foo.pdf', '/*.pdf')).toBe(true)
    expect(patternMatches('/foo.html', '/*.pdf')).toBe(false)
  })

  it('$ end anchor', () => {
    expect(patternMatches('/foo.pdf', '/*.pdf$')).toBe(true)
    expect(patternMatches('/foo.pdf?ref=1', '/*.pdf$')).toBe(false)
  })

  it('regex metachars in path are escaped (no injection)', () => {
    expect(patternMatches('/a.b', '/a.b')).toBe(true)
    expect(patternMatches('/aXb', '/a.b')).toBe(false) // . is literal, not regex
  })
})

describe('parseRobots', () => {
  it('returns rules from User-agent: * group when no specific match', () => {
    const body = `User-agent: *\nDisallow: /admin\nAllow: /admin/public`
    const rules = parseRobots(body, 'AnyBot')
    expect(rules).toHaveLength(2)
    expect(rules[0]).toEqual({ kind: 'disallow', pattern: '/admin' })
    expect(rules[1]).toEqual({ kind: 'allow', pattern: '/admin/public' })
  })

  it('specific UA group OVERRIDES * group when matched', () => {
    const body = `
User-agent: *
Disallow: /

User-agent: CoherentExtractBot
Disallow: /private
    `
    const rules = parseRobots(body, 'CoherentExtractBot')
    expect(rules).toHaveLength(1)
    expect(rules[0].pattern).toBe('/private')
  })

  it('UA match is case-insensitive substring', () => {
    const body = `User-agent: googlebot\nDisallow: /no-google\nUser-agent: *\nDisallow: /general`
    const rules = parseRobots(body, 'Mozilla/5.0 (compatible; Googlebot/2.1)')
    expect(rules[0].pattern).toBe('/no-google')
  })

  it('comments and blank lines ignored', () => {
    const body = `# header comment\n\nUser-agent: *\nDisallow: /admin # inline comment\n`
    const rules = parseRobots(body, 'X')
    expect(rules[0].pattern).toBe('/admin')
  })

  it('no User-agent line → empty rules', () => {
    expect(parseRobots('Disallow: /admin', 'X')).toEqual([])
  })

  it('groups multiple UAs sharing rules', () => {
    const body = `User-agent: A\nUser-agent: B\nDisallow: /shared`
    expect(parseRobots(body, 'A')[0].pattern).toBe('/shared')
    expect(parseRobots(body, 'B')[0].pattern).toBe('/shared')
  })
})

describe('matchPath', () => {
  it('no rules → allowed', () => {
    expect(matchPath('/foo', [])).toEqual({ allowed: true, reason: 'allowed-by-rule' })
  })

  it('Disallow: / → blocks everything', () => {
    const r = matchPath('/anything', [{ kind: 'disallow', pattern: '/' }])
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('disallowed-by-rule')
  })

  it('Disallow: /private → /private/foo blocked, /public allowed', () => {
    const rules = [{ kind: 'disallow' as const, pattern: '/private' }]
    expect(matchPath('/private/foo', rules).allowed).toBe(false)
    expect(matchPath('/public/foo', rules).allowed).toBe(true)
  })

  it('Allow + Disallow: longest match wins', () => {
    const rules = [
      { kind: 'disallow' as const, pattern: '/' },
      { kind: 'allow' as const, pattern: '/public' },
    ]
    expect(matchPath('/public/page', rules).allowed).toBe(true)
    expect(matchPath('/other', rules).allowed).toBe(false)
  })

  it('tie length: Allow wins (RFC 9309 §2.2.2)', () => {
    const rules = [
      { kind: 'disallow' as const, pattern: '/x' },
      { kind: 'allow' as const, pattern: '/x' },
    ]
    expect(matchPath('/x', rules).allowed).toBe(true)
  })

  it('empty Disallow value = allow all (legacy convention)', () => {
    const rules = [{ kind: 'disallow' as const, pattern: '' }]
    expect(matchPath('/anything', rules).allowed).toBe(true)
  })

  it('matchedRule field reports which rule fired', () => {
    const rules = [{ kind: 'disallow' as const, pattern: '/admin' }]
    const r = matchPath('/admin/users', rules)
    expect(r.matchedRule).toBe('Disallow: /admin')
  })
})

describe('defaultRobotsCheck (fail-open)', () => {
  it('404 robots.txt → allowed (no-robots-txt)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    const r = await defaultRobotsCheck('https://example.com/page', { fetchImpl })
    expect(r).toEqual({ allowed: true, reason: 'no-robots-txt' })
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/robots.txt', expect.any(Object))
  })

  it('does NOT follow redirects — passes redirect:"manual" (SSRF guard)', async () => {
    // The SSRF guard only vets robotsUrl; without redirect:'manual' a hostile
    // server could 302 the robots.txt request into cloud-metadata/internal hosts.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 302 } as Response)
    await defaultRobotsCheck('https://example.com/page', { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/robots.txt',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('network error → allowed (fetch-failed)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ENETUNREACH'))
    const r = await defaultRobotsCheck('https://example.com/page', { fetchImpl })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('fetch-failed')
  })

  it('robots.txt with Disallow: / → blocked', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'User-agent: *\nDisallow: /',
    } as Response)
    const r = await defaultRobotsCheck('https://example.com/page', { fetchImpl })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('disallowed-by-rule')
  })

  it('robots.txt with no Disallow → allowed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'User-agent: *\nAllow: /',
    } as Response)
    const r = await defaultRobotsCheck('https://example.com/page', { fetchImpl })
    expect(r.allowed).toBe(true)
  })

  it('runs SSRF guard on robots.txt URL', async () => {
    const ssrfGuard = vi.fn().mockResolvedValue(undefined)
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    await defaultRobotsCheck('https://example.com/page', { ssrfGuard, fetchImpl })
    expect(ssrfGuard).toHaveBeenCalledWith('https://example.com/robots.txt')
  })

  it('SSRF guard rejection → fail-open (caller will catch nav)', async () => {
    const ssrfGuard = vi.fn().mockRejectedValue(new Error('PRIVATE_IP'))
    const fetchImpl = vi.fn()
    const r = await defaultRobotsCheck('https://example.com/page', { ssrfGuard, fetchImpl })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('fetch-failed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('malformed URL → allowed (no-robots-txt)', async () => {
    const r = await defaultRobotsCheck('not-a-url')
    expect(r.allowed).toBe(true)
    expect(r.reason).toBe('no-robots-txt')
  })

  it('honors path-specific rule from real robots.txt example', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
User-agent: *
Disallow: /admin/
Disallow: /private/
Allow: /admin/public/
      `,
    } as Response)

    const blocked = await defaultRobotsCheck('https://example.com/admin/users', { fetchImpl })
    expect(blocked.allowed).toBe(false)

    const allowed = await defaultRobotsCheck('https://example.com/admin/public/page', { fetchImpl })
    expect(allowed.allowed).toBe(true)

    const home = await defaultRobotsCheck('https://example.com/', { fetchImpl })
    expect(home.allowed).toBe(true)
  })
})
