import { describe, it, expect } from 'vitest'
import { resolveColorPreset, resolveSurfacePreset } from './color-presets.js'

describe('resolveColorPreset', () => {
  it('returns light + dark hex for known hint', () => {
    const result = resolveColorPreset('zinc')
    expect(result).toEqual({ light: '#18181b', dark: '#fafafa' })
  })

  it('returns light + dark hex for emerald', () => {
    const result = resolveColorPreset('emerald')
    expect(result).toEqual({ light: '#059669', dark: '#34d399' })
  })

  it('returns null for unknown hint', () => {
    expect(resolveColorPreset('banana')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveColorPreset('')).toBeNull()
  })

  it('returns null for "blue" (default, no override needed)', () => {
    expect(resolveColorPreset('blue')).toBeNull()
  })
})

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

describe('resolveColorPreset — brand words (PJ-023)', () => {
  it('resolves terracotta instead of falling back to blue', () => {
    expect(resolveColorPreset('terracotta')).not.toBeNull()
  })

  it('accepts a hex hint directly', () => {
    expect(resolveColorPreset('#B5532F')).toEqual({ light: '#b5532f', dark: '#b5532f' })
  })

  it('resolves the last word of a compound hint', () => {
    expect(resolveColorPreset('deep terracotta')).toEqual(resolveColorPreset('terracotta'))
  })

  it.each([
    'terracotta',
    'rust',
    'orange',
    'coral',
    'red',
    'burgundy',
    'pink',
    'plum',
    'purple',
    'navy',
    'sky',
    'cyan',
    'mint',
    'green',
    'forest',
    'sage',
    'olive',
    'lime',
    'gold',
    'brown',
    'espresso',
    'stone',
    'charcoal',
    'black',
  ])('%s light shade passes AA with white text', hint => {
    expect(contrast(resolveColorPreset(hint)!.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('resolveSurfacePreset', () => {
  it('returns warm surfaces for warm-stone', () => {
    expect(resolveSurfacePreset('warm-stone')?.light.background).toBe('#faf8f4')
  })

  it('returns null for minimal-paper (scaffold default)', () => {
    expect(resolveSurfacePreset('minimal-paper')).toBeNull()
  })

  it.each(['warm-stone', 'soft-warm'])('%s keeps body text at AA in both modes', key => {
    const s = resolveSurfacePreset(key)!
    expect(contrast(s.light.foreground, s.light.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(s.dark.foreground, s.dark.background)).toBeGreaterThanOrEqual(4.5)
  })
})
