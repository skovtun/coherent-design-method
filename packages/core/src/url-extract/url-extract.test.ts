import { describe, expect, it } from 'vitest'
import {
  DETECT_MODE_SCRIPT,
  EXTRACT_COPY_TEXT_SCRIPT,
  EXTRACT_MEDIA_QUERIES_SCRIPT,
  HERO_DETECTION_SCRIPT,
  SAMPLE_COMPUTED_STYLES_SCRIPT,
  defaultSsrfGuard,
} from './browser-capture.js'
import { ExtractedAtmosphereSchema, URL_EXTRACT_SCHEMA_VERSION } from './types.js'

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
    it('allows public https URLs', () => {
      expect(() => defaultSsrfGuard('https://stripe.com')).not.toThrow()
      expect(() => defaultSsrfGuard('http://example.com:8080/path')).not.toThrow()
    })

    it.each([
      ['file://etc/passwd', /scheme/],
      ['data:text/html,<script>', /scheme/],
      ['blob:https://x.com/abc', /scheme/],
      ['javascript:alert(1)', /scheme/],
    ])('blocks non-http schemes: %s', (url, pattern) => {
      expect(() => defaultSsrfGuard(url)).toThrow(pattern)
    })

    it.each([
      ['http://localhost', /localhost/],
      ['http://127.0.0.1/x', /loopback/],
      ['http://10.0.0.5', /private IPv4/],
      ['http://192.168.1.1', /private IPv4/],
      ['http://172.16.0.1', /private IPv4/],
      ['http://172.31.255.255', /private IPv4/],
      ['http://169.254.169.254/latest/meta-data/', /metadata/],
    ])('blocks private/loopback/metadata IPs: %s', (url, pattern) => {
      expect(() => defaultSsrfGuard(url)).toThrow(pattern)
    })

    it('allows public IPs that look private but are not (172.32, 11.0)', () => {
      expect(() => defaultSsrfGuard('http://172.32.0.1')).not.toThrow()
      expect(() => defaultSsrfGuard('http://11.0.0.1')).not.toThrow()
    })

    it('rejects malformed URLs', () => {
      expect(() => defaultSsrfGuard('not-a-url')).toThrow(/URL_INVALID/)
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
