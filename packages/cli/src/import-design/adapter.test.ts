import { describe, it, expect } from 'vitest'
import { adaptImport } from './adapter.js'
import type { RawImport } from './types.js'

function raw(partial: Partial<RawImport>): RawImport {
  return { grammar: 'stitch', colors: [], ...partial }
}

describe('adaptImport — coherent-config (native names)', () => {
  const result = adaptImport(
    raw({
      grammar: 'coherent-config',
      colors: [
        { name: 'background', hex: '#ffffff', raw: '#ffffff' },
        { name: 'primary', hex: '#635bff', raw: '#635bff' },
        { name: 'foreground', hex: '#0d253d', raw: '#0d253d' },
        { name: 'primaryforeground', hex: '#ffffff', raw: '#ffffff' },
      ],
    }),
  )
  it('imports native token names', () => {
    expect(result.seed.colors.primary).toBe('#635bff')
    expect(result.seed.colors.background).toBe('#ffffff')
    expect(result.filledColors.has('primary')).toBe(true)
    const primaryEntry = result.entries.find(e => e.token === 'primary')
    expect(primaryEntry?.disposition).toBe('imported')
  })
  it('drops derived tokens', () => {
    expect((result.seed.colors as Record<string, string>).primaryforeground).toBeUndefined()
    const dropped = result.entries.find(e => e.token === 'primaryforeground')
    expect(dropped?.disposition).toBe('dropped')
    expect(dropped?.note).toContain('derived')
  })
})

describe('adaptImport — coherent-extract (roles)', () => {
  const result = adaptImport(
    raw({
      grammar: 'coherent-extract',
      colors: [
        { hex: '#635bff', role: 'brand' },
        { hex: '#0d253d', role: 'text' },
        { hex: '#ffffff', role: 'background' },
        { hex: '#e3e8ee', role: 'border' },
        { hex: '#8a8f98', role: 'neutral' },
        { hex: '#cd3d64', role: 'semantic', usage: 'Error states' },
      ],
    }),
  )
  it('maps roles to Coherent targets', () => {
    expect(result.seed.colors.primary).toBe('#635bff')
    expect(result.seed.colors.foreground).toBe('#0d253d')
    expect(result.seed.colors.background).toBe('#ffffff')
    expect(result.seed.colors.border).toBe('#e3e8ee')
    expect(result.seed.colors.muted).toBe('#8a8f98')
  })
  it('classifies a semantic color via usage keyword', () => {
    expect(result.seed.colors.error).toBe('#cd3d64')
    const entry = result.entries.find(e => e.token === 'error')
    expect(entry?.disposition).toBe('mapped')
  })
})

describe('adaptImport — stitch (aliases + conflicts)', () => {
  const result = adaptImport(
    raw({
      grammar: 'stitch',
      colors: [
        { name: 'primary', hex: '#635bff', raw: '#635bff' },
        { name: 'primary-deep', hex: '#4b45cc', raw: '#4b45cc' },
        { name: 'ink', hex: '#0d253d', raw: '#0d253d' },
        { name: 'canvas', hex: '#ffffff', raw: '#ffffff' },
        { name: 'hairline', hex: '#e3e8ee', raw: '#e3e8ee' },
        { name: 'ruby', hex: '#cd3d64', raw: '#cd3d64' },
      ],
    }),
  )
  it('maps brand aliases to Coherent targets', () => {
    expect(result.seed.colors.foreground).toBe('#0d253d') // ink
    expect(result.seed.colors.background).toBe('#ffffff') // canvas
    expect(result.seed.colors.border).toBe('#e3e8ee') // hairline
  })
  it('an exact name beats a prefix alias for the same slot', () => {
    expect(result.seed.colors.primary).toBe('#635bff') // not primary-deep
    const dup = result.entries.find(e => e.value === '#4b45cc')
    expect(dup?.disposition).toBe('dropped')
  })
  it('drops an unrecognized name', () => {
    const ruby = result.entries.find(e => e.value === '#cd3d64')
    expect(ruby?.disposition).toBe('dropped')
  })

  it('does not false-match a single-segment name that merely starts with an alias', () => {
    // `linear` starts with alias `line`, `basecolor` with `base` — neither is a
    // separator-delimited variant, so both must be dropped, not mapped to border/background.
    const r = adaptImport(
      raw({
        grammar: 'stitch',
        colors: [
          { name: 'linear', hex: '#111111', raw: '#111111' },
          { name: 'basecolor', hex: '#222222', raw: '#222222' },
        ],
      }),
    )
    expect(r.seed.colors.border).toBeUndefined()
    expect(r.filledColors.size).toBe(0)
  })

  it('still maps a separator-delimited variant via its first segment', () => {
    const r = adaptImport(
      raw({ grammar: 'stitch', colors: [{ name: 'ink-secondary', hex: '#0d253d', raw: '#0d253d' }] }),
    )
    expect(r.seed.colors.foreground).toBe('#0d253d')
  })
})

