import { describe, it, expect } from 'vitest'
import { cssColorToDtcg, cssDimensionToDtcg } from './dtcg-values.js'

describe('cssColorToDtcg', () => {
  it('matches the DTCG 2025.10 Color-module worked example (#635bff)', () => {
    // The spec's own example: components in [0,1], hex fallback, srgb.
    // 0x63/255=0.3882, 0x5b/255=0.3569, 0xff/255=1.
    const v = cssColorToDtcg('#635bff')!
    expect(v.colorSpace).toBe('srgb')
    expect(v.components).toEqual([0.3882, 0.3569, 1])
    expect(v.hex).toBe('#635bff')
    expect(v.alpha).toBeUndefined() // fully opaque → omitted
  })

  it('normalizes pure black and white to [0,0,0] and [1,1,1]', () => {
    expect(cssColorToDtcg('#000000')!.components).toEqual([0, 0, 0])
    expect(cssColorToDtcg('#ffffff')!.components).toEqual([1, 1, 1])
  })

  it('expands 3-digit shorthand hex', () => {
    const v = cssColorToDtcg('#fff')!
    expect(v.components).toEqual([1, 1, 1])
    expect(v.hex).toBe('#ffffff')
  })

  it('reads 8-digit hex alpha and only then emits the alpha field', () => {
    const v = cssColorToDtcg('#63 5bff'.replace(' ', '') + '80')! // #635bff80
    expect(v.hex).toBe('#635bff')
    expect(v.alpha).toBe(0.502) // 0x80/255 = 0.50196 → 4dp
  })

  it('expands 4-digit shorthand hex with alpha', () => {
    const v = cssColorToDtcg('#f008')!
    expect(v.components).toEqual([1, 0, 0])
    expect(v.alpha).toBe(0.5333) // 0x88/255
  })

  it('parses rgb() and rgba() in both comma and space syntax', () => {
    expect(cssColorToDtcg('rgb(99, 91, 255)')!.components).toEqual([0.3882, 0.3569, 1])
    expect(cssColorToDtcg('rgb(99 91 255)')!.components).toEqual([0.3882, 0.3569, 1])
    const a = cssColorToDtcg('rgba(255, 0, 0, 0.5)')!
    expect(a.components).toEqual([1, 0, 0])
    expect(a.alpha).toBe(0.5)
  })

  it('parses percentage rgb channels', () => {
    expect(cssColorToDtcg('rgb(100%, 0%, 0%)')!.components).toEqual([1, 0, 0])
  })

  it('synthesizes a hex fallback for rgb() input (interop for un-upgraded tools)', () => {
    expect(cssColorToDtcg('rgb(99, 91, 255)')!.hex).toBe('#635bff')
  })

  it('returns null for color forms it does not convert, so the caller keeps the string', () => {
    expect(cssColorToDtcg('oklch(0.7 0.15 250)')).toBeNull()
    expect(cssColorToDtcg('hsl(240 5% 96%)')).toBeNull()
    expect(cssColorToDtcg('rebeccapurple')).toBeNull()
    expect(cssColorToDtcg('240 4.8% 95.9%')).toBeNull() // shadcn HSL triplet
    expect(cssColorToDtcg('#12345')).toBeNull() // 5 digits = invalid
    expect(cssColorToDtcg('')).toBeNull()
  })
})

describe('cssDimensionToDtcg', () => {
  it('splits a rem value into { value, unit }', () => {
    expect(cssDimensionToDtcg('0.25rem')).toEqual({ value: 0.25, unit: 'rem' })
    expect(cssDimensionToDtcg('1rem')).toEqual({ value: 1, unit: 'rem' })
  })

  it('splits a px value into { value, unit }', () => {
    expect(cssDimensionToDtcg('9999px')).toEqual({ value: 9999, unit: 'px' })
  })

  it('gives unitless zero the required px unit (2025.10: unit required even at 0)', () => {
    expect(cssDimensionToDtcg('0')).toEqual({ value: 0, unit: 'px' })
    expect(cssDimensionToDtcg('0.0')).toEqual({ value: 0, unit: 'px' })
    expect(cssDimensionToDtcg(0)).toEqual({ value: 0, unit: 'px' })
  })

  it('accepts a raw number as px', () => {
    expect(cssDimensionToDtcg(16)).toEqual({ value: 16, unit: 'px' })
  })

  it('is case-insensitive on the unit', () => {
    expect(cssDimensionToDtcg('2REM')).toEqual({ value: 2, unit: 'rem' })
  })

  it('returns null for units 2025.10 does not allow, so the caller keeps the string', () => {
    expect(cssDimensionToDtcg('1em')).toBeNull()
    expect(cssDimensionToDtcg('100%')).toBeNull()
    expect(cssDimensionToDtcg('50vh')).toBeNull()
    expect(cssDimensionToDtcg('clamp(1rem, 2vw, 3rem)')).toBeNull()
    expect(cssDimensionToDtcg('')).toBeNull()
    expect(cssDimensionToDtcg(undefined)).toBeNull()
  })
})
