import { describe, it, expect } from 'vitest'
import { resolveColorPreset } from './color-presets.js'

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