describe('adaptImport — repaired + font fallback', () => {
  it('flags a normalized hex as repaired', () => {
    const result = adaptImport(raw({ grammar: 'stitch', colors: [{ name: 'primary', hex: '#aabbcc', raw: '#ABC' }] }))
    const entry = result.entries.find(e => e.token === 'primary')
    expect(entry?.disposition).toBe('repaired')
    expect(entry?.note).toContain('#ABC')
  })
  it('appends a generic fallback to a bare sans family', () => {
    const result = adaptImport(raw({ fontSans: 'Sohne', colors: [{ name: 'primary', hex: '#635bff' }] }))
    expect(result.seed.fontFamily.sans).toBe('Sohne, system-ui, sans-serif')
    expect(result.filledFonts.has('sans')).toBe(true)
  })
  it('respects a family that is already a stack', () => {
    const result = adaptImport(raw({ fontSans: 'Inter, system-ui', colors: [{ name: 'primary', hex: '#635bff' }] }))
    expect(result.seed.fontFamily.sans).toBe('Inter, system-ui')
    const entry = result.entries.find(e => e.token === 'fontFamily.sans')
    expect(entry?.disposition).toBe('imported')
  })
  it('appends monospace to a bare mono family', () => {
    const result = adaptImport(raw({ fontMono: 'Berkeley Mono', colors: [{ name: 'primary', hex: '#635bff' }] }))
    expect(result.seed.fontFamily.mono).toBe('Berkeley Mono, monospace')
  })
})

describe('adaptImport — radius + font weight', () => {
  it('maps radii to nearest config slots (first writer wins)', () => {
    const r = adaptImport(raw({ radiiPx: [0, 8, 9999] }))
    expect(r.seed.radius).toMatchObject({ none: '0px', md: '8px', full: '9999px' })
    expect(r.filledRadius.has('none')).toBe(true)
  })

  it('imports the heaviest weight as bold and body weight as normal', () => {
    const r = adaptImport(raw({ fontWeights: [400, 500, 700, 800] }))
    expect(r.seed.fontWeight?.bold).toBe(800)
    expect(r.seed.fontWeight?.normal).toBe(400)
    expect(r.filledWeights.has('bold')).toBe(true)
  })

  it('skips weight import when no heavy weight is present', () => {
    const r = adaptImport(raw({ fontWeights: [400, 500] }))
    expect(r.seed.fontWeight?.bold).toBeUndefined()
  })

  it('leaves radius/weight unset when the file has none', () => {
    const r = adaptImport(raw({ colors: [{ name: 'primary', hex: '#635bff' }] }))
    expect(r.seed.radius).toBeUndefined()
    expect(r.seed.fontWeight).toBeUndefined()
  })
})

describe('adaptImport — font size + spacing', () => {
  it('maps body size to fontSize.base in rem', () => {
    const r = adaptImport(raw({ bodyFontSizePx: 18 }))
    expect(r.seed.fontSize?.base).toBe('1.125rem')
    expect(r.filledFontSize.has('base')).toBe(true)
  })
  it('maps spacing px to nearest config slots in rem', () => {
    const r = adaptImport(raw({ spacingPx: [4, 16, 64] }))
    expect(r.seed.spacing).toMatchObject({ xs: '0.25rem', md: '1rem', '3xl': '4rem' })
  })
  it('leaves fontSize/spacing unset when absent', () => {
    const r = adaptImport(raw({ colors: [{ name: 'primary', hex: '#635bff' }] }))
    expect(r.seed.fontSize).toBeUndefined()
    expect(r.seed.spacing).toBeUndefined()
  })
})
