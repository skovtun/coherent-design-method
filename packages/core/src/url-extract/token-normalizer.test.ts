import { describe, it, expect } from 'vitest'
import {
  normalizeTokens,
  normalizeColors,
  normalizeBackgrounds,
  normalizeSpacing,
  normalizeRadius,
  normalizeMotion,
  hexToOklch,
  deltaE,
  pickCentroid,
} from './token-normalizer.js'
import type { ExtractedColorToken, ExtractedDesignTokens, MotionToken } from './types.js'

describe('hexToOklch', () => {
  it('pure white → L≈1', () => {
    const { L } = hexToOklch('#ffffff')
    expect(L).toBeCloseTo(1.0, 2)
  })

  it('pure black → L=0', () => {
    const { L } = hexToOklch('#000000')
    expect(L).toBeCloseTo(0.0, 2)
  })

  it('mid-gray → L≈0.6', () => {
    const { L } = hexToOklch('#808080')
    expect(L).toBeGreaterThan(0.55)
    expect(L).toBeLessThan(0.65)
  })

  it('Stripe purple #635BFF → known OKLCH ballpark', () => {
    const { L, C } = hexToOklch('#635BFF')
    expect(L).toBeGreaterThan(0.5)
    expect(L).toBeLessThan(0.65)
    expect(C).toBeGreaterThan(0.18)
  })
})

describe('deltaE', () => {
  it('identity → 0', () => {
    const a = hexToOklch('#635BFF')
    expect(deltaE(a, a)).toBeCloseTo(0, 6)
  })

  it('symmetric', () => {
    const a = hexToOklch('#635BFF')
    const b = hexToOklch('#FF5B63')
    expect(deltaE(a, b)).toBeCloseTo(deltaE(b, a), 6)
  })

  it('monotonic on lightness shift', () => {
    const black = hexToOklch('#000000')
    const dark = hexToOklch('#111111')
    const white = hexToOklch('#ffffff')
    expect(deltaE(black, dark)).toBeLessThan(deltaE(black, white))
  })

  it('subpixel-variant collapse: ΔE<2 between near-identical purples', () => {
    const a = hexToOklch('#635BFF')
    const b = hexToOklch('#645CFE')
    expect(deltaE(a, b) * 100).toBeLessThan(2.0)
  })

  it('distinct hues stay apart: brand vs accent', () => {
    const indigo = hexToOklch('#635BFF')
    const purple = hexToOklch('#9333EA')
    expect(deltaE(indigo, purple) * 100).toBeGreaterThan(2.0)
  })
})

describe('pickCentroid', () => {
  it('most-frequent hex wins', () => {
    const group: ExtractedColorToken[] = [
      { hex: '#635BFF' },
      { hex: '#635BFC' },
      { hex: '#635BFF' },
      { hex: '#635BFF' },
      { hex: '#635BFC' },
    ]
    const counts = new Map([
      ['#635BFF', 3],
      ['#635BFC', 2],
    ])
    const centroid = pickCentroid(group, counts)
    expect(centroid.hex).toBe('#635BFF')
  })

  it('tie → sorted ASC (deterministic)', () => {
    const group: ExtractedColorToken[] = [{ hex: '#635BFF' }, { hex: '#635BFC' }]
    const counts = new Map([
      ['#635BFF', 1],
      ['#635BFC', 1],
    ])
    expect(pickCentroid(group, counts).hex).toBe('#635BFC')
  })
})

