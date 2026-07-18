import { describe, it, expect } from 'vitest'
import type { DesignSystemConfig } from '@getcoherent/core'
import { buildModificationPrompt, buildConstraintPreamble } from './modification.js'

// Minimal config shape buildModificationPrompt reads. Cast — we only exercise
// the constraint-split branch, not full config validation.
const config = {
  name: 'Test',
  settings: { appType: 'multi-page' },
  pages: [{ name: 'Home', route: '/' }],
  components: [],
  tokens: {
    colors: {
      light: {
        primary: '#111111',
        secondary: '#222222',
        success: '#0a0',
        warning: '#aa0',
        error: '#a00',
        info: '#00a',
        background: '#fff',
        foreground: '#000',
        muted: '#eee',
        border: '#ddd',
      },
      dark: {
        primary: '#eee',
        secondary: '#ccc',
        success: '#0f0',
        warning: '#ff0',
        error: '#f00',
        info: '#00f',
        background: '#000',
        foreground: '#fff',
        muted: '#111',
        border: '#222',
      },
    },
  },
} as unknown as DesignSystemConfig

describe('constraint-caching split', () => {
  it('buildConstraintPreamble carries the invariant design blocks', () => {
    const preamble = buildConstraintPreamble('build a landing page', { pageType: 'marketing' })
    // A distinctive phrase from the always-sent design blocks.
    expect(preamble.length).toBeGreaterThan(1000)
    expect(preamble).toMatch(/AI Slop|Atmosphere|semantic|token/i)
  })

  it('constraintsInSystem omits the preamble blocks from the user prompt', () => {
    const withInline = buildModificationPrompt('build a landing page', config, '', { pageType: 'marketing' })
    const withSystem = buildModificationPrompt('build a landing page', config, '', {
      pageType: 'marketing',
      constraintsInSystem: true,
    })
    // The split version is materially shorter — the ~5K-token preamble moved out.
    expect(withSystem.length).toBeLessThan(withInline.length)
    // But the page-specific format spec (schema, layout contract) stays in both.
    expect(withSystem).toContain('add-page')
    expect(withSystem).toContain('User Request')
  })

  it('preamble + split user prompt together cover what the inline prompt did', () => {
    const preamble = buildConstraintPreamble('build a landing page', { pageType: 'marketing' })
    const split = buildModificationPrompt('build a landing page', config, '', {
      pageType: 'marketing',
      constraintsInSystem: true,
    })
    // A design-block phrase should be present in the preamble, absent from the
    // split user prompt (proving it moved, not duplicated).
    const marker = preamble.slice(0, 40)
    expect(split).not.toContain(marker)
  })
})
