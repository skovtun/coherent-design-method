import { describe, expect, it } from 'vitest'
import {
  DETECT_MODE_SCRIPT,
  EXTRACT_COPY_TEXT_SCRIPT,
  EXTRACT_MEDIA_QUERIES_SCRIPT,
  HERO_DETECTION_SCRIPT,
  SAMPLE_COMPUTED_STYLES_SCRIPT,
  captureSnapshot,
  defaultSsrfGuard,
  type BrowserDriverFactory,
  type DnsLookupFn,
  type DnsLookupResult,
  type PageLike,
} from './browser-capture.js'
import { ExtractedAtmosphereSchema, URL_EXTRACT_SCHEMA_VERSION } from './types.js'

// Stub DNS lookup for deterministic hostname tests. Real network MUST NOT be
// hit by any test in this file — substitute via the `lookup` opts arg.
const stubLookup = (mapping: Record<string, DnsLookupResult[]>): DnsLookupFn => {
  return async (hostname: string) => {
    const result = mapping[hostname]
    if (!result) throw new Error(`stubLookup: no mapping for ${hostname}`)
    return result
  }
}
// Default: every hostname resolves to a public IPv4 (1.2.3.4). Lets the
// existing literal-checks suite run without touching the network.
const benignLookup: DnsLookupFn = async () => [{ address: '1.2.3.4', family: 4 }]

