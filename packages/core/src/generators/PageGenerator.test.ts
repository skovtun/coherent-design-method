import { describe, it, expect } from 'vitest'
import { PageGenerator } from './PageGenerator.js'
import type { DesignSystemConfig } from '../types/design-system.js'

function makeConfig(navItems: Array<{ route: string; label: string }>): DesignSystemConfig {
  return {
    version: '1.0.0',
    projectName: 'Test',
    navigation: {
      enabled: true,
      items: navItems,
    },
    pages: [],
    components: [],
    tokens: { colors: {}, typography: {}, spacing: {} },
    settings: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any
}

describe('PageGenerator', () => {
  describe('generateAppNav', () => {
    it('excludes dynamic routes from navigation', () => {
      const config = makeConfig([
        { route: '/', label: 'Home' },
        { route: '/products', label: 'Products' },
        { route: '/products/[id]', label: 'Product Detail' },
        { route: '/blog/[slug]', label: 'Article' },
      ])
      const gen = new PageGenerator(config)
      const nav = gen.generateAppNav()
      expect(nav).toContain('href="/"')
      expect(nav).toContain('href="/products"')
      expect(nav).not.toContain('href="/products/[id]"')
      expect(nav).not.toContain('href="/blog/[slug]"')
    })

    it('excludes auth routes from navigation', () => {
      const config = makeConfig([
        { route: '/', label: 'Home' },
        { route: '/login', label: 'Login' },
        { route: '/register', label: 'Register' },
        { route: '/forgot-password', label: 'Forgot Password' },
      ])
      const gen = new PageGenerator(config)
      const nav = gen.generateAppNav()
      expect(nav).toContain('href="/"')
      expect(nav).not.toContain('href="/login"')
      expect(nav).not.toContain('href="/register"')
      expect(nav).not.toContain('href="/forgot-password"')
    })

    it('returns empty string when navigation is disabled', () => {
      const config = makeConfig([])
      config.navigation!.enabled = false
      const gen = new PageGenerator(config)
      expect(gen.generateAppNav()).toBe('')
    })
  })
})
