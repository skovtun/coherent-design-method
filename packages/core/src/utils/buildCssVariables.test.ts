import { describe, it, expect } from 'vitest'
import { buildCssVariables } from './buildCssVariables.js'
import type { DesignSystemConfig } from '../types/design-system.js'

function makeConfig(overrides?: { lightAccent?: string; darkAccent?: string }): DesignSystemConfig {
  return {
    tokens: {
      colors: {
        light: {
          primary: '#3B82F6',
          secondary: '#F3F4F6',
          accent: overrides?.lightAccent || '#F59E0B',
          success: '#10B981',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          background: '#FFFFFF',
          foreground: '#111827',
          muted: '#F3F4F6',
          border: '#E5E7EB',
        },
        dark: {
          primary: '#60A5FA',
          secondary: '#1F2937',
          accent: overrides?.darkAccent || '#FBBF24',
          success: '#34D399',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          background: '#111827',
          foreground: '#F9FAFB',
          muted: '#1F2937',
          border: '#374151',
        },
      },
      typography: { fontFamily: { sans: 'Inter', heading: 'Inter', mono: 'JetBrains Mono' }, scale: {} },
      spacing: { unit: 4, scale: {} },
      radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem', full: '9999px' },
    },
    components: [],
    pages: [],
    navigation: { type: 'sidebar', items: [] },
    metadata: { name: 'Test', description: 'Test', version: '1.0.0', createdAt: '', updatedAt: '' },
  } as unknown as DesignSystemConfig
}

describe('buildCssVariables', () => {
  it('uses muted for --accent, ignoring vivid AI-generated accent color', () => {
    const config = makeConfig({ lightAccent: '#F59E0B', darkAccent: '#FBBF24' })
    const css = buildCssVariables(config)

    expect(css).toContain('--accent: #F3F4F6;')
    expect(css).not.toContain('--accent: #F59E0B;')
    expect(css).not.toContain('--accent: #FBBF24;')
  })

  it('uses muted for --accent even when accent is not provided', () => {
    const config = makeConfig()
    delete (config.tokens.colors.light as Record<string, unknown>).accent
    delete (config.tokens.colors.dark as Record<string, unknown>).accent
    const css = buildCssVariables(config)

    expect(css).toContain('--accent: #F3F4F6;')
    expect(css).toContain('--accent-foreground:')
  })
})