describe('url-extract bootstrap', () => {
  describe('in-page script strings', () => {
    it.each([
      ['HERO_DETECTION_SCRIPT', HERO_DETECTION_SCRIPT],
      ['SAMPLE_COMPUTED_STYLES_SCRIPT', SAMPLE_COMPUTED_STYLES_SCRIPT],
      ['EXTRACT_MEDIA_QUERIES_SCRIPT', EXTRACT_MEDIA_QUERIES_SCRIPT],
      ['DETECT_MODE_SCRIPT', DETECT_MODE_SCRIPT],
      ['EXTRACT_COPY_TEXT_SCRIPT', EXTRACT_COPY_TEXT_SCRIPT],
    ])('%s wraps an IIFE for page.evaluate', (_name, script) => {
      // self-invoking arrow form; must not reference module-scope identifiers
      expect(script.startsWith('(')).toBe(true)
      expect(script.endsWith(')()')).toBe(true)
      // Must NOT reference imports or top-level helpers
      expect(script).not.toMatch(/import\s/)
      expect(script).not.toMatch(/require\(/)
    })
  })

  describe('defaultSsrfGuard', () => {
    it('allows public https URLs (hostname → public IP)', async () => {
      await expect(defaultSsrfGuard('https://stripe.com', { lookup: benignLookup })).resolves.toBeUndefined()
      await expect(defaultSsrfGuard('http://example.com:8080/path', { lookup: benignLookup })).resolves.toBeUndefined()
    })

    it.each([
      ['file://etc/passwd', /scheme/],
      ['data:text/html,<script>', /scheme/],
      ['blob:https://x.com/abc', /scheme/],
      ['javascript:alert(1)', /scheme/],
    ])('blocks non-http schemes: %s', async (url, pattern) => {
      await expect(defaultSsrfGuard(url, { lookup: benignLookup })).rejects.toThrow(pattern)
    })

    it.each([
      ['http://localhost', /localhost/],
      ['http://127.0.0.1/x', /loopback/],
      ['http://10.0.0.5', /private IPv4/],
      ['http://192.168.1.1', /private IPv4/],
      ['http://172.16.0.1', /private IPv4/],
      ['http://172.31.255.255', /private IPv4/],
      ['http://169.254.169.254/latest/meta-data/', /metadata/],
    ])('blocks private/loopback/metadata IP literals: %s', async (url, pattern) => {
      await expect(defaultSsrfGuard(url, { lookup: benignLookup })).rejects.toThrow(pattern)
    })

    it('allows public IPs that look private but are not (172.32, 11.0)', async () => {
      await expect(defaultSsrfGuard('http://172.32.0.1', { lookup: benignLookup })).resolves.toBeUndefined()
      await expect(defaultSsrfGuard('http://11.0.0.1', { lookup: benignLookup })).resolves.toBeUndefined()
    })

    it('rejects malformed URLs', async () => {
      await expect(defaultSsrfGuard('not-a-url', { lookup: benignLookup })).rejects.toThrow(/URL_INVALID/)
    })

    // P1 fix coverage: hostnames that resolve to private IPs must be rejected
    // (the real bypass codex flagged on 2026-05-04). Pre-fix, the literal-string
    // hostname check passed and Playwright was free to fetch 10.x.
    it('blocks hostname that DNS-resolves to private IPv4', async () => {
      const lookup = stubLookup({
        'internal.example': [{ address: '10.0.0.5', family: 4 }],
      })
      await expect(defaultSsrfGuard('http://internal.example/', { lookup })).rejects.toThrow(/private IPv4 10\/8/)
    })

    it('blocks hostname that DNS-resolves to AWS metadata IP', async () => {
      const lookup = stubLookup({
        'rebound.example': [{ address: '169.254.169.254', family: 4 }],
      })
      await expect(defaultSsrfGuard('http://rebound.example/', { lookup })).rejects.toThrow(/metadata IPv4/)
    })

    it('blocks hostname with multiple A records if ANY resolves private', async () => {
      const lookup = stubLookup({
        'mixed.example': [
          { address: '1.2.3.4', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      })
      await expect(defaultSsrfGuard('http://mixed.example/', { lookup })).rejects.toThrow(/loopback IPv4/)
    })

    it('blocks hostname that DNS-resolves to IPv6 loopback / unique-local', async () => {
      const lookup = stubLookup({
        'v6loop.example': [{ address: '::1', family: 6 }],
        'v6ula.example': [{ address: 'fd00::1', family: 6 }],
      })
      await expect(defaultSsrfGuard('http://v6loop.example/', { lookup })).rejects.toThrow(/IPv6 loopback/)
      await expect(defaultSsrfGuard('http://v6ula.example/', { lookup })).rejects.toThrow(/IPv6 unique-local/)
    })

    it('blocks IPv4-mapped IPv6 that points at a private v4', async () => {
      const lookup = stubLookup({
        'v4mapped.example': [{ address: '::ffff:10.0.0.5', family: 6 }],
      })
      await expect(defaultSsrfGuard('http://v4mapped.example/', { lookup })).rejects.toThrow(/private IPv4 10\/8/)
    })

    it('rejects when DNS lookup itself fails (cannot resolve = cannot validate)', async () => {
      const lookup: DnsLookupFn = async () => {
        throw new Error('ENOTFOUND')
      }
      await expect(defaultSsrfGuard('http://nx.example/', { lookup })).rejects.toThrow(/dns_lookup_failed/)
    })

    it('rejects when DNS returns zero addresses', async () => {
      const lookup: DnsLookupFn = async () => []
      await expect(defaultSsrfGuard('http://empty.example/', { lookup })).rejects.toThrow(/dns_lookup_empty/)
    })
  })

  // P1 fix coverage: every redirect hop must be guarded BEFORE the browser
  // fetches it. captureSnapshot installs the interception via PageLike.
  describe('captureSnapshot redirect interception', () => {
    function makeStubDriver(initialResponse: { status: number; url: string }): {
      driver: BrowserDriverFactory
      capturedHandler: { current: ((u: string) => Promise<boolean>) | null }
    } {
      const capturedHandler = { current: null as ((u: string) => Promise<boolean>) | null }
      const page: PageLike = {
        async goto(url) {
          // Simulate Playwright invoking the route handler for the initial request.
          // If the handler aborts, we throw the way Playwright's goto would.
          if (capturedHandler.current) {
            const allow = await capturedHandler.current(url)
            if (!allow) throw new Error('net::ERR_ABORTED')
          }
          return { status: () => initialResponse.status, url: () => initialResponse.url }
        },
        async evaluate() {
          return null as never
        },
        async content() {
          return '<html></html>'
        },
        async screenshot() {
          return Buffer.from('')
        },
        async title() {
          return ''
        },
        url() {
          return initialResponse.url
        },
        async waitForTimeout() {},
        async close() {},
        async interceptMainFrameRequests(handler) {
          capturedHandler.current = handler
        },
      }
      const driver: BrowserDriverFactory = {
        async newPage() {
          return page
        },
        async close() {},
      }
      return { driver, capturedHandler }
    }

    it('aborts navigation when the initial URL would be redirected to a private IP', async () => {
      const { driver } = makeStubDriver({ status: 200, url: 'http://allowed.example/' })
      // Custom guard that rejects 169.254.169.254 specifically; simulates a
      // public→metadata redirect by failing the handler on the second URL.
      let firstCall = true
      const ssrfGuard = async (u: string) => {
        if (firstCall) {
          firstCall = false
          return // initial URL passes
        }
        if (u.includes('169.254.169.254')) throw new Error('URL_INVALID: metadata IPv4')
      }
      // Need a stub driver whose goto invokes the handler twice (initial + redirect).
      const capturedHandler = { current: null as ((u: string) => Promise<boolean>) | null }
      const page: PageLike = {
        async goto(url) {
          if (!capturedHandler.current) throw new Error('handler not installed')
          const ok1 = await capturedHandler.current(url)
          if (!ok1) throw new Error('net::ERR_ABORTED')
          // Simulate a redirect hop to the metadata IP.
          const ok2 = await capturedHandler.current('http://169.254.169.254/latest/meta-data/')
          if (!ok2) throw new Error('net::ERR_ABORTED')
          return { status: () => 200, url: () => url }
        },
        async evaluate() {
          return null as never
        },
        async content() {
          return ''
        },
        async screenshot() {
          return Buffer.from('')
        },
        async title() {
          return ''
        },
        url() {
          return ''
        },
        async waitForTimeout() {},
        async close() {},
        async interceptMainFrameRequests(handler) {
          capturedHandler.current = handler
        },
      }
      const driverWithRedirect: BrowserDriverFactory = {
        async newPage() {
          return page
        },
        async close() {},
      }
      await expect(captureSnapshot('http://allowed.example/', driverWithRedirect, { ssrfGuard })).rejects.toThrow(
        /navigation aborted at redirect target.*169\.254\.169\.254/,
      )
    })

    it('passes through when no redirect to private IP occurs', async () => {
      const { driver } = makeStubDriver({ status: 200, url: 'http://allowed.example/' })
      // Guard always allows for this happy path. captureSnapshot must resolve
      // (not get aborted by interception on a clean URL).
      const ssrfGuard = async () => {}
      const snapshot = await captureSnapshot('http://allowed.example/', driver, { ssrfGuard })
      expect(snapshot.url).toBe('http://allowed.example/')
      expect(snapshot.finalUrl).toBe('http://allowed.example/')
    })
  })

  describe('ExtractedAtmosphereSchema', () => {
    it('exposes the schema version constant', () => {
      expect(URL_EXTRACT_SCHEMA_VERSION).toBe('1')
    })

    it('rejects payload with mismatched schemaVersion', () => {
      const bad = { schemaVersion: '99' }
      const result = ExtractedAtmosphereSchema.safeParse(bad)
      expect(result.success).toBe(false)
    })

    it('accepts a minimal-valid payload', () => {
      const minimal = {
        schemaVersion: '1',
        source: { url: 'https://stripe.com', capturedAt: new Date().toISOString(), mode: 'light' },
        colors: [{ hex: '#635BFF' }],
        typography: { families: [{ family: 'Inter' }], scale: [] },
        spacing: [],
        radius: [],
        shadows: [],
        motion: { tokens: [] },
        backgrounds: { solid: [], roles: {} },
        gradients: [],
        patterns: [],
        glassmorphism: null,
        zIndexScale: [],
        focusRings: [],
        linkStates: { default: {}, hover: {} },
        formControlStates: {},
        breakpoints: { strategy: 'mobile-first', values: [] },
        containerWidths: [],
        borderStyles: [],
        iconStyle: { kind: 'unknown' },
        voice: { tone: [], samples: [] },
        density: 'comfortable',
        confidence: { overall: 'medium', perCategory: {} },
        missing: [],
      }
      const r = ExtractedAtmosphereSchema.safeParse(minimal)
      if (!r.success) console.error(JSON.stringify(r.error.format(), null, 2))
      expect(r.success).toBe(true)
    })
  })
})