describe('normalizeColors', () => {
  it('empty input → []', () => {
    expect(normalizeColors([])).toEqual([])
  })

  it('single color → passthrough', () => {
    const input: ExtractedColorToken[] = [{ hex: '#635BFF', role: 'brand' }]
    expect(normalizeColors(input)).toEqual(input)
  })

  it('all identical → merged to 1', () => {
    const input: ExtractedColorToken[] = [
      { hex: '#635BFF', role: 'brand' },
      { hex: '#635BFF', role: 'brand' },
      { hex: '#635BFF', role: 'brand' },
    ]
    const out = normalizeColors(input)
    expect(out).toHaveLength(1)
    expect(out[0].hex).toBe('#635BFF')
  })

  it('all distinct → no merge', () => {
    const input: ExtractedColorToken[] = [
      { hex: '#000000', role: 'text' },
      { hex: '#FFFFFF', role: 'background' },
      { hex: '#635BFF', role: 'brand' },
    ]
    const out = normalizeColors(input)
    expect(out).toHaveLength(3)
  })

  it('Stripe scenario: 5 near-identical purples → 1 mode-picked entry', () => {
    const input: ExtractedColorToken[] = [
      { hex: '#635BFF', role: 'brand' },
      { hex: '#635BFC', role: 'brand' },
      { hex: '#635BFF', role: 'brand' },
      { hex: '#645CFF', role: 'brand' },
      { hex: '#635BFF', role: 'brand' },
    ]
    const out = normalizeColors(input)
    expect(out).toHaveLength(1)
    expect(out[0].hex).toBe('#635BFF')
  })

  it('externalCounts overrides post-dedup counts (real upstream-dedup case)', () => {
    // Simulates: upstream extractColors() dedup'd 50 #635bff and 1 #635bfe to 1 entry each.
    // Without externalCounts, both have count=1 and tie-break picks alphabetical (#635bfe).
    // With externalCounts from raw samples, mode wins (#635bff).
    const input: ExtractedColorToken[] = [
      { hex: '#635bff', role: 'brand' },
      { hex: '#635bfe', role: 'brand' },
    ]
    const externalCounts = new Map([
      ['#635bff', 50],
      ['#635bfe', 1],
    ])
    const out = normalizeColors(input, externalCounts)
    expect(out).toHaveLength(1)
    expect(out[0].hex).toBe('#635bff')
  })

  it('different roles do not merge even at low ΔE', () => {
    const input: ExtractedColorToken[] = [
      { hex: '#635BFF', role: 'brand' },
      { hex: '#635BFC', role: 'text' },
    ]
    const out = normalizeColors(input)
    expect(out).toHaveLength(2)
  })

  it('REGRESSION (codex P1#2): complete-linkage prevents chain merge beyond threshold', () => {
    // ΔE(#101010, #141414) ≈ 1.6, ΔE(#141414, #181818) ≈ 1.6, ΔE(#101010, #181818) ≈ 3.6.
    // Single-link with seed=#141414 would collapse all three; complete-linkage keeps endpoints split.
    const input: ExtractedColorToken[] = [
      { hex: '#101010', role: 'text' },
      { hex: '#141414', role: 'text' },
      { hex: '#181818', role: 'text' },
    ]
    const externalCounts = new Map([
      ['#101010', 1],
      ['#141414', 5], // most-frequent → seed
      ['#181818', 1],
    ])
    const out = normalizeColors(input, externalCounts)
    // Endpoints (#101010, #181818) are 3.6 apart and MUST NOT be in the same group.
    expect(out.length).toBeGreaterThanOrEqual(2)
  })
})

describe('normalizeBackgrounds (codex P1#1 regression)', () => {
  it('clusters near-identical backgrounds AND remaps roles to centroid', () => {
    const input: ExtractedDesignTokens['backgrounds'] = {
      solid: [
        { hex: '#ffffff', role: 'page' },
        { hex: '#fefefe', role: 'page' },
      ],
      roles: { page: '#fefefe', section: undefined, card: undefined, elevated: undefined },
    }
    const externalCounts = new Map([
      ['#ffffff', 50],
      ['#fefefe', 1],
    ])
    const out = normalizeBackgrounds(input, externalCounts)
    expect(out.solid).toHaveLength(1)
    expect(out.solid[0].hex).toBe('#ffffff')
    // Roles must be remapped — was '#fefefe' (dropped variant), now points to centroid.
    expect(out.roles.page).toBe('#ffffff')
  })

  it('preserves untouched role labels (undefined stays undefined)', () => {
    const input: ExtractedDesignTokens['backgrounds'] = {
      solid: [{ hex: '#ffffff', role: 'page' }],
      roles: { page: '#ffffff' },
    }
    const out = normalizeBackgrounds(input)
    expect(out.roles.section).toBeUndefined()
    expect(out.roles.card).toBeUndefined()
    expect(out.roles.elevated).toBeUndefined()
  })

  it('passthrough on empty solid', () => {
    const input: ExtractedDesignTokens['backgrounds'] = {
      solid: [],
      roles: { page: '#ffffff' },
    }
    const out = normalizeBackgrounds(input)
    expect(out).toBe(input)
  })

  it('different roles do not merge', () => {
    const input: ExtractedDesignTokens['backgrounds'] = {
      solid: [
        { hex: '#ffffff', role: 'page' },
        { hex: '#fefefe', role: 'card' },
      ],
      roles: {},
    }
    const out = normalizeBackgrounds(input)
    expect(out.solid).toHaveLength(2)
  })
})

