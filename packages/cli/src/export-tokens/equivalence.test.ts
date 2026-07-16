import { describe, it, expect } from 'vitest'
import { createMinimalConfig } from '../utils/minimal-config.js'
import { checkEquivalence, readTokenValues, EQUIVALENCE_TOKENS } from './equivalence.js'
import type { DesignSystemConfig } from '@getcoherent/core'

const config = createMinimalConfig('Test App')

describe('E3 token-format equivalence', () => {
  it('the three formats agree for the default config', () => {
    expect(checkEquivalence(config)).toEqual([])
  })

  it('agrees for a custom palette (not vacuously empty — values are really parsed)', () => {
    const custom = structuredClone(config) as DesignSystemConfig
    const light = custom.tokens.colors.light as Record<string, string>
    light.primary = '#123456'
    light.background = '#fefefe'
    light.error = '#ab0000'

    const values = readTokenValues(custom)
    const primary = values.find(v => v.token === 'primary')
    // Proves the CSS + Tailwind values were actually extracted from the generated output.
    expect(primary?.css).toBe('#123456')
    expect(primary?.tailwind).toBe('#123456')
    expect(primary?.model).toBe('#123456')
    expect(checkEquivalence(custom)).toEqual([])
  })

  it('reports a divergence when a generated value would not match the model', () => {
    // Simulate drift: pretend the model claims a value the generators never emit.
    const values = readTokenValues(config).map(v => (v.token === 'primary' ? { ...v, model: '#000000' } : v))
    const issues = values.filter(v => v.model !== v.css || v.model !== v.tailwind)
    expect(issues).toHaveLength(1)
    expect(issues[0].token).toBe('primary')
  })

  it('covers every equivalence token', () => {
    const tokens = readTokenValues(config).map(v => v.token)
    expect(tokens).toEqual([...EQUIVALENCE_TOKENS])
    // Each token has a real value in all three formats.
    for (const v of readTokenValues(config)) {
      expect(v.model).toMatch(/^#[0-9a-f]{6}$/)
      expect(v.css).toBe(v.model)
      expect(v.tailwind).toBe(v.model)
    }
  })
})
