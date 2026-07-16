import { describe, it, expect } from 'vitest'
import {
  normalizeHex,
  relativeLuminance,
  contrastRatio,
  suggestAccessibleForeground,
  WCAG_AA_NORMAL,
} from './color-utils.js'

describe('normalizeHex', () => {
  it('expands 3-digit hex to 6 and lowercases', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc')
    expect(normalizeHex('FFF')).toBe('#ffffff')
  })
  it('accepts full 6-digit hex with/without hash', () => {
    expect(normalizeHex('#635BFF')).toBe('#635bff')
    expect(normalizeHex('0d253d')).toBe('#0d253d')
  })
  it('drops the alpha channel from 8-digit and 4-digit hex', () => {
    expect(normalizeHex('#635bffcc')).toBe('#635bff')
    expect(normalizeHex('#abcf')).toBe('#aabbcc')
  })
  it('rejects non-hex', () => {
    expect(normalizeHex('rgb(0,0,0)')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('#gg0000')).toBeNull()
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
  })
})

describe('contrastRatio', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
  })
  it('identical colors are 1:1', () => {
    expect(contrastRatio('#123456', '#123456')).toBe(1)
  })
  it('is symmetric', () => {
    expect(contrastRatio('#635bff', '#ffffff')).toBe(contrastRatio('#ffffff', '#635bff'))
  })
  it('luminance is ordered', () => {
    expect(relativeLuminance('#ffffff')).toBeGreaterThan(relativeLuminance('#808080'))
    expect(relativeLuminance('#808080')).toBeGreaterThan(relativeLuminance('#000000'))
  })
})

describe('suggestAccessibleForeground', () => {
  it('returns null when the pair already passes', () => {
    expect(suggestAccessibleForeground('#000000', '#ffffff')).toBeNull()
  })
  it('suggests a foreground that clears AA when the pair fails', () => {
    const bg = '#ffffff'
    const fg = '#999999' // ~2.8:1 on white — fails
    expect(contrastRatio(fg, bg)).toBeLessThan(WCAG_AA_NORMAL)
    const suggestion = suggestAccessibleForeground(fg, bg)
    expect(suggestion).not.toBeNull()
    expect(contrastRatio(suggestion as string, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })
  it('handles a dark background by suggesting toward white', () => {
    const bg = '#101010'
    const fg = '#333333' // fails on near-black
    const suggestion = suggestAccessibleForeground(fg, bg)
    expect(suggestion).not.toBeNull()
    expect(contrastRatio(suggestion as string, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL)
  })
})
