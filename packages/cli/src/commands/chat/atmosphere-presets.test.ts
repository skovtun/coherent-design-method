import { describe, it, expect } from 'vitest'
import { ATMOSPHERE_PRESETS, getAtmospherePreset, listAtmospherePresets } from './atmosphere-presets.js'
import { AtmosphereSchema } from './plan-generator.js'

describe('atmosphere-presets', () => {
  it('ships at least 8 presets', () => {
    expect(Object.keys(ATMOSPHERE_PRESETS).length).toBeGreaterThanOrEqual(8)
  })

  it('every preset parses against AtmosphereSchema', () => {
    for (const [name, preset] of Object.entries(ATMOSPHERE_PRESETS)) {
      const result = AtmosphereSchema.safeParse(preset)
      if (!result.success) {
        throw new Error(`${name} invalid: ${JSON.stringify(result.error.format())}`)
      }
    }
  })

  it('every preset has a non-empty moodPhrase and primaryHint', () => {
    for (const [name, preset] of Object.entries(ATMOSPHERE_PRESETS)) {
      expect(preset.moodPhrase.length, `${name}.moodPhrase`).toBeGreaterThan(0)
      expect(preset.primaryHint.length, `${name}.primaryHint`).toBeGreaterThan(0)
    }
  })

  it('all preset names are kebab-case', () => {
    const kebab = /^[a-z]+(?:-[a-z]+)*$/
    for (const name of Object.keys(ATMOSPHERE_PRESETS)) {
      expect(name, `preset name ${name}`).toMatch(kebab)
    }
  })

  it('getAtmospherePreset returns preset for known name', () => {
    const p = getAtmospherePreset('swiss-grid')
    expect(p).toBeDefined()
    expect(p?.fontStyle).toBe('sans')
    expect(p?.background).toBe('minimal-paper')
  })

  it('getAtmospherePreset returns undefined for unknown name', () => {
    expect(getAtmospherePreset('does-not-exist')).toBeUndefined()
  })

  it('listAtmospherePresets returns all keys', () => {
    const list = listAtmospherePresets()
    expect(list).toEqual(Object.keys(ATMOSPHERE_PRESETS))
    expect(list).toContain('swiss-grid')
    expect(list).toContain('neo-brutalist')
    expect(list).toContain('dark-terminal')
  })
})
