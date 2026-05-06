import { describe, expect, it } from 'vitest'
import { extractDesignTokens, parseMs, parsePx, rgbToHex } from './computed-style-extractor.js'
import type { ComputedStyleSample } from './types.js'

const sample = (
  role: ComputedStyleSample['role'],
  styles: Record<string, string>,
  pseudo?: ComputedStyleSample['pseudo'],
): ComputedStyleSample => ({ selector: role, role, styles, ...(pseudo ? { pseudo } : {}) })

describe('rgbToHex', () => {
  it.each([
    ['rgb(99, 91, 255)', '#635bff'],
    ['rgba(99, 91, 255, 0.8)', '#635bff'],
    ['rgb(0, 0, 0)', '#000000'],
    ['#635BFF', '#635bff'],
    ['#635bff', '#635bff'],
  ])('%s → %s', (input, expected) => {
    expect(rgbToHex(input)).toBe(expected)
  })

  it.each(['rgba(0, 0, 0, 0)', '', 'transparent', 'foo'])('returns null for unparseable: %s', input => {
    expect(rgbToHex(input)).toBeNull()
  })
})

describe('parsePx + parseMs', () => {
  it.each([
    ['16px', 16],
    ['-4px', -4],
    ['12.5px', 12.5],
  ])('parsePx(%s) = %s', (input, expected) => {
    expect(parsePx(input)).toBe(expected)
  })
  it('parsePx returns null for non-px', () => {
    expect(parsePx('1em')).toBeNull()
    expect(parsePx(undefined)).toBeNull()
  })
  it.each([
    ['240ms', 240],
    ['0.3s', 300],
    ['1s', 1000],
  ])('parseMs(%s) = %s', (input, expected) => {
    expect(parseMs(input)).toBe(expected)
  })
})

