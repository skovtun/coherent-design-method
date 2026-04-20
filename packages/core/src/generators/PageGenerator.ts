/**
 * Page Generator
 *
 * Generates Next.js App Router and React SPA pages with proper component imports.
 */

import type {
  PageDefinition,
  DesignSystemConfig,
  PageSection,
  PageLayout,
  ComponentDefinition,
} from '../types/design-system.js'
import { getComponent } from '../types/design-system.js'
import { buildCssVariables } from '../utils/buildCssVariables.js'

export class PageGenerator {
  private config: DesignSystemConfig

  constructor(config: DesignSystemConfig) {
    this.config = config
  }

  /**
   * Generate page code (Next.js App Router or React SPA).
   *
   * DESIGN PRINCIPLES:
   * - Include meaningful content, not just placeholders
   * - Use semantic HTML (header, main, section, article)
   * - Make responsive with Tailwind (md:, lg: breakpoints)
   * - Add proper spacing and typography
   * - Include accessibility attributes (aria-labels)
   */
  async generate(def: PageDefinition, appType: 'multi-page' | 'spa' = 'multi-page'): Promise<string> {
    if (appType === 'multi-page') {
      return this.generateNextJSPage(def)
    } else {
      return this.generateReactSPAPage(def)
    }
  }

  /**
   * Generate Next.js App Router page.
   * CRITICAL: "use client" and export const metadata must never be in the same file (Next.js fails to compile).
   * - Client (hasForm / hooks): emit "use client", do NOT emit metadata.
   * - Server (static): emit metadata, do NOT emit "use client".
   */
  private generateNextJSPage(def: PageDefinition): string {
    const imports = this.generateImports(def)
    const sections = this.generateSections(def)
    const containerClass = this.getContainerClass(def.layout)
    const pageName = this.toPascalCase(def.name)
    const hasForm = this.hasFormFields(def)

    if (hasForm) {
      return `'use client'

import { useState } from 'react'
${imports}

export default function ${pageName}Page() {
  ${this.generateFormState(def)}
  return (
    <div className="${containerClass}">
${sections}
    </div>
  )
}
`
    }

    return `import { Metadata } from 'next'
${imports}

export const metadata: Metadata = {
  title: '${this.escapeString(def.title)}',
  description: '${this.escapeString(def.description)}',${
    def.ogImage
      ? `
  openGraph: {
    images: ['${def.ogImage}'],
  },`
      : ''
  }${
    def.noIndex
      ? `
  robots: {
    index: false,
    follow: false,
  },`
      : ''
  }
}

export default function ${pageName}Page() {
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
  private generateReactSPAPage(def: PageDefinition): string {
    const imports = this.generateImports(def)
    const sections = this.generateSections(def)
    const containerClass = this.getContainerClass(def.layout)
    const pageName = this.toPascalCase(def.name)
    const hasForm = this.hasFormFields(def)

    if (hasForm) {
      return `import { useState, useEffect } from 'react'
${imports}

export default function ${pageName}Page() {
  ${this.generateFormState(def)}
  useEffect(() => {
    document.title = '${this.escapeString(def.title)}'
  }, [])

  return (
    <main className="${containerClass}">
${sections}
    </main>
  )
}
`
    }

    return `import { useEffect } from 'react'
${imports}

export default function ${pageName}Page() {
  useEffect(() => {
    document.title = '${this.escapeString(def.title)}'
    
    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]')
    if (!metaDescription) {
      metaDescription = document.createElement('meta')
      metaDescription.setAttribute('name', 'description')
      document.head.appendChild(metaDescription)
    }
    metaDescription.setAttribute('content', '${this.escapeString(def.description)}')

    // Update Open Graph image if provided
    ${
      def.ogImage
        ? `let ogImage = document.querySelector('meta[property="og:image"]')
    if (!ogImage) {
      ogImage = document.createElement('meta')
      ogImage.setAttribute('property', 'og:image')
      document.head.appendChild(ogImage)
    }
    ogImage.setAttribute('content', '${def.ogImage}')`
        : ''
    }

    // No-index if specified
    ${
      def.noIndex
        ? `let robots = document.querySelector('meta[name="robots"]')
    if (!robots) {
      robots = document.createElement('meta')
      robots.setAttribute('name', 'robots')
      document.head.appendChild(robots)
    }
    robots.setAttribute('content', 'noindex, nofollow')`
        : ''
    }
  }, [])

  return (
    <main className="${containerClass}">
${sections}
    </main>
  )
}
`
  }

  /**
   * Generate imports for page components
   */
  private generateImports(def: PageDefinition): string {
    const componentIds = new Set<string>()
    for (const section of def.sections) {
      componentIds.add(section.componentId)
      const fields = section.props?.fields as Array<{ component?: string }> | undefined
      if (Array.isArray(fields)) {
        for (const field of fields) {
          if (field?.component) componentIds.add(field.component)
        }
      }
    }

    const imports: string[] = []
    componentIds.forEach(componentId => {
      const component = getComponent(this.config, componentId)
      if (component) {
        const componentName = component.name
        // Use kebab-case for file names (shadcn convention)
        const fileName = this.toKebabCase(componentName)
        imports.push(`import { ${componentName} } from '@/components/ui/${fileName}'`)
      }
    })

    return imports.length > 0 ? imports.join('\n') : ''
  }

  /**
   * Check if page has form fields
   */
  private hasFormFields(page: PageDefinition): boolean {
    return page.sections.some(
      section =>
        section.props?.fields && Array.isArray(section.props.fields) && (section.props.fields as unknown[]).length > 0,
    )
  }

  /**
   * Derive a single form state key from placeholder (e.g. "Your Name" -> "name")
   */
  private placeholderToStateKey(placeholder: string, componentId: string): string {
    if (componentId === 'textarea') return 'message'
    const parts = (placeholder || '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
    const key = parts.length > 0 ? parts[parts.length - 1]! : 'value'
    return key || 'value'
  }

  /**
   * Collect form state keys from page form fields (for useState initial state)
   */
  private getFormStateKeys(page: PageDefinition): string[] {
    const keys: string[] = []
    for (const section of page.sections) {
      const fields = section.props?.fields as Array<{ component?: string; placeholder?: string }> | undefined
      if (!Array.isArray(fields)) continue
      for (const field of fields) {
        const comp = String(field?.component ?? '')
        if (comp === 'button') continue
        const placeholder = String(field?.placeholder ?? '')
        keys.push(this.placeholderToStateKey(placeholder, comp))
      }
    }
    return [...new Set(keys)]
  }

  /**
   * Generate form state management (useState + handleSubmit + handleChange)
   */
  private generateFormState(page: PageDefinition): string {
    const keys = this.getFormStateKeys(page)
    const initialState = keys.length > 0 ? keys.map(k => `${k}: ''`).join(', ') : "name: '', email: '', message: ''"
    return `const [formData, setFormData] = useState({
    ${initialState},
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submitted:', formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }
`
  }

  /**
   * Generate metadata object for Next.js
   */
  private generateMetadata(def: PageDefinition): string {
    return `  title: '${this.escapeString(def.title)}',
  description: '${this.escapeString(def.description)}',`
  }

  /**
   * Generate sections JSX
   */
  private generateSections(def: PageDefinition): string {
    const sortedSections = [...def.sections].sort((a, b) => a.order - b.order)
    const availableComponents = this.config.components
    const sectionClassName = 'rounded-lg border border-border bg-card p-6 shadow-sm mb-6 last:mb-0'

    return sortedSections
      .map((section, index) => {
        const sectionKey = `section-${section.id || index}`
        const content = this.generateSection(section, availableComponents)
        return `      <section key="${sectionKey}" className="${sectionClassName}">
        ${content}
      </section>`
      })
      .join('\n')
  }

  /**
   * Generate section content with smart component rendering.
   * Button: children for text. Input/Textarea: correct props. Card: children.
   */
  private generateSection(section: PageSection, availableComponents: ComponentDefinition[]): string {
    const props = section.props || {}

    // Form section with multiple fields (e.g. contact form)
    if (Array.isArray(props.fields) && props.fields.length > 0) {
      const fieldBlocks = props.fields
        .map((field: Record<string, unknown>) => {
          const compId = String(field.component || 'input')
          const comp = availableComponents.find(c => c.id === compId)
          if (!comp) return `{/* field ${compId} not found */}`
          return this.renderFieldComponent(comp, field)
        })
        .filter(Boolean)
      const fieldsMarkup = fieldBlocks.join('\n        ')
      return `<form onSubmit={handleSubmit} className="space-y-4">
        ${fieldsMarkup}
      </form>`
    }

    const component = availableComponents.find(c => c.id === section.componentId)
    if (!component) {
      return `{/* Section: ${section.name} - component ${section.componentId} not found */}`
    }

    return this.renderSectionComponent(component, section)
  }

  /**
   * Derive form state key for a field (for name/value/onChange)
   */
  private getFieldStateKey(componentId: string, field: Record<string, unknown>): string {
    const placeholder = String(field.placeholder ?? '')
    return this.placeholderToStateKey(placeholder, componentId)
  }

  /**
   * Render a single field in a form (input, textarea, button) with state bindings
   */
  private renderFieldComponent(component: ComponentDefinition, field: Record<string, unknown>): string {
    const componentName = component.name
    const stateKey = this.getFieldStateKey(component.id, field)

    if (component.id === 'button') {
      const text = String(field.text ?? field.placeholder ?? 'Submit')
      const variant = String(field.variant ?? 'default')
      const size = String(field.size ?? 'md')
      return `<${componentName} type="submit" variant="${variant}" size="${size}">${this.escapeString(text)}</${componentName}>`
    }
    if (component.id === 'input') {
      const placeholder = String(field.placeholder ?? '')
      const type = String(field.type ?? 'text')
      return `<${componentName}
        name="${stateKey}"
        placeholder="${this.escapeString(placeholder)}"
        type="${type}"
        value={formData.${stateKey} ?? ''}
        onChange={handleChange}
      />`
    }
    if (component.id === 'textarea') {
      const placeholder = String(field.placeholder ?? '')
      const rows = Number(field.rows) || 4
      return `<${componentName}
        name="${stateKey}"
        placeholder="${this.escapeString(placeholder)}"
        rows={${rows}}
        value={formData.${stateKey} ?? ''}
        onChange={handleChange}
      />`
    }
    const propsString = this.generatePropsString(field as Record<string, any>)
    return `<${componentName}${propsString} />`
  }

  /**
   * Render section with one primary component (smart Button/Input/Textarea/Card)
   */
  private renderSectionComponent(component: ComponentDefinition, section: PageSection): string {
    const name = component.name
    const props = section.props || {}

    if (component.id === 'button') {
      const text = String(props.text ?? section.name ?? 'Click')
      const variant = String(props.variant ?? 'default')
      const size = String(props.size ?? 'md')
      return `<${name} variant="${variant}" size="${size}">${this.escapeString(text)}</${name}>`
    }

    if (component.id === 'input') {
      const placeholder = String(props.placeholder ?? section.name)
      const type = String(props.type ?? 'text')
      return `<${name} placeholder="${this.escapeString(placeholder)}" type="${type}" />`
    }

    if (component.id === 'textarea') {
      const placeholder = String(props.placeholder ?? section.name)
      const rows = typeof props.rows === 'number' ? props.rows : 4
      return `<${name} placeholder="${this.escapeString(placeholder)}" rows={${rows}} />`
    }

    if (component.id === 'card') {
      // 1. If props.children is provided (custom HTML), use it directly
      const rawChildren = props.children
      if (typeof rawChildren === 'string' && rawChildren.trim() !== '') {
        return `<${name}>\n        ${rawChildren}\n      </${name}>`
      }
      // 2. Otherwise: title from section.name, description from section.props.description
      const title = this.escapeString(section.name)
      const descRaw = props.description
      const description =
        descRaw != null && String(descRaw).trim() !== ''
          ? this.escapeString(String(descRaw).trim())
          : this.escapeString(section.name)
      const children =
        '<h3 className="font-semibold text-lg">' +
        title +
        '</h3>\n        <p className="text-muted-foreground mt-1">' +
        description +
        '</p>'
      return `<${name}>\n        ${children}\n      </${name}>`
    }

    const propsString = this.generatePropsString(props)
    return `<${name}${propsString} />`
  }

  /**
   * Generate props string for component
   */
  private generatePropsString(props: Record<string, any>): string {
    if (Object.keys(props).length === 0) {
      return ''
    }

    const propsArray = Object.entries(props).map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}="${this.escapeString(value)}"`
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        return `${key}={${value}}`
      } else if (value === null || value === undefined) {
        return `${key}={null}`
      } else {
        // Object or array
        return `${key}={${JSON.stringify(value)}}`
      }
    })

    return ' ' + propsArray.join(' ')
  }

  private isSidebarNav(): boolean {
    const navType = this.config.navigation?.type || 'header'
    return navType === 'sidebar' || navType === 'both'
  }

  private getBodyClasses(): string {
    const base = 'bg-background text-foreground antialiased'
    if (this.isSidebarNav()) {
      return `min-h-svh ${base}`
    }
    return `min-h-screen flex flex-col ${base}`
  }

  /**
   * Get container class based on layout type
   */
  private getContainerClass(layout: PageLayout): string {
    const layoutClasses: Record<PageLayout, string> = {
      centered: 'space-y-6',
      'sidebar-left': 'flex gap-6',
      'sidebar-right': 'flex flex-row-reverse gap-6',
      'full-width': 'space-y-6',
      grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
    }
    return layoutClasses[layout] || 'space-y-6'
  }

  /**
   * Generate layout code (for root layout)
   */
  async generateLayout(
    layout: PageLayout,
    appType: 'multi-page' | 'spa' = 'multi-page',
    options?: { skipNav?: boolean },
  ): Promise<string> {
    if (appType === 'multi-page') {
      return this.generateNextJSLayout(layout, options)
    } else {
      return this.generateReactSPALayout(layout)
    }
  }

  /**
   * Generate Next.js App Router root layout
   */
  private generateNextJSLayout(_layout: PageLayout, options?: { skipNav?: boolean }): string {
    const cssVars = buildCssVariables(this.config)
    const navEnabled = this.config.navigation?.enabled && !options?.skipNav
    const navRendered = navEnabled ? '<AppNav />' : ''
    const isDark = this.config.theme?.defaultMode === 'dark'
    const htmlClass = isDark ? ' className="dark"' : ''

    const appName = this.escapeString(this.config.name)
    const appDesc = this.escapeString(this.config.description || 'Built with Coherent Design Method')

    return `import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'
${navEnabled ? "import { AppNav } from './AppNav'\n" : ''}

export const metadata: Metadata = {
  title: {
    default: '${appName}',
    template: '%s | ${appName}',
  },
  description: '${appDesc}',
  icons: { icon: '/favicon.svg' },
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    siteName: '${appName}',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en"${htmlClass}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(cssVars)} }} />
      </head>
      <body className="${this.getBodyClasses()}">
${navEnabled ? `        ${navRendered}\n        ` : ''}        <div className="flex-1${this.isSidebarNav() ? '' : ' flex flex-col'}">{children}</div>
        <Link
          href="/design-system"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border/20 bg-background/80 backdrop-blur-md px-4 py-2 text-xs shadow-sm hover:bg-muted transition-colors"
          title="Design System"
        >
          Design System
        </Link>
      </body>
    </html>
  )
}
`
  }

  /**
   * Generate AppNav client component (hides on Design System and Documentation routes)
   * Documentation is part of Design System; also hide on legacy /docs for consistency.
   */
  generateAppNav(): string {
    if (!this.config.navigation?.enabled) {
      return ''
    }

    const authRoutes = new Set([
      '/login',
      '/signin',
      '/sign-in',
      '/signup',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/reset-password',
    ])
    const authCheck = [...authRoutes].map(r => `pathname === '${r}'`).join(' || ')

    const visibleItems = this.config.navigation.items.filter(
      item => !authRoutes.has(item.route) && !item.route.includes('['),
    )
    const hasMultipleItems = visibleItems.length > 1

    const items = visibleItems
      .map(
        item =>
          `<Link href="${item.route}" className={\`text-sm font-medium px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${pathname === "${item.route}" ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}\`}>${item.label}</Link>`,
      )
      .join('\n        ')

    const navItemsBlock = hasMultipleItems
      ? `<div className="flex items-center gap-1">\n        ${items}\n        </div>`
      : ''

    const COHERENT_LOGO_PATH =
      'M10 4C10.5523 4 11 4.44772 11 5V13H19C19.5523 13 20 13.4477 20 14V20.4287C19.9999 22.401 18.401 23.9999 16.4287 24H3.57129C1.59895 23.9999 7.5245e-05 22.401 0 20.4287V7.57129C7.53742e-05 5.59895 1.59895 4.00008 3.57129 4H10ZM2 20.4287C2.00008 21.2965 2.70352 21.9999 3.57129 22H9V15H2V20.4287ZM11 22H16.4287C17.2965 21.9999 17.9999 21.2965 18 20.4287V15H11V22ZM3.57129 6C2.70352 6.00008 2.00008 6.70352 2 7.57129V13H9V6H3.57129ZM20.5 0C22.433 0 24 1.567 24 3.5V9.90039C23.9998 10.5076 23.5076 10.9998 22.9004 11H14.0996C13.4924 10.9998 13.0002 10.5076 13 9.90039V1.09961C13.0002 0.492409 13.4924 0.000211011 14.0996 0H20.5ZM15 9H22V3.5C22 2.67157 21.3284 2 20.5 2H15V9Z'

    return `'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useState } from 'react'

function CoherentLogo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="${COHERENT_LOGO_PATH}" fill="currentColor"/>
    </svg>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </button>
  )
}

export function AppNav() {
  const pathname = usePathname()
  const [hasSharedHeader, setHasSharedHeader] = useState(false)

  useEffect(() => {
    fetch('/api/design-system/shared-components')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.shared?.some((c: any) => c.type === 'layout' && /header|nav/i.test(c.name))) {
          setHasSharedHeader(true)
        }
      })
      .catch(() => {})
  }, [])

  const isHidden =
    pathname?.startsWith('/design-system') ||
    pathname?.startsWith('/docs') ||
    ${authCheck}

  if (isHidden) return null

  return (
    <Fragment>
      {!hasSharedHeader && (
      <nav className="sticky top-0 z-50 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-foreground hover:text-foreground/90 transition-colors shrink-0">
              <CoherentLogo size={20} className="text-primary" />
              <span>Coherent Design Method</span>
            </Link>
            ${navItemsBlock}
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
      </nav>
      )}
    </Fragment>
  )
}
`
  }

  /**
   * Generate shared Header component code for components/shared/header.tsx.
   * Contains navigation items, theme toggle, and Design System FAB.
   */
  generateSharedHeaderCode(): string {
    const navItems = this.config.navigation?.items || []
    const authRoutes = new Set([
      '/login',
      '/signin',
      '/sign-in',
      '/signup',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/reset-password',
    ])
    const marketingRoutes = new Set(['/', '/landing', '/pricing', '/about', '/contact', '/blog', '/features'])
    const isSubRoute = (route: string) => route.replace(/^\//, '').split('/').length > 1
    const visibleItems = navItems.filter(
      item =>
        !marketingRoutes.has(item.route) &&
        !authRoutes.has(item.route) &&
        !item.route.includes('[') &&
        !isSubRoute(item.route),
    )

    const grouped = new Map<string, typeof visibleItems>()
    const ungrouped: typeof visibleItems = []
    for (const item of visibleItems) {
      if (item.group) {
        const list = grouped.get(item.group) || []
        list.push(item)
        grouped.set(item.group, list)
      } else if (item.children && item.children.length > 0) {
        grouped.set(item.label, [item])
      } else {
        ungrouped.push(item)
      }
    }

    const hasDropdowns = grouped.size > 0
    const hasAuthItems = navItems.some(item => authRoutes.has(item.route))

    const authItems = navItems.filter(item => authRoutes.has(item.route))
    const signInItem = authItems.find(item => /sign.?in|login/i.test(item.label))
    const signUpItem = authItems.find(item => /sign.?up|register/i.test(item.label))

    const linkItems = ungrouped
      .map(
        item =>
          `<Link href="${item.route}" className={\`text-sm font-medium px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${pathname === "${item.route}" ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}\`}>${item.label}</Link>`,
      )
      .join('\n            ')

    const dropdownBlocks: string[] = []
    for (const [groupName, items] of grouped) {
      const parentItem = items.length === 1 && items[0].children ? items[0] : null
      const childItems = parentItem ? parentItem.children! : items
      const triggerLabel = parentItem ? parentItem.label : groupName

      const menuItems = childItems
        .map(
          child =>
            `                  <DropdownMenuItem asChild>
                    <Link href="${child.route}" className="w-full">${child.label}</Link>
                  </DropdownMenuItem>`,
        )
        .join('\n')

      dropdownBlocks.push(`<DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                ${triggerLabel}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
${menuItems}
              </DropdownMenuContent>
            </DropdownMenu>`)
    }

    const allNavElements = [linkItems, ...dropdownBlocks].filter(Boolean).join('\n            ')
    const navItemsBlock = allNavElements ? `\n            ${allNavElements}\n            ` : ''

    const authButtonsBlock =
      hasAuthItems && (signInItem || signUpItem)
        ? `${signInItem ? `\n            <Link href="${signInItem.route}" className="text-sm font-medium px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">${signInItem.label}</Link>` : ''}${signUpItem ? `\n            <Link href="${signUpItem.route}" className="inline-flex items-center justify-center text-sm font-medium h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">${signUpItem.label}</Link>` : ''}`
        : ''

    const dropdownImport = hasDropdowns
      ? `\nimport { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'`
      : ''

    const sheetImport = `\nimport { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'`

    const appName = this.escapeString(this.config.name)

    const mobileNavItems = [...ungrouped]
    for (const [, items] of grouped) {
      const parentItem = items.length === 1 && items[0].children ? items[0] : null
      const childItems = parentItem ? parentItem.children! : items
      mobileNavItems.push(...childItems)
    }

    const mobileLinks = mobileNavItems
      .map(
        item =>
          `<Link href="${item.route}" onClick={() => setMobileOpen(false)} className={\`block text-sm font-medium px-3 py-2 rounded-md transition-colors \${pathname === "${item.route}" ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}\`}>${item.label}</Link>`,
      )
      .join('\n            ')

    const mobileAuthBlock =
      hasAuthItems && (signInItem || signUpItem)
        ? `\n            <div className="border-t pt-3 mt-2 space-y-1">${signInItem ? `\n              <Link href="${signInItem.route}" onClick={() => setMobileOpen(false)} className="block text-sm font-medium px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">${signInItem.label}</Link>` : ''}${signUpItem ? `\n              <Link href="${signUpItem.route}" onClick={() => setMobileOpen(false)} className="block text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-center">${signUpItem.label}</Link>` : ''}\n            </div>`
        : ''

    return `'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'${dropdownImport}${sheetImport}

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </button>
  )
}

export function Header() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  if (pathname?.startsWith('/design-system')) return null
  return (
    <>
      <nav className="sticky top-0 z-50 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/90 transition-colors shrink-0">
              ${appName}
            </Link>
            <div className="hidden md:flex items-center gap-1">${navItemsBlock}</div>
          </div>
          <div className="flex items-center gap-1">${authButtonsBlock}
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex md:hidden items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Toggle menu"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-4">
                <nav className="flex flex-col gap-1 pt-8">
                  ${mobileLinks}${mobileAuthBlock}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
      <Link
        href="/design-system"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-foreground/20 bg-foreground/80 backdrop-blur-md text-background px-4 py-2 text-xs shadow-sm hover:bg-foreground/90 transition-all"
        title="Design System"
      >
        Design System
      </Link>
    </>
  )
}
`
  }

  /**
   * Generate shared Footer component code for components/shared/footer.tsx.
   */
  generateSharedFooterCode(): string {
    const appName = this.escapeString(this.config.name)
    const navItems = this.config.navigation?.items || []
    const authRoutes = new Set([
      '/login',
      '/signin',
      '/sign-in',
      '/signup',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/reset-password',
    ])
    const marketingRoutes = new Set(['/', '/landing', '/pricing', '/about', '/contact', '/blog', '/features'])
    const isSubRoute = (route: string) => route.replace(/^\//, '').split('/').length > 1
    const appLinks = navItems
      .filter(
        item =>
          !marketingRoutes.has(item.route) &&
          !authRoutes.has(item.route) &&
          !item.route.includes('[') &&
          !isSubRoute(item.route),
      )
      .slice(0, 4)

    const linkElements = appLinks
      .map(
        item =>
          `            <Link href="${item.route}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">${item.label}</Link>`,
      )
      .join('\n')

    const marketingLinks = navItems.filter(item => marketingRoutes.has(item.route) && item.route !== '/').slice(0, 3)

    const marketingLinkElements = marketingLinks
      .map(
        item =>
          `            <Link href="${item.route}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">${item.label}</Link>`,
      )
      .join('\n')

    const hasMarketingLinks = marketingLinks.length > 0
    const companyColumn = hasMarketingLinks
      ? `          <div className="flex flex-col space-y-3">
            <p className="text-sm font-medium text-foreground">Company</p>
${marketingLinkElements}
          </div>`
      : ''

    const hasProductLinks = appLinks.length > 0
    const colCount = 1 + (hasProductLinks ? 1 : 0) + (hasMarketingLinks ? 1 : 0)
    const mdGridCols = `md:grid-cols-${colCount}`

    const productColumn = hasProductLinks
      ? `          <div className="flex flex-col space-y-3">
            <p className="text-sm font-medium text-foreground">Product</p>
${linkElements}
          </div>`
      : ''

    return `'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Footer() {
  const pathname = usePathname()
  if (pathname?.startsWith('/design-system')) return null
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 py-10 ${mdGridCols}">
          <div>
            <Link href="/" className="text-sm font-semibold text-foreground hover:text-foreground/90 transition-colors">
              ${appName}
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">
              Modern project management for teams of all sizes.
            </p>
          </div>
${productColumn}
${companyColumn}
        </div>
        <div className="flex items-center justify-between border-t py-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} ${appName}. All rights reserved.</p>
          <div className="flex gap-4">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
`
  }

  /**
   * Generate shared Sidebar component code using shadcn/ui Sidebar.
   * Used when navigation.type is 'sidebar' or 'both'.
   */
  generateSharedSidebarCode(): string {
    const navItems = this.config.navigation?.items || []
    const authRoutes = new Set([
      '/login',
      '/signin',
      '/sign-in',
      '/signup',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/reset-password',
    ])
    const marketingRoutes = new Set(['/', '/landing', '/pricing', '/about', '/contact', '/blog', '/features'])
    const isSubRoute = (route: string) => route.replace(/^\//, '').split('/').length > 1

    const visibleItems = navItems.filter(
      item =>
        !marketingRoutes.has(item.route) &&
        !authRoutes.has(item.route) &&
        !item.route.includes('[') &&
        !isSubRoute(item.route),
    )

    const grouped = new Map<string, typeof visibleItems>()
    const ungrouped: typeof visibleItems = []
    for (const item of visibleItems) {
      if (item.group) {
        const list = grouped.get(item.group) || []
        list.push(item)
        grouped.set(item.group, list)
      } else {
        ungrouped.push(item)
      }
    }

    const menuItem = (item: { route: string; label: string }) =>
      `              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname?.startsWith("${item.route}")}>
                  <Link href="${item.route}">${item.label}</Link>
                </SidebarMenuButton>
              </SidebarMenuItem>`

    const ungroupedItems = ungrouped.map(menuItem).join('\n')

    const groupBlocks = Array.from(grouped.entries())
      .map(([groupName, items]) => {
        const groupItems = items.map(menuItem).join('\n')
        return `          <SidebarGroup>
            <SidebarGroupLabel>${groupName}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
${groupItems}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>`
      })
      .join('\n')

    const mainGroup = ungroupedItems
      ? `          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
${ungroupedItems}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>`
      : ''

    const allGroups = [mainGroup, groupBlocks].filter(Boolean).join('\n')

    const appName = this.escapeString(this.config.name)

    return `'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function AppSidebar() {
  const pathname = usePathname()

  if (pathname?.startsWith('/design-system')) return null

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center px-2 py-1">
            <Link href="/" className="text-sm font-semibold text-foreground truncate">
              ${appName}
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
${allGroups}
        </SidebarContent>
      </Sidebar>
    </>
  )
}
`
  }

  /**
   * Generate React SPA root layout
   */
  private generateReactSPALayout(_layout: PageLayout): string {
    const navigation = this.config.navigation?.enabled ? this.generateNavigation('react-router') : ''

    return `import { Outlet } from 'react-router-dom'
import './globals.css'
${this.config.navigation?.enabled ? "import { Link } from 'react-router-dom'\n" : ''}

export default function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
${navigation ? `      ${navigation}\n` : ''}      <Outlet />
    </div>
  )
}
`
  }

  /**
   * Generate navigation component
   */
  private generateNavigation(framework: 'nextjs' | 'react-router'): string {
    if (!this.config.navigation?.enabled) {
      return ''
    }

    const items = this.config.navigation.items
      .map(item => {
        if (framework === 'nextjs') {
          return `            <Link href="${item.route}" className="nav-link">${item.label}</Link>`
        } else {
          return `            <Link to="${item.route}" className="nav-link">${item.label}</Link>`
        }
      })
      .join('\n')

    const navType = this.config.navigation.type || 'header'
    const navClassName =
      navType === 'header'
        ? 'flex items-center gap-4 p-4 border-b'
        : navType === 'sidebar'
          ? 'flex flex-col gap-2 p-4 border-r min-h-screen'
          : 'flex items-center gap-4 p-4'

    return `<nav className="${navClassName}">
${items}
        </nav>`
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
   * Convert PascalCase to kebab-case
   */
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  }

  /**
   * Escape string for use in template literals
   */
  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n')
  }

  /**
   * Update config reference
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
  }
}
