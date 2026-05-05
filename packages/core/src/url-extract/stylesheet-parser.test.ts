import { describe, expect, it } from 'vitest'
import {
  extractGradientStringsFrom,
  extractUrls,
  parseBreakpoints,
  parseGradients,
  parsePatterns,
} from './stylesheet-parser.js'
import type { ComputedStyleSample } from './types.js'

const sample = (role: ComputedStyleSample['role'], styles: Record<string, string>): ComputedStyleSample => ({
  selector: role,
  role,
  styles,
})

describe('parseBreakpoints', () => {
  it('returns unknown strategy when no media queries', () => {
    const r = parseBreakpoints([])
    expect(r.strategy).toBe('unknown')
    expect(r.values).toEqual([])
  })

  it('classifies mobile-first when min-width dominant', () => {
    const r = parseBreakpoints([
      '(min-width: 640px)',
      '(min-width: 768px)',
      '(min-width: 1024px)',
      '(min-width: 1280px) and (orientation: landscape)',
      '(max-width: 639px)', // single max — minority
    ])
    expect(r.strategy).toBe('mobile-first')
    const px = r.values.map(v => v.px)
    expect(px).toContain(640)
    expect(px).toContain(768)
    expect(px).toContain(1024)
    expect(px).toContain(1280)
    expect(px).toContain(639)
    // sorted
    expect(px).toEqual([...px].sort((a, b) => a - b))
  })

  it('classifies desktop-first when max-width dominant', () => {
    const r = parseBreakpoints([
      '(max-width: 1280px)',
      '(max-width: 1024px)',
      '(max-width: 768px)',
      '(min-width: 320px)',
    ])
    expect(r.strategy).toBe('desktop-first')
  })

  it('dedupes duplicate px values across queries', () => {
    const r = parseBreakpoints(['(min-width: 768px)', '(min-width: 768px)', '(min-width: 1024px)'])
    expect(r.values.filter(v => v.px === 768)).toHaveLength(1)
  })

  it('names buckets sm/md/lg/xl/2xl', () => {
    const r = parseBreakpoints([
      '(min-width: 480px)',
      '(min-width: 768px)',
      '(min-width: 1024px)',
      '(min-width: 1280px)',
      '(min-width: 1536px)',
      '(min-width: 2000px)',
    ])
    const byPx = Object.fromEntries(r.values.map(v => [v.px, v.name]))
    expect(byPx[480]).toBe('sm')
    expect(byPx[768]).toBe('md')
    expect(byPx[1024]).toBe('lg')
    expect(byPx[1280]).toBe('xl')
    expect(byPx[1536]).toBe('2xl')
    expect(byPx[2000]).toBe('2000px')
  })
})

describe('extractGradientStringsFrom', () => {
  it('parses linear-gradient with angle and stops', () => {
    const r = extractGradientStringsFrom('linear-gradient(135deg, #635bff 0%, #00d4ff 100%)')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('linear')
    expect(r[0].angle).toBe('135deg')
    expect(r[0].stops).toHaveLength(2)
    expect(r[0].stops[0]).toMatchObject({ color: '#635bff', position: '0%' })
    expect(r[0].stops[1]).toMatchObject({ color: '#00d4ff', position: '100%' })
  })

  it('parses radial-gradient with center spec', () => {
    const r = extractGradientStringsFrom('radial-gradient(circle at center, #ff80b5, transparent)')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('radial')
    expect(r[0].center).toBe('circle at center')
    expect(r[0].stops).toHaveLength(2)
  })

  it('parses conic-gradient', () => {
    const r = extractGradientStringsFrom('conic-gradient(from 0deg, red, yellow, green, red)')
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('conic')
    expect(r[0].center).toBe('from 0deg')
  })

  it('handles multiple gradients in one declaration (comma-separated bg layers)', () => {
    // Each gradient is its own paren-balanced unit.
    const value = 'linear-gradient(45deg, #fff, #000), radial-gradient(circle, red, blue)'
    const r = extractGradientStringsFrom(value)
    expect(r).toHaveLength(2)
    expect(r[0].kind).toBe('linear')
    expect(r[1].kind).toBe('radial')
  })

  it('handles nested rgba in stops', () => {
    const r = extractGradientStringsFrom('linear-gradient(180deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 100%)')
    expect(r).toHaveLength(1)
    expect(r[0].stops).toHaveLength(2)
    expect(r[0].stops[0].color).toBe('rgba(0, 0, 0, 0.5)')
    expect(r[0].stops[1].color).toBe('rgba(0, 0, 0, 0)')
  })

  it('skips malformed input gracefully', () => {
    const r = extractGradientStringsFrom('linear-gradient(45deg, #fff') // unclosed
    expect(r).toHaveLength(0)
  })
})

describe('parseGradients (over samples)', () => {
  it('dedupes identical gradients across samples', () => {
    const value = 'linear-gradient(135deg, #635bff, #00d4ff)'
    const r = parseGradients([sample('section', { background: value }), sample('card', { 'background-image': value })])
    expect(r).toHaveLength(1)
  })
  it('returns [] when no gradient in any sample', () => {
    const r = parseGradients([sample('body', { background: 'rgb(255, 255, 255)' })])
    expect(r).toEqual([])
  })
})

describe('extractUrls', () => {
  it('extracts quoted, single-quoted, and unquoted url(...) values', () => {
    expect(extractUrls('url("https://x.com/a.svg")')).toEqual(['https://x.com/a.svg'])
    expect(extractUrls("url('data:image/svg+xml,abc')")).toEqual(['data:image/svg+xml,abc'])
    expect(extractUrls('url(noise.png)')).toEqual(['noise.png'])
  })
  it('extracts multiple urls from one declaration', () => {
    const r = extractUrls('url(a.png), url("b.svg")')
    expect(r).toEqual(['a.png', 'b.svg'])
  })
})

describe('parsePatterns', () => {
  it('classifies noise hint by url substring', () => {
    const r = parsePatterns([sample('section', { background: 'url(/textures/noise-low.png)' })])
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('noise')
  })
  it('classifies inline svg dot pattern', () => {
    const svg = 'data:image/svg+xml;utf8,%3Csvg%3E%3Ccircle fill%3D%22%23000%22%2F%3E%3C%2Fsvg%3E'
    const r = parsePatterns([sample('section', { 'background-image': `url("${svg}")` })])
    expect(r[0].kind).toBe('dot')
  })
  it('falls back to svg for plain svg url', () => {
    const r = parsePatterns([sample('section', { background: 'url(/icons/decorative.svg)' })])
    expect(r[0].kind).toBe('svg')
  })
  it('falls back to unknown for non-svg/non-noise', () => {
    const r = parsePatterns([sample('section', { background: 'url(/photo.jpg)' })])
    expect(r[0].kind).toBe('unknown')
  })
  it('dedupes by raw url', () => {
    const r = parsePatterns([
      sample('section', { background: 'url(/n.png)' }),
      sample('card', { 'background-image': 'url(/n.png)' }),
    ])
    expect(r).toHaveLength(1)
  })
})
