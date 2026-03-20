/**
 * Unit tests for ComponentGenerator — fallback styles and dedicated generators.
 */

import { describe, it, expect } from 'vitest'
import { ComponentGenerator } from './ComponentGenerator.js'
import type { DesignSystemConfig, ComponentDefinition } from '../types/design-system.js'

const minimalConfig: DesignSystemConfig = {
  version: '1.0.0',
  coherentVersion: '0.1.0',
  frameworkVersions: { next: '15.2.4', react: '18.3.1', tailwind: '3.4.17' },
  name: 'Test',
  description: 'Test',
  tokens: {
    colors: {
      light: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
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
        secondary: '#A78BFA',
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
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem' },
    typography: {
      fontFamily: { sans: 'Inter, system-ui, sans-serif', mono: 'monospace' },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
      },
      fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
      lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
    },
    radius: { none: '0', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', full: '9999px' },
  },
  theme: { defaultMode: 'light', allowModeToggle: true },
  components: [],
  pages: [],
  navigation: { enabled: false, type: 'header', items: [] },
  features: {
    authentication: { enabled: false, strategies: [] },
    payments: { enabled: false },
    analytics: { enabled: false },
    database: { enabled: false },
    stateManagement: { enabled: false, provider: 'zustand' },
  },
  layoutBlocks: [],
  settings: {
    initialized: true,
    appType: 'multi-page',
    framework: 'next',
    typescript: true,
    cssFramework: 'tailwind',
    autoScaffold: false,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function makeDef(overrides: Partial<ComponentDefinition>): ComponentDefinition {
  return {
    id: 'test',
    name: 'Test',
    category: 'data-display',
    source: 'custom',
    baseClassName: '',
    variants: [],
    sizes: [],
    usedInPages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ComponentGenerator', () => {
  const gen = new ComponentGenerator(minimalConfig)

  describe('dedicated generators', () => {
    it('generates Button with cva variants and asChild support', async () => {
      const code = await gen.generate(makeDef({ id: 'button', name: 'Button' }))
      expect(code).toContain('buttonVariants')
      expect(code).toContain('cva')
      expect(code).toContain('bg-primary')
      expect(code).toContain('asChild')
      expect(code).toContain('@radix-ui/react-slot')
      expect(code).toContain('Slot')
    })

    it('generates Card with compound exports', async () => {
      const code = await gen.generate(makeDef({ id: 'card', name: 'Card' }))
      expect(code).toContain('CardHeader')
      expect(code).toContain('CardTitle')
      expect(code).toContain('CardContent')
      expect(code).toContain('CardFooter')
    })

    it('generates Switch with toggle state', async () => {
      const code = await gen.generate(makeDef({ id: 'switch', name: 'Switch' }))
      expect(code).toContain('role="switch"')
      expect(code).toContain('onCheckedChange')
    })

    it('generates Input with focus-visible ring', async () => {
      const code = await gen.generate(makeDef({ id: 'input', name: 'Input' }))
      expect(code).toContain('focus-visible:ring-2')
      expect(code).toContain('placeholder:text-muted-foreground')
    })

    it('generates Alert with AlertTitle and AlertDescription exports', async () => {
      const code = await gen.generate(makeDef({ id: 'alert', name: 'Alert' }))
      expect(code).toContain('AlertTitle')
      expect(code).toContain('AlertDescription')
      expect(code).toContain('alertVariants')
      expect(code).toContain('role="alert"')
      expect(code).toContain('export { Alert, AlertTitle, AlertDescription')
    })
  })

  describe('fallback styles', () => {
    it('provides fallback baseClassName for unknown component with no styles', async () => {
      const code = await gen.generate(makeDef({ id: 'unknown-widget', name: 'UnknownWidget', baseClassName: '' }))
      expect(code).toContain('rounded-md border bg-background')
    })

    it('preserves explicit baseClassName when provided', async () => {
      const code = await gen.generate(
        makeDef({
          id: 'custom-card',
          name: 'CustomCard',
          baseClassName: 'bg-red-500 p-8',
        }),
      )
      expect(code).toContain('bg-red-500 p-8')
    })

    it('provides known fallback for slider', async () => {
      const code = await gen.generate(makeDef({ id: 'slider', name: 'Slider', baseClassName: '' }))
      expect(code).toContain('touch-none select-none')
    })

    it('provides fallback sizes when variant classNames are empty', async () => {
      const code = await gen.generate(
        makeDef({
          id: 'my-btn',
          name: 'MyBtn',
          baseClassName: '',
          variants: [{ name: 'default', className: '' }],
          sizes: [
            { name: 'sm', className: '' },
            { name: 'lg', className: '' },
          ],
        }),
      )
      expect(code).toContain('h-8 px-3 text-xs')
      expect(code).toContain('h-10 px-6 text-sm')
    })
  })
})
