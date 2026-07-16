import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { createMinimalConfig } from '../utils/minimal-config.js'
import { adaptImport } from './adapter.js'
import { buildPlan, serializeConfig } from './apply.js'
import type { RawImport } from './types.js'

const NO_PROJECT = join(tmpdir(), 'coherent-import-design-nonexistent-xyz')

function planFrom(colors: RawImport['colors'], grammar: RawImport['grammar'] = 'stitch') {
  const existing = createMinimalConfig('Test App')
  const adapt = adaptImport({ grammar, colors })
  return { existing, plan: buildPlan(existing, adapt, NO_PROJECT, grammar) }
}

describe('buildPlan — merge', () => {
  it('applies mapped colors to the light palette and records changes', () => {
    const { plan } = planFrom([
      { name: 'primary', hex: '#635bff', raw: '#635bff' },
      { name: 'ink', hex: '#0d253d', raw: '#0d253d' },
      { name: 'canvas', hex: '#ffffff', raw: '#ffffff' },
    ])
    const light = plan.newConfig.tokens.colors.light as Record<string, string>
    expect(light.primary).toBe('#635bff')
    expect(light.foreground).toBe('#0d253d')
    // background matches the default (case aside) — kept, not rewritten.
    expect(light.background.toLowerCase()).toBe('#ffffff')
    expect(plan.changes.find(c => c.token === 'colors.background')).toBeUndefined()
    const primaryChange = plan.changes.find(c => c.token === 'colors.primary')
    expect(primaryChange?.after).toBe('#635bff')
  })

  it('keeps existing values for tokens the file did not provide', () => {
    const { existing, plan } = planFrom([{ name: 'primary', hex: '#635bff', raw: '#635bff' }])
    const existingSuccess = (existing.tokens.colors.light as Record<string, string>).success
    const light = plan.newConfig.tokens.colors.light as Record<string, string>
    expect(light.success).toBe(existingSuccess) // untouched
    const keptEntry = plan.report.entries.find(e => e.token === 'colors.success')
    expect(keptEntry?.disposition).toBe('kept')
  })

  it('does not touch the dark palette in v1', () => {
    const { existing, plan } = planFrom([{ name: 'canvas', hex: '#ffffff', raw: '#ffffff' }])
    expect(plan.newConfig.tokens.colors.dark).toEqual(existing.tokens.colors.dark)
  })

  it('reports zero changes when imported values match the config', () => {
    const existing = createMinimalConfig('Test App')
    const existingPrimary = (existing.tokens.colors.light as Record<string, string>).primary
    const adapt = adaptImport({
      grammar: 'stitch',
      colors: [{ name: 'primary', hex: existingPrimary, raw: existingPrimary }],
    })
    const plan = buildPlan(existing, adapt, NO_PROJECT, 'stitch')
    expect(plan.changes.length).toBe(0)
  })
})

describe('buildPlan — contrast (accept-with-warning)', () => {
  it('warns on a failing foreground/background pair but keeps the palette', () => {
    const { plan } = planFrom([
      { name: 'ink', hex: '#cccccc', raw: '#cccccc' }, // low-contrast text
      { name: 'canvas', hex: '#ffffff', raw: '#ffffff' },
    ])
    const light = plan.newConfig.tokens.colors.light as Record<string, string>
    expect(light.foreground).toBe('#cccccc') // preserved, not repaired
    const warn = plan.report.contrastWarnings.find(w => w.pair === 'foreground/background')
    expect(warn).toBeDefined()
    expect(warn?.suggestion).toBeTruthy()
  })

  it('does not warn on a high-contrast pair', () => {
    const { plan } = planFrom([
      { name: 'ink', hex: '#0d253d', raw: '#0d253d' },
      { name: 'canvas', hex: '#ffffff', raw: '#ffffff' },
    ])
    expect(plan.report.contrastWarnings.length).toBe(0)
  })
})

describe('serializeConfig', () => {
  it('produces a parseable config module', () => {
    const config = createMinimalConfig('Test App')
    const content = serializeConfig(config)
    expect(content).toContain('export const config =')
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    expect(() => JSON.parse(json)).not.toThrow()
    expect(JSON.parse(json).name).toBe('Test App')
  })
})
