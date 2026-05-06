// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sampleComputedStylesInPage } from './browser-capture.js'
import { extractDesignTokens } from './computed-style-extractor.js'
import type { ExtractedDesignTokens } from './types.js'

/**
 * Regression suite: hand-crafted HTML fixtures that mimic the visual atmosphere
 * of well-known sites. See __fixtures__/README.md for the rationale.
 *
 * happy-dom limits:
 * - getBoundingClientRect returns zeros (no layout). The "largest button"
 *   sampler degenerates to first-in-DOM, so fixtures place .btn-primary first.
 * - <style> cascade works for the property set sampleComputedStylesInPage reads.
 */

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

function loadFixture(name: string): ExtractedDesignTokens {
  const html = readFileSync(join(FIXTURES_DIR, name), 'utf8')
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  document.head.innerHTML = headMatch?.[1] ?? ''
  document.body.innerHTML = bodyMatch?.[1] ?? ''
  const samples = sampleComputedStylesInPage()
  return extractDesignTokens(samples)
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('stripe-like fixture', () => {
  it('captures Stripe brand purple via primary CTA bg', () => {
    const tokens = loadFixture('stripe-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#635bff')
  })

  it('captures Stripe ink #0a2540 from h1 / body color', () => {
    const tokens = loadFixture('stripe-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#0a2540')
  })

  it('captures sohne-var or Helvetica family', () => {
    const tokens = loadFixture('stripe-like.html')
    const families = tokens.typography.families.map(f => f.family.toLowerCase())
    expect(families.some(f => f.includes('sohne') || f.includes('helvetica'))).toBe(true)
  })

  it('h1 fontSize is 64px (Stripe display scale)', () => {
    const tokens = loadFixture('stripe-like.html')
    const h1 = tokens.typography.scale.find(s => s.role === 'h1')
    expect(h1?.fontSize).toBe('64px')
  })

  it('captures 200ms motion (Stripe button transition)', () => {
    const tokens = loadFixture('stripe-like.html')
    const ms = tokens.motion.tokens.map(t => t.duration)
    expect(ms).toContain('200ms')
  })
})

describe('linear-like fixture', () => {
  it('captures Linear violet #5e6ad2 from primary CTA bg', () => {
    const tokens = loadFixture('linear-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#5e6ad2')
  })

  it('captures Linear surface #08090a (near-black bg)', () => {
    const tokens = loadFixture('linear-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#08090a')
  })

  it('captures Inter family', () => {
    const tokens = loadFixture('linear-like.html')
    const families = tokens.typography.families.map(f => f.family.toLowerCase())
    expect(families.some(f => f.includes('inter'))).toBe(true)
  })

  it('captures fast 100ms motion (Linear signature)', () => {
    const tokens = loadFixture('linear-like.html')
    const ms = tokens.motion.tokens.map(t => t.duration)
    expect(ms).toContain('100ms')
  })

  it('h1 fontSize is 56px (Linear display scale)', () => {
    const tokens = loadFixture('linear-like.html')
    const h1 = tokens.typography.scale.find(s => s.role === 'h1')
    expect(h1?.fontSize).toBe('56px')
  })
})

describe('apple-like fixture', () => {
  it('captures Apple ink #1d1d1f', () => {
    const tokens = loadFixture('apple-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#1d1d1f')
  })

  it('captures Apple link blue #0066cc', () => {
    const tokens = loadFixture('apple-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#0066cc')
  })

  it('captures Apple CTA blue #0071e3', () => {
    const tokens = loadFixture('apple-like.html')
    const hexes = tokens.colors.map(c => c.hex)
    expect(hexes).toContain('#0071e3')
  })

  it('captures SF Pro family', () => {
    const tokens = loadFixture('apple-like.html')
    const families = tokens.typography.families.map(f => f.family.toLowerCase())
    expect(families.some(f => f.includes('sf pro') || f.includes('-apple-system'))).toBe(true)
  })

  it('h1 fontSize is 96px (Apple oversized headline)', () => {
    const tokens = loadFixture('apple-like.html')
    const h1 = tokens.typography.scale.find(s => s.role === 'h1')
    expect(h1?.fontSize).toBe('96px')
  })
})

describe('fixture cross-checks', () => {
  it('all 3 fixtures produce non-empty colors + typography + motion', () => {
    for (const fixture of ['stripe-like.html', 'linear-like.html', 'apple-like.html']) {
      const tokens = loadFixture(fixture)
      expect(tokens.colors.length, `${fixture} colors`).toBeGreaterThan(0)
      expect(tokens.typography.families.length, `${fixture} families`).toBeGreaterThan(0)
      expect(tokens.typography.scale.length, `${fixture} scale`).toBeGreaterThan(0)
      expect(tokens.motion.tokens.length, `${fixture} motion`).toBeGreaterThan(0)
    }
  })

  it('palettes are visually distinct: Stripe purple vs Linear violet are different hexes', () => {
    const stripe = loadFixture('stripe-like.html')
    const linear = loadFixture('linear-like.html')
    const stripeHexes = new Set(stripe.colors.map(c => c.hex))
    const linearHexes = new Set(linear.colors.map(c => c.hex))
    // Brand colors must NOT collide
    expect(stripeHexes.has('#635bff')).toBe(true)
    expect(linearHexes.has('#5e6ad2')).toBe(true)
    expect(stripeHexes.has('#5e6ad2')).toBe(false)
    expect(linearHexes.has('#635bff')).toBe(false)
  })
})
