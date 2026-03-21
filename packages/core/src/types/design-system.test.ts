import { describe, it, expect } from 'vitest'
import { DesignSystemConfigSchema, PageDefinitionSchema } from './design-system.js'

describe('PageDefinitionSchema', () => {
  const base = {
    name: 'Test',
    title: 'Test Page',
    description: 'A test page',
    layout: 'centered' as const,
    sections: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('accepts route with leading /', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'test', route: '/test' })
    expect(result.success).toBe(true)
  })

  it('auto-prepends / to route without it', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'test', route: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.route).toBe('/test')
    }
  })

  it('accepts dynamic route segments [id]', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'detail', route: '/products/[id]' })
    expect(result.success).toBe(true)
  })

  it('accepts [slug] route segments', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'article', route: '/blog/[slug]' })
    expect(result.success).toBe(true)
  })

  it('normalizes uppercase id to kebab-case', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'My Page', route: '/my-page' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('my-page')
    }
  })

  it('normalizes layout "sidebar" to sidebar-left (AI shorthand)', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'dash', route: '/dashboard', layout: 'sidebar' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.layout).toBe('sidebar-left')
    }
  })
})

describe('DesignSystemConfig provider field', () => {
  const minimalConfig = {
    name: 'Test',
    description: 'Test app',
    settings: {},
    tokens: {
      colors: {
        light: {
          primary: '#3B82F6',
          secondary: '#10B981',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          background: '#FFFFFF',
          foreground: '#0F172A',
          muted: '#F1F5F9',
          border: '#E2E8F0',
        },
        dark: {
          primary: '#60A5FA',
          secondary: '#34D399',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          background: '#0F172A',
          foreground: '#F1F5F9',
          muted: '#1E293B',
          border: '#334155',
        },
      },
      spacing: {},
      typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
      radius: {},
    },
    theme: {},
    components: [],
    pages: [],
    features: {
      authentication: { enabled: false, strategies: [] },
      payments: { enabled: false },
      analytics: { enabled: false },
      database: { enabled: false },
      stateManagement: { enabled: false },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('should default provider to "shadcn" when not specified', () => {
    const config = DesignSystemConfigSchema.parse(minimalConfig)
    expect(config.provider).toBe('shadcn')
  })

  it('should accept provider: "custom"', () => {
    const config = DesignSystemConfigSchema.parse({
      ...minimalConfig,
      provider: 'custom',
    })
    expect(config.provider).toBe('custom')
  })
})

describe('initialized flag', () => {
  const minimalConfig = {
    name: 'Test',
    description: 'Test app',
    settings: {},
    tokens: {
      colors: {
        light: {
          primary: '#3B82F6',
          secondary: '#10B981',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          background: '#FFFFFF',
          foreground: '#0F172A',
          muted: '#F1F5F9',
          border: '#E2E8F0',
        },
        dark: {
          primary: '#60A5FA',
          secondary: '#34D399',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          background: '#0F172A',
          foreground: '#F1F5F9',
          muted: '#1E293B',
          border: '#334155',
        },
      },
      spacing: {},
      typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
      radius: {},
    },
    theme: {},
    components: [],
    pages: [],
    features: {
      authentication: { enabled: false, strategies: [] },
      payments: { enabled: false },
      analytics: { enabled: false },
      database: { enabled: false },
      stateManagement: { enabled: false },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('defaults to true when not provided (backward compat)', () => {
    const config = DesignSystemConfigSchema.parse(minimalConfig)
    expect(config.settings.initialized).toBe(true)
  })

  it('preserves false when explicitly set', () => {
    const config = DesignSystemConfigSchema.parse({
      ...minimalConfig,
      settings: { initialized: false },
    })
    expect(config.settings.initialized).toBe(false)
  })
})

describe('homePagePlaceholder flag', () => {
  const minimalConfig = {
    name: 'Test',
    description: 'Test app',
    settings: {},
    tokens: {
      colors: {
        light: {
          primary: '#3B82F6',
          secondary: '#10B981',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
          background: '#FFFFFF',
          foreground: '#0F172A',
          muted: '#F1F5F9',
          border: '#E2E8F0',
        },
        dark: {
          primary: '#60A5FA',
          secondary: '#34D399',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
          background: '#0F172A',
          foreground: '#F1F5F9',
          muted: '#1E293B',
          border: '#334155',
        },
      },
      spacing: {},
      typography: { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} },
      radius: {},
    },
    theme: {},
    components: [],
    pages: [],
    features: {
      authentication: { enabled: false, strategies: [] },
      payments: { enabled: false },
      analytics: { enabled: false },
      database: { enabled: false },
      stateManagement: { enabled: false },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('defaults to false when not provided (backward compat)', () => {
    const config = DesignSystemConfigSchema.parse(minimalConfig)
    expect(config.settings.homePagePlaceholder).toBe(false)
  })

  it('preserves true when explicitly set', () => {
    const config = DesignSystemConfigSchema.parse({
      ...minimalConfig,
      settings: { homePagePlaceholder: true },
    })
    expect(config.settings.homePagePlaceholder).toBe(true)
  })
})
