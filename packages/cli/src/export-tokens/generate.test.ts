import { describe, it, expect } from 'vitest'
import { createMinimalConfig } from '../utils/minimal-config.js'
import {
  buildDesignTokensJson,
  buildCssVariablesFile,
  buildTailwindV4File,
  buildDtcgTokens,
  buildArtifact,
  ARTIFACT_FILENAMES,
  TOKEN_FORMATS,
} from './generate.js'

const config = createMinimalConfig('Test App')

describe('buildDesignTokensJson', () => {
  const json = buildDesignTokensJson(config)
  it('is valid JSON carrying the normalized model', () => {
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe('1')
    expect(parsed.name).toBe('Test App')
    expect(parsed.colors.light.primary).toBe(config.tokens.colors.light.primary)
    expect(parsed.colors.dark.background).toBe(config.tokens.colors.dark.background)
    expect(parsed.typography.fontFamily.sans).toBeTruthy()
    expect(parsed.spacing).toBeTruthy()
    expect(parsed.radius).toBeTruthy()
  })
})

describe('buildCssVariablesFile', () => {
  const css = buildCssVariablesFile(config)
  it('emits a :root block with the primary variable', () => {
    expect(css).toContain(':root {')
    expect(css).toContain('.dark {')
    expect(css.toLowerCase()).toContain(`--primary: ${config.tokens.colors.light.primary.toLowerCase()}`)
  })
  it('does not include the Tailwind import (framework-agnostic)', () => {
    expect(css).not.toContain('@import "tailwindcss"')
  })
})

describe('buildTailwindV4File', () => {
  const tw = buildTailwindV4File(config)
  it('emits the Tailwind v4 shape', () => {
    expect(tw).toContain('@import "tailwindcss"')
    expect(tw).toContain('@theme inline')
    expect(tw.toLowerCase()).toContain(`--primary: ${config.tokens.colors.light.primary.toLowerCase()}`)
  })
})

describe('buildDtcgTokens (W3C DTCG format)', () => {
  const dtcg = buildDtcgTokens(config)
  const parsed = JSON.parse(dtcg)

  it('is valid JSON with a top-level $description', () => {
    expect(typeof parsed.$description).toBe('string')
  })

  it('emits color tokens in the DTCG 2025.10 sRGB object form under light/dark groups', () => {
    const primary = parsed.color.light.primary
    expect(primary.$type).toBe('color')
    // $value is the object form, NOT a bare hex string (2025.10 Color module).
    expect(typeof primary.$value).toBe('object')
    expect(primary.$value.colorSpace).toBe('srgb')
    expect(Array.isArray(primary.$value.components)).toBe(true)
    expect(primary.$value.components).toHaveLength(3)
    // hex fallback round-trips the source value for un-upgraded tools.
    expect(primary.$value.hex).toBe(config.tokens.colors.light.primary.toLowerCase())
    expect(parsed.color.dark.background.$value.colorSpace).toBe('srgb')
  })

  it('color components are all in the sRGB [0,1] range', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const tok of Object.values(parsed.color[mode]) as Array<{ $value: { components: number[] } }>) {
        for (const c of tok.$value.components) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('types spacing/radius/fontSize as dimension in the { value, unit } object form', () => {
    for (const group of ['spacing', 'radius', 'fontSize'] as const) {
      for (const tok of Object.values(parsed[group] ?? {}) as Array<{ $type: string; $value: unknown }>) {
        expect(tok.$type).toBe('dimension')
        // 2025.10: $value MUST be an object with a numeric value and a px|rem unit.
        expect(typeof tok.$value).toBe('object')
        const v = tok.$value as { value: number; unit: string }
        expect(typeof v.value).toBe('number')
        expect(['px', 'rem']).toContain(v.unit)
      }
    }
  })

  it('never leaves a bare-string $value on a color or dimension leaf (2025.10 conformance)', () => {
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (obj.$type === 'color' || obj.$type === 'dimension') {
        expect(typeof obj.$value).toBe('object')
        return
      }
      for (const v of Object.values(obj)) walk(v)
    }
    walk(parsed)
  })

  it('types fontWeight as a number and fontFamily as a name or array', () => {
    const weights = Object.values(parsed.fontWeight ?? {}) as Array<{ $type: string; $value: unknown }>
    for (const w of weights) {
      expect(w.$type).toBe('fontWeight')
      expect(typeof w.$value).toBe('number')
    }
    const fams = Object.values(parsed.fontFamily ?? {}) as Array<{ $type: string; $value: unknown }>
    for (const f of fams) {
      expect(f.$type).toBe('fontFamily')
      expect(typeof f.$value === 'string' || Array.isArray(f.$value)).toBe(true)
    }
  })

  it('no token object carries both $value and a nested group (leaf/group separation)', () => {
    // DTCG: a group must not have $value. Spot-check a leaf has $value, a group doesn't.
    expect(parsed.color.$value).toBeUndefined()
    expect(parsed.color.light.primary.$value).toBeDefined()
  })
})

describe('buildArtifact', () => {
  it('returns the canonical filename for each format', () => {
    for (const f of TOKEN_FORMATS) {
      const { filename, content } = buildArtifact(f, config)
      expect(filename).toBe(ARTIFACT_FILENAMES[f])
      expect(content.length).toBeGreaterThan(0)
    }
  })
})