describe('extractDesignTokens', () => {
  describe('colors', () => {
    it('dedupes by hex+role', () => {
      const t = extractDesignTokens([
        sample('h1', { color: 'rgb(0,0,0)' }),
        sample('h2', { color: 'rgb(0,0,0)' }), // same role group → deduped
        sample('a', { color: 'rgb(99, 91, 255)' }), // brand
        sample('button-primary', { 'background-color': 'rgb(99, 91, 255)' }),
      ])
      const hexes = t.colors.map(c => c.hex)
      expect(hexes).toContain('#000000')
      expect(hexes).toContain('#635bff')
      // de-duped — exact count: text/black, brand text, brand bg
      expect(t.colors.length).toBeLessThanOrEqual(4)
    })

    it('skips fully transparent backgrounds', () => {
      const t = extractDesignTokens([sample('body', { 'background-color': 'rgba(0, 0, 0, 0)' })])
      expect(t.colors).toHaveLength(0)
    })
  })

  describe('typography', () => {
    it('builds scale from h1-h6 + body', () => {
      const t = extractDesignTokens([
        sample('h1', { 'font-size': '56px', 'font-family': 'Sohne, sans-serif', 'font-weight': '700' }),
        sample('h2', { 'font-size': '32px', 'font-family': 'Sohne' }),
        sample('body', {
          'font-size': '16px',
          'font-family': '"Sohne", sans-serif',
          'line-height': '1.6',
        }),
      ])
      expect(t.typography.scale.find(s => s.role === 'h1')).toMatchObject({
        fontSize: '56px',
        fontWeight: 700,
        fontFamily: 'Sohne',
      })
      expect(t.typography.scale.find(s => s.role === 'body')?.fontSize).toBe('16px')
      expect(t.typography.bodyLineHeight).toBe('1.6')
    })

    it('dedupes families across samples', () => {
      const t = extractDesignTokens([
        sample('h1', { 'font-family': '"Inter", sans-serif' }),
        sample('p', { 'font-family': 'Inter, sans-serif' }),
      ])
      const families = t.typography.families.map(f => f.family.toLowerCase())
      expect(families.filter(f => f === 'inter')).toHaveLength(1)
    })
  })

  describe('spacing scale', () => {
    it('extracts dedup-sorted px values from padding/margin/gap shorthand', () => {
      const t = extractDesignTokens([
        sample('section', { padding: '24px 16px 24px 16px', gap: '8px' }),
        sample('card', { padding: '32px', margin: '16px' }),
      ])
      const px = t.spacing.map(s => s.px)
      expect(px).toEqual([8, 16, 24, 32])
    })
    it('caps at 12 distinct values', () => {
      const styles = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`padding`, `${(i + 1) * 4}px`]))
      const t = extractDesignTokens([sample('section', styles)])
      expect(t.spacing.length).toBeLessThanOrEqual(12)
    })
  })

  describe('radius', () => {
    it('extracts dedup-sorted px', () => {
      const t = extractDesignTokens([
        sample('button-primary', { 'border-radius': '4px' }),
        sample('card', { 'border-radius': '8px 8px 0 0' }),
      ])
      const px = t.radius.map(r => r.px)
      expect(px).toContain(0)
      expect(px).toContain(4)
      expect(px).toContain(8)
    })
  })

  describe('shadows', () => {
    it('dedupes by raw value, skips none', () => {
      const t = extractDesignTokens([
        sample('card', { 'box-shadow': '0 1px 2px rgba(0,0,0,0.05)' }),
        sample('section', { 'box-shadow': '0 1px 2px rgba(0,0,0,0.05)' }),
        sample('h1', { 'box-shadow': 'none' }),
      ])
      expect(t.shadows).toHaveLength(1)
    })
  })

  describe('motion', () => {
    it('extracts duration + easing tuples', () => {
      const t = extractDesignTokens([
        sample('button-primary', {
          'transition-duration': '240ms',
          'transition-timing-function': 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
          'transition-property': 'all',
        }),
      ])
      expect(t.motion.tokens).toHaveLength(1)
      expect(t.motion.tokens[0]).toMatchObject({
        duration: '240ms',
        easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
      })
    })
    it('handles multiple comma-separated transitions', () => {
      const t = extractDesignTokens([
        sample('a', {
          'transition-duration': '100ms, 200ms',
          'transition-timing-function': 'ease, ease-out',
          'transition-property': 'color, opacity',
        }),
      ])
      expect(t.motion.tokens).toHaveLength(2)
    })
    it('skips zero-duration transitions', () => {
      const t = extractDesignTokens([
        sample('a', {
          'transition-duration': '0s',
          'transition-timing-function': 'ease',
        }),
      ])
      expect(t.motion.tokens).toHaveLength(0)
    })
  })

  describe('backgrounds + roles', () => {
    it('maps body→page, section→section, card→card', () => {
      const t = extractDesignTokens([
        sample('body', { 'background-color': 'rgb(255, 255, 255)' }),
        sample('section', { 'background-color': 'rgb(248, 248, 248)' }),
        sample('card', { 'background-color': 'rgb(255, 255, 255)' }),
      ])
      expect(t.backgrounds.roles.page).toBe('#ffffff')
      expect(t.backgrounds.roles.section).toBe('#f8f8f8')
      expect(t.backgrounds.roles.card).toBe('#ffffff')
    })
  })

  describe('z-index', () => {
    it('sorts ascending, dedupes, skips auto', () => {
      const t = extractDesignTokens([
        sample('nav', { 'z-index': '50' }),
        sample('card', { 'z-index': 'auto' }),
        sample('section', { 'z-index': '100' }),
        sample('footer', { 'z-index': '50' }),
      ])
      expect(t.zIndexScale.map(z => z.z)).toEqual([50, 100])
    })

    it('preserves layer-meaningful role names (nav, footer)', () => {
      const t = extractDesignTokens([sample('nav', { 'z-index': '50' }), sample('footer', { 'z-index': '100' })])
      expect(t.zIndexScale.map(z => z.layer)).toEqual(['nav', 'footer'])
    })

    it('synthesizes z-${n} label for bare-tag roles (issue #97)', () => {
      // awwwards.com produced { layer: "a", z: 1 } from a bare anchor.
      // The synthetic z-1 label reads as a layer scale, not as a tag dump.
      const t = extractDesignTokens([
        sample('a', { 'z-index': '1' }),
        sample('p', { 'z-index': '5' }),
        sample('h1', { 'z-index': '10' }),
      ])
      expect(t.zIndexScale).toEqual([
        { layer: 'z-1', z: 1 },
        { layer: 'z-5', z: 5 },
        { layer: 'z-10', z: 10 },
      ])
    })

    it('mixes layer-meaningful and synthesized labels in one scale', () => {
      const t = extractDesignTokens([
        sample('a', { 'z-index': '1' }),
        sample('nav', { 'z-index': '50' }),
        sample('icon', { 'z-index': '999' }),
      ])
      expect(t.zIndexScale).toEqual([
        { layer: 'z-1', z: 1 },
        { layer: 'nav', z: 50 },
        { layer: 'z-999', z: 999 },
      ])
    })

    it('formats negative z-index as -z-N (Tailwind-style, no double dash) — codex iter-1', () => {
      // Negative z-index is common for behind-the-flow background layers.
      // The naive `z-${n}` template produced `z--1`; fix preserves Tailwind
      // convention.
      const t = extractDesignTokens([
        sample('section', { 'z-index': '-1' }),
        sample('p', { 'z-index': '-10' }),
      ])
      expect(t.zIndexScale.map(z => z.layer)).toEqual(['-z-10', '-z-1']) // sorted ascending
      expect(t.zIndexScale.every(z => !z.layer.includes('--'))).toBe(true)
    })
  })

  describe('container widths', () => {
    it('captures non-none max-width', () => {
      const t = extractDesignTokens([
        sample('section', { 'max-width': '1280px' }),
        sample('p', { 'max-width': '65ch' }),
        sample('body', { 'max-width': 'none' }),
      ])
      expect(t.containerWidths.length).toBe(2)
      expect(t.containerWidths.find(c => c.role === 'prose')?.max).toBe('65ch')
    })
  })

  describe('glassmorphism', () => {
    it('returns null when absent', () => {
      const t = extractDesignTokens([sample('section', { 'backdrop-filter': 'none' })])
      expect(t.glassmorphism).toBeNull()
    })
    it('parses blur(...)', () => {
      const t = extractDesignTokens([sample('section', { 'backdrop-filter': 'blur(12px) saturate(180%)' })])
      expect(t.glassmorphism).not.toBeNull()
      expect(t.glassmorphism?.samples[0].blur).toBe('12px')
    })
  })

  describe('focus rings', () => {
    it('only collects from :focus / :focus-visible samples', () => {
      const t = extractDesignTokens([
        sample('input', { outline: '2px solid #635bff', 'outline-offset': '2px' }, 'focus'),
        sample('a', { outline: 'none' }, 'focus'),
        sample('button-primary', { outline: '1px dashed gray' }, 'hover'), // wrong pseudo
      ])
      expect(t.focusRings).toHaveLength(1)
      expect(t.focusRings[0].outline).toBe('2px solid #635bff')
    })
  })

  describe('link states', () => {
    it('falls back hover→default when no hover sample', () => {
      const t = extractDesignTokens([sample('a', { color: 'rgb(99, 91, 255)' })])
      expect(t.linkStates.default.color).toBe('#635bff')
      expect(t.linkStates.hover.color).toBe('#635bff') // fallback
    })
  })

  describe('border styles', () => {
    it('parses width + style + color from shorthand', () => {
      const t = extractDesignTokens([sample('card', { border: '1px solid rgb(229, 231, 235)' })])
      expect(t.borderStyles).toHaveLength(1)
      expect(t.borderStyles[0]).toMatchObject({ width: '1px', style: 'solid', color: '#e5e7eb' })
    })
    it('skips 0px borders', () => {
      const t = extractDesignTokens([sample('card', { border: '0px solid rgb(0, 0, 0)' })])
      expect(t.borderStyles).toHaveLength(0)
    })
  })

  describe('schema-shaped output', () => {
    it('returns gradients/patterns/breakpoints stubs (filled by stylesheet-parser)', () => {
      const t = extractDesignTokens([])
      expect(t.gradients).toEqual([])
      expect(t.patterns).toEqual([])
      expect(t.breakpoints.strategy).toBe('unknown')
    })
  })
})