describe('normalizeSpacing', () => {
  it('rounds sub-pixel to nearest 1px', () => {
    const out = normalizeSpacing([{ px: 11.984 }, { px: 16.001 }])
    expect(out.map(s => s.px)).toEqual([12, 16])
  })

  it('filters 0 and negative', () => {
    const out = normalizeSpacing([{ px: 0 }, { px: -4 }, { px: 8 }])
    expect(out.map(s => s.px)).toEqual([8])
  })

  it('dedupes after rounding', () => {
    const out = normalizeSpacing([{ px: 11.984 }, { px: 12.001 }])
    expect(out).toHaveLength(1)
    expect(out[0].px).toBe(12)
  })

  it('preserves name when present', () => {
    const out = normalizeSpacing([{ name: 'sm', px: 7.998 }])
    expect(out[0]).toEqual({ name: 'sm', px: 8 })
  })
})

describe('normalizeRadius', () => {
  it('keeps 0 (meaningful for square corners)', () => {
    const out = normalizeRadius([{ px: 0 }, { px: 4.001 }])
    expect(out.map(r => r.px)).toEqual([0, 4])
  })

  it('rounds + dedupes', () => {
    const out = normalizeRadius([{ px: 7.998 }, { px: 8.002 }])
    expect(out).toHaveLength(1)
    expect(out[0].px).toBe(8)
  })
})

describe('normalizeMotion', () => {
  it('snaps to nearest 10ms', () => {
    const input: MotionToken[] = [
      { duration: '240.5ms', easing: 'ease' },
      { duration: '245ms', easing: 'ease' },
    ]
    const out = normalizeMotion(input)
    expect(out.map(t => t.duration)).toEqual(['240ms', '250ms'])
  })

  it('filters 0ms', () => {
    const input: MotionToken[] = [
      { duration: '0ms', easing: 'linear' },
      { duration: '200ms', easing: 'ease' },
    ]
    const out = normalizeMotion(input)
    expect(out).toHaveLength(1)
    expect(out[0].duration).toBe('200ms')
  })

  it('dedupes after snap (same duration+easing+property)', () => {
    const input: MotionToken[] = [
      { duration: '240.5ms', easing: 'ease', property: 'opacity' },
      { duration: '243ms', easing: 'ease', property: 'opacity' },
    ]
    const out = normalizeMotion(input)
    expect(out).toHaveLength(1)
    expect(out[0].duration).toBe('240ms')
  })

  it('preserves easing + property', () => {
    const input: MotionToken[] = [{ duration: '200ms', easing: 'cubic-bezier(.4,0,.2,1)', property: 'transform' }]
    const out = normalizeMotion(input)
    expect(out[0]).toEqual({ duration: '200ms', easing: 'cubic-bezier(.4,0,.2,1)', property: 'transform' })
  })
})

describe('normalizeTokens (orchestrator)', () => {
  it('passes through untouched fields and normalizes backgrounds', () => {
    const tokens = stubTokens({
      colors: [{ hex: '#635BFF', role: 'brand' }],
      spacing: [{ px: 7.998 }],
      radius: [{ px: 4 }],
      motion: { tokens: [{ duration: '240.5ms', easing: 'ease' }] },
      backgrounds: {
        solid: [
          { hex: '#ffffff', role: 'page' },
          { hex: '#fefefe', role: 'page' },
        ],
        roles: { page: '#fefefe' },
      },
    })
    const out = normalizeTokens(tokens, {
      colorOccurrences: new Map([
        ['#ffffff', 50],
        ['#fefefe', 1],
      ]),
    })
    expect(out.colors).toEqual([{ hex: '#635BFF', role: 'brand' }])
    expect(out.spacing).toEqual([{ px: 8 }])
    expect(out.motion.tokens[0].duration).toBe('240ms')
    expect(out.backgrounds.solid).toHaveLength(1)
    expect(out.backgrounds.roles.page).toBe('#ffffff') // remapped from dropped #fefefe
    expect(out.typography).toBe(tokens.typography) // untouched ref
    expect(out.shadows).toBe(tokens.shadows) // untouched ref
  })
})

function stubTokens(overrides: Partial<ExtractedDesignTokens>): ExtractedDesignTokens {
  const base: ExtractedDesignTokens = {
    colors: [],
    typography: { families: [], scale: [] },
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
    breakpoints: { strategy: 'unknown', values: [] },
    containerWidths: [],
    borderStyles: [],
    iconStyle: { kind: 'unknown' },
  }
  return { ...base, ...overrides }
}
