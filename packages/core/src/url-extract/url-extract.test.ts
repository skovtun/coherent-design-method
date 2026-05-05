import { describe, expect, it } from 'vitest'
import {
  DETECT_MODE_SCRIPT,
  EXTRACT_COPY_TEXT_SCRIPT,
  EXTRACT_MEDIA_QUERIES_SCRIPT,
  EXTRACT_META_DESCRIPTION_SCRIPT,
  HERO_DETECTION_SCRIPT,
  SAMPLE_COMPUTED_STYLES_SCRIPT,
  captureSnapshot,
  defaultSsrfGuard,
  detectModeInPage,
  extractMetaDescriptionInPage,
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
      ['EXTRACT_META_DESCRIPTION_SCRIPT', EXTRACT_META_DESCRIPTION_SCRIPT],
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

    it('blocks IPv4-mapped IPv6 that points at a private v4 (dotted form)', async () => {
      const lookup = stubLookup({
        'v4mapped.example': [{ address: '::ffff:10.0.0.5', family: 6 }],
      })
      await expect(defaultSsrfGuard('http://v4mapped.example/', { lookup })).rejects.toThrow(/private IPv4 10\/8/)
    })

    // P1 fix coverage (codex iteration 2): WHATWG URL canonicalizes
    // [::ffff:127.0.0.1] to [::ffff:7f00:1] — the hex-form slipped through
    // the original v4-mapped regex. Test BOTH literal URL canonicalization
    // and DNS-resolved hex-form payloads.
    it('blocks IPv4-mapped IPv6 LITERAL URL after WHATWG canonicalization', async () => {
      // Note: new URL('http://[::ffff:127.0.0.1]/').hostname → "[::ffff:7f00:1]"
      await expect(defaultSsrfGuard('http://[::ffff:127.0.0.1]/', { lookup: benignLookup })).rejects.toThrow(
        /loopback IPv4 127\/8/,
      )
      await expect(defaultSsrfGuard('http://[::ffff:10.0.0.5]/', { lookup: benignLookup })).rejects.toThrow(
        /private IPv4 10\/8/,
      )
      await expect(defaultSsrfGuard('http://[::ffff:169.254.169.254]/', { lookup: benignLookup })).rejects.toThrow(
        /metadata IPv4/,
      )
    })

    it('blocks DNS lookup that returns IPv4-mapped IPv6 in canonical hex form', async () => {
      const lookup = stubLookup({
        // DNS resolver returns the canonical hex form (rare but possible).
        'hex-mapped.example': [{ address: '::ffff:7f00:1', family: 6 }], // = 127.0.0.1
      })
      await expect(defaultSsrfGuard('http://hex-mapped.example/', { lookup })).rejects.toThrow(/loopback IPv4 127\/8/)
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

  // P1 fix coverage: every request (navigation + subresource) must be guarded
  // BEFORE the browser fetches it. captureSnapshot installs the interception
  // via PageLike.interceptRequests.
  describe('captureSnapshot request interception', () => {
    type Handler = (url: string, isNavigation: boolean) => Promise<boolean>

    function makeStubDriver(initialResponse: { status: number; url: string }): {
      driver: BrowserDriverFactory
      capturedHandler: { current: Handler | null }
    } {
      const capturedHandler = { current: null as Handler | null }
      const page: PageLike = {
        async goto(url) {
          // Simulate Playwright invoking the route handler for the navigation request.
          if (capturedHandler.current) {
            const allow = await capturedHandler.current(url, true)
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
        async interceptRequests(handler) {
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
      let firstCall = true
      const ssrfGuard = async (u: string) => {
        if (firstCall) {
          firstCall = false
          return
        }
        if (u.includes('169.254.169.254')) throw new Error('URL_INVALID: metadata IPv4')
      }
      const capturedHandler = { current: null as Handler | null }
      const page: PageLike = {
        async goto(url) {
          if (!capturedHandler.current) throw new Error('handler not installed')
          const ok1 = await capturedHandler.current(url, true)
          if (!ok1) throw new Error('net::ERR_ABORTED')
          const ok2 = await capturedHandler.current('http://169.254.169.254/latest/meta-data/', true)
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
        async interceptRequests(handler) {
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
      const ssrfGuard = async () => {}
      const snapshot = await captureSnapshot('http://allowed.example/', driver, { ssrfGuard })
      expect(snapshot.url).toBe('http://allowed.example/')
      expect(snapshot.finalUrl).toBe('http://allowed.example/')
    })

    // P1 fix coverage (codex iteration 2): subresource SSRF. A public page that
    // includes <img src="http://169.254.169.254/..."> would let Playwright fetch
    // the metadata IP even with main-frame-only interception. interceptRequests
    // now guards subresources too — silently aborts (no goto crash).
    it('blocks subresource requests to private IPs without aborting navigation', async () => {
      const subresourceCalls: { url: string; isNavigation: boolean }[] = []
      const subresourceResults: boolean[] = []
      const capturedHandler = { current: null as Handler | null }
      const page: PageLike = {
        async goto(url) {
          if (!capturedHandler.current) throw new Error('handler not installed')
          // Initial navigation passes.
          await capturedHandler.current(url, true)
          // Page then issues subresource requests, including one to a private IP.
          for (const sub of [
            { url: 'https://cdn.public.example/app.js', isNavigation: false },
            { url: 'http://169.254.169.254/iam/credentials', isNavigation: false },
            { url: 'https://fonts.public.example/inter.woff2', isNavigation: false },
          ]) {
            subresourceCalls.push(sub)
            subresourceResults.push(await capturedHandler.current(sub.url, sub.isNavigation))
          }
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
          return 'http://allowed.example/'
        },
        async waitForTimeout() {},
        async close() {},
        async interceptRequests(handler) {
          capturedHandler.current = handler
        },
      }
      const driver: BrowserDriverFactory = {
        async newPage() {
          return page
        },
        async close() {},
      }
      // Custom guard: passes the navigation URL; rejects 169.254 explicitly.
      const ssrfGuard = async (u: string) => {
        if (u.includes('169.254.169.254')) throw new Error('URL_INVALID: metadata IPv4')
      }
      // Navigation completes — subresource block does NOT crash captureSnapshot.
      const snapshot = await captureSnapshot('http://allowed.example/', driver, { ssrfGuard })
      expect(snapshot.url).toBe('http://allowed.example/')
      // Verify the metadata-IP subresource was rejected; the public ones allowed.
      expect(subresourceCalls).toHaveLength(3)
      expect(subresourceResults).toEqual([true, false, true])
    })
  })

  // P2 fix coverage (codex iteration 2): default-canvas pages report
  // backgroundColor as rgba(0,0,0,0). Naively parsed as black → wrong mode.
  describe('detectModeInPage', () => {
    function withDom(bodyBg: string, htmlBg: string, fn: () => 'light' | 'dark' | 'cream'): 'light' | 'dark' | 'cream' {
      const originalGetComputedStyle = (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle
      ;(globalThis as { getComputedStyle?: unknown }).getComputedStyle = (el: Element) => {
        if (el === (globalThis as { document?: Document }).document?.body)
          return { backgroundColor: bodyBg } as CSSStyleDeclaration
        return { backgroundColor: htmlBg } as CSSStyleDeclaration
      }
      ;(globalThis as { document?: { body: object; documentElement: object } }).document = {
        body: {} as object,
        documentElement: {} as object,
      } as { body: object; documentElement: object } & Document
      try {
        return fn()
      } finally {
        ;(globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle = originalGetComputedStyle
      }
    }

    it('returns light when body bg is fully transparent (default canvas)', () => {
      const mode = withDom('rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', detectModeInPage)
      expect(mode).toBe('light')
    })

    it('returns dark when body bg is opaque dark', () => {
      const mode = withDom('rgb(8, 9, 10)', 'rgba(0, 0, 0, 0)', detectModeInPage)
      expect(mode).toBe('dark')
    })

    it('falls through to html when body bg is transparent but html is opaque dark', () => {
      const mode = withDom('rgba(0, 0, 0, 0)', 'rgb(20, 20, 20)', detectModeInPage)
      expect(mode).toBe('dark')
    })

    it('returns light for white body', () => {
      const mode = withDom('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)', detectModeInPage)
      expect(mode).toBe('light')
    })
  })

  // P2 fix coverage (codex iteration 2): the previous inline `(m as HTMLMetaElement).content`
  // string was TypeScript-only syntax — Chromium parsed it as JS and threw a SyntaxError,
  // so metaDescription was always empty. Function form below is real JS.
  describe('extractMetaDescriptionInPage', () => {
    function withMeta<T>(html: string, fn: () => T): T {
      const originalDocument = (globalThis as { document?: Document }).document
      ;(globalThis as { document?: unknown }).document = {
        querySelector: (sel: string) => {
          if (sel !== 'meta[name="description"]') return null
          const m = html.match(/<meta name="description" content="([^"]*)"/)
          if (!m) return null
          return { content: m[1] } as HTMLMetaElement
        },
      } as unknown as Document
      try {
        return fn()
      } finally {
        ;(globalThis as { document?: Document | undefined }).document = originalDocument
      }
    }

    it('returns the meta[name=description] content when present', () => {
      const out = withMeta('<meta name="description" content="Coherent design">', extractMetaDescriptionInPage)
      expect(out).toBe('Coherent design')
    })

    it('returns empty string when no meta description exists', () => {
      const out = withMeta('<meta charset="utf-8">', extractMetaDescriptionInPage)
      expect(out).toBe('')
    })

    it('script string is pure JS (no TS-only syntax that Chromium would reject)', () => {
      // Chromium parses page.evaluate strings as JS. The string MUST NOT contain
      // TypeScript-only constructs like `as HTMLMetaElement`. The exported
      // function is TS, but tsc strips type assertions before stringification —
      // verify the runtime string is clean.
      expect(EXTRACT_META_DESCRIPTION_SCRIPT).not.toMatch(/\bas\s+HTML/)
      expect(EXTRACT_META_DESCRIPTION_SCRIPT).not.toMatch(/:\s*HTMLMetaElement/)
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
