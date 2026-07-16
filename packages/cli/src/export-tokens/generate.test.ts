import { describe, it, expect } from 'vitest'
import { createMinimalConfig } from '../utils/minimal-config.js'
import {
  buildDesignTokensJson,
  buildCssVariablesFile,
  buildTailwindV4File,
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

describe('buildArtifact', () => {
  it('returns the canonical filename for each format', () => {
    for (const f of TOKEN_FORMATS) {
      const { filename, content } = buildArtifact(f, config)
      expect(filename).toBe(ARTIFACT_FILENAMES[f])
      expect(content.length).toBeGreaterThan(0)
    }
  })
})
