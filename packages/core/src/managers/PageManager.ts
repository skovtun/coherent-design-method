/**
 * Page Manager
 * 
 * Handles page composition, section management, navigation sync, and code generation.
 */

import type {
  DesignSystemConfig,
  PageDefinition,
  PageSection,
  PageLayout,
  Navigation,
  ModificationResult,
} from '../types/design-system.js'
import {
  validateConfig,
  getPage,
  pageRouteExists,
  componentExists,
  getComponent,
} from '../types/design-system.js'
import type { ComponentManager } from './ComponentManager.js'
import { buildCssVariables } from '../utils/buildCssVariables.js'

export class PageManager {
  private config: DesignSystemConfig
  private componentManager: ComponentManager | null = null

  constructor(config: DesignSystemConfig, componentManager?: ComponentManager) {
    this.config = config
    this.componentManager = componentManager || null
  }

  /**
   * Create a new page
   */
  async create(def: PageDefinition): Promise<ModificationResult> {
    // Check if page route already exists
    if (pageRouteExists(this.config, def.route)) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page with route ${def.route} already exists`,
      }
    }

    // Validate all component references exist
    const missingComponents: string[] = []
    def.sections.forEach(section => {
      if (!componentExists(this.config, section.componentId)) {
        missingComponents.push(section.componentId)
      }
    })

    if (missingComponents.length > 0) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Missing components: ${missingComponents.join(', ')}`,
        warnings: ['Create components first before adding page'],
      }
    }

    // Add page
    this.config.pages.push(def)
    this.config.updatedAt = new Date().toISOString()

    // Sync with navigation
    await this.syncWithNavigation([def])

    // Validate
    this.config = validateConfig(this.config)

    // Track component usage
    def.sections.forEach(section => {
      const component = getComponent(this.config, section.componentId)
      if (component && !component.usedInPages.includes(def.route)) {
        component.usedInPages.push(def.route)
      }

      // Also track via ComponentManager if available
      if (this.componentManager) {
        this.componentManager.trackUsage(section.componentId, def.route)
      }
    })

    return {
      success: true,
      modified: [`page:${def.id}`],
      config: this.config,
      message: `Created page ${def.name} at ${def.route}`,
    }
  }

  /**
   * Read page by ID or route
   */
  read(idOrRoute: string): PageDefinition | undefined {
    // Try as ID first
    const byId = this.config.pages.find(p => p.id === idOrRoute)
    if (byId) {
      return byId
    }

    // Try as route
    return getPage(this.config, idOrRoute)
  }

  /**
   * Update existing page
   */
  async update(
    id: string,
    changes: Partial<PageDefinition>
  ): Promise<ModificationResult> {
    const page = this.read(id)
    if (!page) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${id} not found`,
      }
    }

    // Check route change
    if (changes.route && changes.route !== page.route) {
      if (pageRouteExists(this.config, changes.route)) {
        return {
          success: false,
          modified: [],
          config: this.config,
          message: `Route ${changes.route} already exists`,
        }
      }

      // Update component usage tracking (old route -> new route)
      page.sections.forEach(section => {
        const component = getComponent(this.config, section.componentId)
        if (component) {
          const index = component.usedInPages.indexOf(page.route)
          if (index !== -1) {
            component.usedInPages[index] = changes.route!
          }
        }

        if (this.componentManager) {
          this.componentManager.untrackUsage(section.componentId, page.route)
          this.componentManager.trackUsage(section.componentId, changes.route!)
        }
      })
    }

    // Apply changes
    const updated: PageDefinition = {
      ...page,
      ...changes,
      id: page.id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    }

    // Update in config
    const index = this.config.pages.findIndex(p => p.id === id)
    if (index === -1) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${id} not found in config`,
      }
    }

    this.config.pages[index] = updated
    this.config.updatedAt = new Date().toISOString()

    // Sync navigation if route or name changed
    if (changes.route || changes.name) {
      await this.syncWithNavigation([updated])
    }

    // Validate
    this.config = validateConfig(this.config)

    return {
      success: true,
      modified: [`page:${id}`],
      config: this.config,
      message: `Updated page ${updated.name} (${id})`,
    }
  }

  /**
   * Delete page
   */
  async delete(id: string): Promise<ModificationResult> {
    const page = this.read(id)
    if (!page) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${id} not found`,
      }
    }

    // Remove component usage tracking
    page.sections.forEach(section => {
      const component = getComponent(this.config, section.componentId)
      if (component) {
        const index = component.usedInPages.indexOf(page.route)
        if (index !== -1) {
          component.usedInPages.splice(index, 1)
        }
      }

      if (this.componentManager) {
        this.componentManager.untrackUsage(section.componentId, page.route)
      }
    })

    // Remove from config
    this.config.pages = this.config.pages.filter(p => p.id !== id)
    this.config.updatedAt = new Date().toISOString()

    // Remove from navigation
    if (this.config.navigation?.enabled) {
      this.config.navigation.items = this.config.navigation.items.filter(
        item => item.route !== page.route
      )
    }

    // Validate
    this.config = validateConfig(this.config)

    return {
      success: true,
      modified: [`page:${id}`],
      config: this.config,
      message: `Deleted page ${page.name} (${id})`,
    }
  }

  /**
   * Add section to page
   */
  async addSection(
    pageId: string,
    section: PageSection,
    position?: number
  ): Promise<ModificationResult> {
    const page = this.read(pageId)
    if (!page) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${pageId} not found`,
      }
    }

    // Validate component exists
    if (!componentExists(this.config, section.componentId)) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Component ${section.componentId} not found`,
      }
    }

    // Add section
    if (position !== undefined && position >= 0 && position <= page.sections.length) {
      page.sections.splice(position, 0, section)
    } else {
      page.sections.push(section)
    }

    page.updatedAt = new Date().toISOString()
    this.config.updatedAt = new Date().toISOString()

    // Track component usage
    const component = getComponent(this.config, section.componentId)
    if (component && !component.usedInPages.includes(page.route)) {
      component.usedInPages.push(page.route)
    }

    if (this.componentManager) {
      this.componentManager.trackUsage(section.componentId, page.route)
    }

    // Validate
    this.config = validateConfig(this.config)

    return {
      success: true,
      modified: [`page:${pageId}`],
      config: this.config,
      message: `Added section to page ${page.name}`,
    }
  }

  /**
   * Remove section from page
   */
  async removeSection(
    pageId: string,
    sectionIndex: number
  ): Promise<ModificationResult> {
    const page = this.read(pageId)
    if (!page) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${pageId} not found`,
      }
    }

    if (sectionIndex < 0 || sectionIndex >= page.sections.length) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Invalid section index ${sectionIndex}`,
      }
    }

    const section = page.sections[sectionIndex]
    page.sections.splice(sectionIndex, 1)
    page.updatedAt = new Date().toISOString()
    this.config.updatedAt = new Date().toISOString()

    // Check if component is still used in other sections
    const stillUsed = page.sections.some(s => s.componentId === section.componentId)
    if (!stillUsed) {
      // Remove usage tracking
      const component = getComponent(this.config, section.componentId)
      if (component) {
        const index = component.usedInPages.indexOf(page.route)
        if (index !== -1) {
          component.usedInPages.splice(index, 1)
        }
      }

      if (this.componentManager) {
        this.componentManager.untrackUsage(section.componentId, page.route)
      }
    }

    // Validate
    this.config = validateConfig(this.config)

    return {
      success: true,
      modified: [`page:${pageId}`],
      config: this.config,
      message: `Removed section from page ${page.name}`,
    }
  }

  /**
   * Reorder sections in page
   */
  async reorderSections(
    pageId: string,
    order: number[]
  ): Promise<ModificationResult> {
    const page = this.read(pageId)
    if (!page) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Page ${pageId} not found`,
      }
    }

    // Validate order array
    if (order.length !== page.sections.length) {
      return {
        success: false,
        modified: [],
        config: this.config,
        message: `Order array length (${order.length}) doesn't match sections count (${page.sections.length})`,
      }
    }

    // Check all indices are present
    const sortedOrder = [...order].sort((a, b) => a - b)
    for (let i = 0; i < sortedOrder.length; i++) {
      if (sortedOrder[i] !== i) {
        return {
          success: false,
          modified: [],
          config: this.config,
          message: `Invalid order array: missing index ${i}`,
        }
      }
    }

    // Reorder sections
    const reordered = order.map(index => page.sections[index])
    page.sections = reordered
    page.updatedAt = new Date().toISOString()
    this.config.updatedAt = new Date().toISOString()

    // Validate
    this.config = validateConfig(this.config)

    return {
      success: true,
      modified: [`page:${pageId}`],
      config: this.config,
      message: `Reordered sections in page ${page.name}`,
    }
  }

  /**
   * Sync pages with navigation
   */
  async syncWithNavigation(pages: PageDefinition[]): Promise<Navigation | null> {
    if (!this.config.navigation?.enabled) {
      return null
    }

    const navigation = this.config.navigation

    // Add/update navigation items for provided pages
    pages.forEach(page => {
      const existingItem = navigation.items.find(item => item.route === page.route)

      if (existingItem) {
        // Update existing item
        existingItem.label = page.name
        existingItem.requiresAuth = page.requiresAuth
      } else {
        // Add new item
        navigation.items.push({
          label: page.name,
          route: page.route,
          order: navigation.items.length + 1,
          requiresAuth: page.requiresAuth,
        })
      }
    })

    // Remove navigation items for pages that no longer exist
    navigation.items = navigation.items.filter(item =>
      this.config.pages.some(page => page.route === item.route)
    )

    // Sort by order
    navigation.items.sort((a, b) => a.order - b.order)

    // Reassign order numbers to be sequential
    navigation.items.forEach((item, index) => {
      item.order = index + 1
    })

    this.config.updatedAt = new Date().toISOString()

    return navigation
  }

  /**
   * Generate page code (Next.js App Router or React SPA)
   */
  async generatePage(
    def: PageDefinition,
    appType: 'multi-page' | 'spa' = 'multi-page'
  ): Promise<string> {
    if (appType === 'multi-page') {
      return this.generateNextJsPage(def)
    } else {
      return this.generateSPAPage(def)
    }
  }

  /**
   * Generate Next.js App Router page
   */
  private generateNextJsPage(def: PageDefinition): string {
    const imports = this.generateImports(def)
    const metadata = this.generateMetadata(def)
    const sections = this.generateSections(def)
    const containerClass = this.getContainerClass(def.layout)

    return `import { Metadata } from 'next'
${imports}

export const metadata: Metadata = {
  title: '${def.title}',
  description: '${def.description}',
${def.ogImage ? `  openGraph: {\n    images: ['${def.ogImage}'],\n  },` : ''}
}

export default function ${this.toPascalCase(def.name)}Page() {
  return (
    <div className="${containerClass}">
${sections}
    </div>
  )
}
`
  }

  /**
   * Generate React SPA page (React Router)
   */
  private generateSPAPage(def: PageDefinition): string {
    const imports = this.generateImports(def)
    const sections = this.generateSections(def)
    const containerClass = this.getContainerClass(def.layout)

    return `import { useEffect } from 'react'
${imports}

export default function ${this.toPascalCase(def.name)}Page() {
  useEffect(() => {
    document.title = '${def.title}'
    const metaDescription = document.querySelector('meta[name="description"]')
    if (metaDescription) {
      metaDescription.setAttribute('content', '${def.description}')
    }
  }, [])

  return (
    <div className="${containerClass}">
${sections}
    </div>
  )
}
`
  }

  /**
   * Generate layout code
   */
  async generateLayout(
    layout: PageLayout,
    appType: 'multi-page' | 'spa' = 'multi-page'
  ): Promise<string> {
    if (appType === 'multi-page') {
      return this.generateNextJsLayout(layout)
    } else {
      return this.generateSPALayout(layout)
    }
  }

  /**
   * Generate Next.js App Router layout
   */
  private generateNextJsLayout(layout: PageLayout): string {
    const navigation = this.config.navigation?.enabled
      ? this.generateNavigation()
      : ''
    const bodyClass = this.getBodyClass(layout)
    const cssVars = buildCssVariables(this.config)

    return `import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: '${this.config.name}',
  description: '${this.config.description || ''}',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(cssVars)} }} />
      </head>
      <body className="${bodyClass}">
${navigation ? `        ${navigation}\n` : ''}        {children}
      </body>
    </html>
  )
}
`
  }

  /**
   * Generate React SPA layout
   */
  private generateSPALayout(layout: PageLayout): string {
    const navigation = this.config.navigation?.enabled
      ? this.generateNavigation()
      : ''
    const bodyClass = this.getBodyClass(layout)

    return `import { Outlet } from 'react-router-dom'
import './globals.css'

export default function RootLayout() {
  return (
    <div className="${bodyClass}">
${navigation ? `      ${navigation}\n` : ''}      <Outlet />
    </div>
  )
}
`
  }

  /**
   * Generate imports for page components
   */
  private generateImports(def: PageDefinition): string {
    const componentIds = new Set(
      def.sections.map(section => section.componentId)
    )

    const imports: string[] = []
    componentIds.forEach(componentId => {
      const component = getComponent(this.config, componentId)
      if (component) {
        const componentName = component.name
        imports.push(
          `import { ${componentName} } from '@/components/${componentName}'`
        )
      }
    })

    return imports.join('\n')
  }

  /**
   * Generate metadata object
   */
  private generateMetadata(def: PageDefinition): string {
    return `  title: '${def.title}',
  description: '${def.description}',`
  }

  /**
   * Generate sections JSX
   */
  private generateSections(def: PageDefinition): string {
    return def.sections
      .map((section, index) => {
        const component = getComponent(this.config, section.componentId)
        if (!component) {
          return `      {/* Missing component: ${section.componentId} */}`
        }

        const componentName = component.name
        const props = section.props || {}
        const propsString = Object.entries(props)
          .map(([key, value]) => {
            if (typeof value === 'string') {
              return `${key}="${value}"`
            }
            return `${key}={${JSON.stringify(value)}}`
          })
          .join(' ')

        const sectionClass = 'section' // Default section class
        return `      <section key="${index}" className="${sectionClass}">
        <${componentName} ${propsString} />
      </section>`
      })
      .join('\n')
  }

  /**
   * Generate navigation component
   */
  private generateNavigation(): string {
    if (!this.config.navigation?.enabled) {
      return ''
    }

    const items = this.config.navigation.items
      .map(
        item => `          <Link href="${item.route}">${item.label}</Link>`
      )
      .join('\n')

    return `<nav className="navigation">
${items}
        </nav>`
  }

  /**
   * Get container class based on layout type
   */
  private getContainerClass(layout: PageLayout): string {
    const layoutClasses: Record<PageLayout, string> = {
      'centered': 'max-w-4xl mx-auto px-4',
      'sidebar-left': 'flex',
      'sidebar-right': 'flex flex-row-reverse',
      'full-width': 'w-full',
      'grid': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    }
    return layoutClasses[layout] || ''
  }

  /**
   * Get body class based on layout type
   */
  private getBodyClass(layout: PageLayout): string {
    return 'min-h-screen bg-background text-foreground'
  }

  /**
   * Convert kebab-case to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  /**
   * Get all pages
   */
  getAllPages(): PageDefinition[] {
    return [...this.config.pages]
  }

  /**
   * Get pages by route pattern
   */
  getPagesByRoute(pattern: string): PageDefinition[] {
    return this.config.pages.filter(page => page.route.includes(pattern))
  }

  /**
   * Update config reference
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
  }

  /**
   * Get current config
   */
  getConfig(): DesignSystemConfig {
    return this.config
  }
}
