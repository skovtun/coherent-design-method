import { describe, it, expect } from 'vitest'
import { PageGenerator } from './PageGenerator.js'
import type { DesignSystemConfig } from '../types/design-system.js'

const LIGHT = {
  background: '#ffffff',
  foreground: '#09090b',
  primary: '#2563eb',
  secondary: '#f4f4f5',
  muted: '#f4f4f5',
  border: '#e4e4e7',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
}
const DARK = {
  ...LIGHT,
  background: '#09090b',
  foreground: '#fafafa',
  secondary: '#27272a',
  muted: '#27272a',
  border: '#27272a',
}

function makeConfig(navItems: Array<{ route: string; label: string }>, name = 'Test'): DesignSystemConfig {
  return {
    version: '1.0.0',
    name,
    projectName: name,
    navigation: {
      enabled: true,
      items: navItems,
    },
    pages: [],
    components: [],
    tokens: { colors: { light: LIGHT, dark: DARK }, typography: {}, spacing: {} },
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

  describe('generateLayout with skipNav', () => {
    it('does not include AppNav import when skipNav is true', async () => {
      const config = makeConfig([
        { route: '/', label: 'Home' },
        { route: '/dashboard', label: 'Dashboard' },
      ])
      const gen = new PageGenerator(config)
      const layout = await gen.generateLayout('centered', 'multi-page', { skipNav: true })
      expect(layout).not.toContain('AppNav')
      expect(layout).toContain('RootLayout')
      expect(layout).toContain('<body')
    })

    it('includes AppNav import when skipNav is false/undefined', async () => {
      const config = makeConfig([
        { route: '/', label: 'Home' },
        { route: '/dashboard', label: 'Dashboard' },
      ])
      const gen = new PageGenerator(config)
      const layout = await gen.generateLayout('centered', 'multi-page')
      expect(layout).toContain('AppNav')
    })
  })

  describe('generateSharedHeaderCode', () => {
    it('generates a client component with navigation items', () => {
      const config = makeConfig(
        [
          { route: '/', label: 'Home' },
          { route: '/dashboard', label: 'Dashboard' },
        ],
        'Projector',
      )
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain("'use client'")
      expect(header).toContain('export function Header()')
      expect(header).toContain('href="/"')
      expect(header).toContain('href="/dashboard"')
      expect(header).toContain('Projector')
      expect(header).toContain('ThemeToggle')
      expect(header).toContain('Design System')
    })

    it('excludes dynamic routes from main nav; renders auth routes as buttons', () => {
      const config = makeConfig([
        { route: '/', label: 'Home' },
        { route: '/products/[id]', label: 'Detail' },
        { route: '/login', label: 'Login' },
      ])
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain('href="/"')
      expect(header).not.toContain('href="/products/[id]"')
      expect(header).toContain('href="/login"')
    })

    it('hides on /design-system routes', () => {
      const config = makeConfig([{ route: '/dashboard', label: 'Dashboard' }], 'Projector')
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain("pathname?.startsWith('/design-system')")
      expect(header).toContain('return null')
    })

    it('renders grouped items as DropdownMenu', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/projects', label: 'Projects' },
        { route: '/team', label: 'Team' },
        { route: '/settings', label: 'Settings' },
      ])
      ;(config.navigation!.items[2] as any).group = 'Account'
      ;(config.navigation!.items[3] as any).group = 'Account'
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain('DropdownMenu')
      expect(header).toContain('DropdownMenuTrigger')
      expect(header).toContain('Account')
      expect(header).toContain('href="/team"')
      expect(header).toContain('href="/settings"')
      expect(header).toContain('href="/dashboard"')
      expect(header).toContain("from '@/components/ui/dropdown-menu'")
    })

    it('renders items with children as dropdown', () => {
      const config = makeConfig([{ route: '/dashboard', label: 'Dashboard' }])
      ;(config.navigation!.items[0] as any).children = [
        { label: 'Overview', route: '/dashboard', order: 0 },
        { label: 'Analytics', route: '/analytics', order: 1 },
      ]
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain('DropdownMenu')
      expect(header).toContain('Dashboard')
      expect(header).toContain('href="/analytics"')
    })

    it('renders auth routes as styled buttons', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/login', label: 'Sign In' },
        { route: '/register', label: 'Sign Up' },
      ])
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain('href="/login"')
      expect(header).toContain('href="/register"')
      expect(header).toContain('bg-primary text-primary-foreground')
    })

    it('does not import DropdownMenu when no groups', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/projects', label: 'Projects' },
      ])
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).not.toContain('DropdownMenu')
      expect(header).not.toContain("from '@/components/ui/dropdown-menu'")
    })

    it('generates mobile hamburger menu', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/projects', label: 'Projects' },
      ])
      const gen = new PageGenerator(config)
      const header = gen.generateSharedHeaderCode()
      expect(header).toContain('mobileOpen')
      expect(header).toContain('md:hidden')
      expect(header).toContain('hidden md:flex')
      expect(header).toContain('Toggle menu')
    })
  })

  describe('generateSharedSidebarCode', () => {
    it('generates a sidebar component with nav links', () => {
      const config = makeConfig(
        [
          { route: '/dashboard', label: 'Dashboard' },
          { route: '/projects', label: 'Projects' },
          { route: '/settings', label: 'Settings' },
        ],
        'MyApp',
      )
      const gen = new PageGenerator(config)
      const sidebar = gen.generateSharedSidebarCode()
      expect(sidebar).toContain("'use client'")
      expect(sidebar).toContain('export function Sidebar()')
      expect(sidebar).toContain('href="/dashboard"')
      expect(sidebar).toContain('href="/projects"')
      expect(sidebar).toContain('href="/settings"')
      expect(sidebar).toContain('MyApp')
      expect(sidebar).toContain('collapsed')
    })

    it('renders grouped items in sections', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/team', label: 'Team' },
        { route: '/settings', label: 'Settings' },
      ])
      ;(config.navigation!.items[1] as any).group = 'Account'
      ;(config.navigation!.items[2] as any).group = 'Account'
      const gen = new PageGenerator(config)
      const sidebar = gen.generateSharedSidebarCode()
      expect(sidebar).toContain('Account')
      expect(sidebar).toContain('href="/team"')
      expect(sidebar).toContain('href="/settings"')
    })

    it('excludes auth and marketing routes', () => {
      const config = makeConfig([
        { route: '/dashboard', label: 'Dashboard' },
        { route: '/login', label: 'Login' },
        { route: '/landing', label: 'Landing' },
      ])
      const gen = new PageGenerator(config)
      const sidebar = gen.generateSharedSidebarCode()
      expect(sidebar).toContain('href="/dashboard"')
      expect(sidebar).not.toContain('href="/login"')
      expect(sidebar).not.toContain('href="/landing"')
    })

    it('hides on /design-system routes', () => {
      const config = makeConfig([{ route: '/dashboard', label: 'Dashboard' }])
      const gen = new PageGenerator(config)
      const sidebar = gen.generateSharedSidebarCode()
      expect(sidebar).toContain("pathname?.startsWith('/design-system')")
      expect(sidebar).toContain('return null')
    })
  })

  describe('generateSharedFooterCode', () => {
    it('generates a footer component with app name', () => {
      const config = makeConfig([], 'Projector')
      const gen = new PageGenerator(config)
      const footer = gen.generateSharedFooterCode()
      expect(footer).toContain("'use client'")
      expect(footer).toContain('export function Footer()')
      expect(footer).toContain('Projector')
      expect(footer).toContain('footer')
    })

    it('hides on /design-system routes', () => {
      const config = makeConfig([], 'Projector')
      const gen = new PageGenerator(config)
      const footer = gen.generateSharedFooterCode()
      expect(footer).toContain('usePathname')
      expect(footer).toContain("pathname?.startsWith('/design-system')")
      expect(footer).toContain('return null')
    })
  })
})
