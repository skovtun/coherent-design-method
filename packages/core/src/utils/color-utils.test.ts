import { describe, it, expect } from 'vitest'
import { colorToHex } from './color-utils.js'

describe('colorToHex', () => {
  it('passes through valid 6-digit hex', () => {
    expect(colorToHex('#4F46E5')).toBe('#4F46E5')
    expect(colorToHex('#ffffff')).toBe('#FFFFFF')
  })

  it('truncates 8-digit hex (drops alpha)', () => {
    expect(colorToHex('#4F46E5CC')).toBe('#4F46E5')
  })

  it('expands 3-digit hex', () => {
    expect(colorToHex('#F0A')).toBe('#FF00AA')
  })

  it('prepends # to bare hex', () => {
    expect(colorToHex('4F46E5')).toBe('#4F46E5')
  })

  it('converts CSS named colors', () => {
    expect(colorToHex('red')).toBe('#FF0000')
    expect(colorToHex('indigo')).toBe('#4B0082')
    expect(colorToHex('coral')).toBe('#FF7F50')
    expect(colorToHex('White')).toBe('#FFFFFF')
  })

  it('converts Tailwind color names', () => {
    expect(colorToHex('indigo-500')).toBe('#6366F1')
    expect(colorToHex('blue-600')).toBe('#2563EB')
    expect(colorToHex('red-500')).toBe('#EF4444')
    expect(colorToHex('zinc-900')).toBe('#18181B')
  })

  it('converts rgb()', () => {
    expect(colorToHex('rgb(79, 70, 229)')).toBe('#4F46E5')
    expect(colorToHex('rgb(255, 0, 0)')).toBe('#FF0000')
  })

  it('converts rgba() (drops alpha)', () => {
    expect(colorToHex('rgba(79, 70, 229, 0.5)')).toBe('#4F46E5')
  })

  it('converts hsl()', () => {
    expect(colorToHex('hsl(0, 100%, 50%)')).toBe('#FF0000')
    expect(colorToHex('hsl(120, 100%, 50%)')).toBe('#00FF00')
    expect(colorToHex('hsl(240, 100%, 50%)')).toBe('#0000FF')
  })

  it('converts hsla() (drops alpha)', () => {
    expect(colorToHex('hsla(0, 100%, 50%, 0.8)')).toBe('#FF0000')
  })

  it('is case-insensitive', () => {
    expect(colorToHex('RED')).toBe('#FF0000')
    expect(colorToHex('Indigo-500')).toBe('#6366F1')
    expect(colorToHex('RGB(255, 0, 0)')).toBe('#FF0000')
    expect(colorToHex('HSL(0, 100%, 50%)')).toBe('#FF0000')
  })

  it('returns null for unrecognized values', () => {
    expect(colorToHex('not-a-color')).toBeNull()
    expect(colorToHex('')).toBeNull()
    expect(colorToHex('primary')).toBeNull()
  })
})
