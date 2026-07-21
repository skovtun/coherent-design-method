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

  it('emits color tokens as { $type: color, $value } under light/dark groups', () => {
    expect(parsed.color.light.primary).toEqual({ $type: 'color', $value: config.tokens.colors.light.primary })
    expect(parsed.color.dark.background.$type).toBe('color')
    expect(parsed.color.dark.background.$value).toBe(config.tokens.colors.dark.background)
  })

  it('types spacing/radius as dimension', () => {
    const firstSpacing = Object.values(parsed.spacing ?? {})[0]
    if (firstSpacing) expect(firstSpacing).toMatchObject({ $type: 'dimension' })
    const firstRadius = Object.values(parsed.radius ?? {})[0]
    if (firstRadius) expect(firstRadius).toMatchObject({ $type: 'dimension' })
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
