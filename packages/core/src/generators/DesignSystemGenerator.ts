/**
 * Design System Generator
 *
 * Generates design system pages: layout, home, component showcases, tokens.
 */

import type { DesignSystemConfig, ComponentDefinition } from '../types/design-system.js'
import {
  DESIGN_SYSTEM_LAYOUT,
  COMPONENT_SHOWCASE,
  COMPONENT_DYNAMIC_PAGE,
  COMPONENT_SHOWCASE_CLIENT,
  SHARED_COMPONENTS_INDEX_PAGE,
  SHARED_COMPONENT_DETAIL_PAGE,
} from './templates/design-system/index.js'
import { DESIGN_SYSTEM_CONFIG_API } from './templates/api/design-system-config.js'
import { DESIGN_SYSTEM_CHANGES_API } from './templates/api/design-system-changes.js'
import { SHARED_COMPONENTS_API, SHARED_COMPONENT_DETAIL_API } from './templates/api/shared-components-api.js'

export class DesignSystemGenerator {
  constructor(private config: DesignSystemConfig) {}

  /**
   * Generate design system pages structure (dynamic: reads config at runtime)
   */
  public generateStructure(): Map<string, string> {
    const files = new Map<string, string>()

    files.set('app/design-system/layout.tsx', DESIGN_SYSTEM_LAYOUT)
    files.set('app/design-system/page.tsx', this.generateDynamicHome())
    files.set('app/design-system/components/page.tsx', this.generateComponentsIndexPage())

    files.set('app/design-system/components/[id]/page.tsx', COMPONENT_DYNAMIC_PAGE)
    files.set('app/design-system/components/[id]/ComponentShowcase.tsx', COMPONENT_SHOWCASE_CLIENT)

    files.set('app/api/design-system/config/route.ts', DESIGN_SYSTEM_CONFIG_API)
    files.set('app/api/design-system/changes/route.ts', DESIGN_SYSTEM_CHANGES_API)
    files.set('app/api/design-system/shared-components/route.ts', SHARED_COMPONENTS_API)
    files.set('app/api/design-system/shared-components/[id]/route.ts', SHARED_COMPONENT_DETAIL_API)

    files.set('app/design-system/shared/page.tsx', SHARED_COMPONENTS_INDEX_PAGE)
    files.set('app/design-system/shared/[id]/page.tsx', SHARED_COMPONENT_DETAIL_PAGE)

    files.set('app/design-system/tokens/page.tsx', this.generateTokensHome())
    files.set('app/design-system/tokens/colors/page.tsx', this.generateColorsPage())
    files.set('app/design-system/tokens/typography/page.tsx', this.generateTypographyPage())
    files.set('app/design-system/tokens/spacing/page.tsx', this.generateSpacingPage())

    files.set('app/design-system/sitemap/page.tsx', this.generateSitemapPage())

    return files
  }

  /**
   * Generate design system home page (fetches config from API at runtime) — Console skin.
   */
  private generateDynamicHome(): string {
    return `'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Change {
  type: string
  description: string
  timestamp: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return \`\${mins}m ago\`
  if (hrs < 24) return \`\${hrs}h ago\`
  if (days < 7) return \`\${days}d ago\`
  return new Date(iso).toLocaleDateString()
}

const TYPE_LABELS: Record<string, string> = {
  'add-page': 'PAGE',
  'modify-page': 'PAGE',
  'add-component': 'COMP',
  'modify-component': 'COMP',
  'modify-tokens': 'TOKEN',
  'modify-config': 'CONFIG',
  init: 'INIT',
}

const TYPE_TONE: Record<string, string> = {
  'add-page': 'text-primary',
  'modify-page': 'text-muted-foreground',
  'add-component': 'text-primary',
  'modify-component': 'text-muted-foreground',
  'modify-tokens': 'text-muted-foreground',
  'modify-config': 'text-muted-foreground',
  init: 'text-primary',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  )
}

function activityLevel(changes: Change[]): { total: number; days: Map<string, number> } {
  const days = new Map<string, number>()
  for (const c of changes) {
    const d = c.timestamp.slice(0, 10)
    days.set(d, (days.get(d) ?? 0) + 1)
  }
  return { total: changes.length, days }
}

export default function DesignSystemPage() {
  const [components, setComponents] = useState<any[]>([])
  const [tokens, setTokens] = useState<any>(null)
  const [pages, setPages] = useState<any[]>([])
  const [changes, setChanges] = useState<Change[]>([])
  const [sharedCount, setSharedCount] = useState(0)

  useEffect(() => {
    fetch('/api/design-system/config')
      .then((res) => res.json())
      .then((data) => {
        setComponents(data.components ?? [])
        setTokens(data.tokens ?? null)
        setPages(data.pages ?? [])
      })
      .catch(() => {})
    fetch('/api/design-system/changes')
      .then((res) => res.json())
      .then((data) => setChanges(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch('/api/design-system/shared-components')
      .then((res) => res.json())
      .then((data) => setSharedCount((data.shared ?? []).length))
      .catch(() => {})
  }, [])

  const colorCount = tokens?.colors?.light ? Object.keys(tokens.colors.light).length : 0
  const spacingCount = tokens?.spacing ? Object.keys(tokens.spacing).length : 0
  const radiusCount = tokens?.radius ? Object.keys(tokens.radius).length : 0
  const tokenTotal = colorCount + spacingCount + radiusCount
  const { days: actDays } = activityLevel(changes)

  const totalDays = 364
  const last364 = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (totalDays - 1 - i))
    return d.toISOString().slice(0, 10)
  })
  const countToLevel = (count: number) => (count === 0 ? 0 : Math.min(4, Math.ceil(count / 3)))
  const weeks = 52
  const rows = 7
  const monthLabel = (col: number) => {
    const idx = col * rows
    const day = last364[idx]
    if (!day) return ''
    const d = new Date(day + 'T12:00:00')
    if (d.getDate() > 7) return ''
    return d.toLocaleDateString(undefined, { month: 'short' })
  }

  const summary = [
    { href: '/design-system/components', label: 'components', value: components.length, hint: 'view all' },
    { href: '/design-system/shared', label: 'shared', value: sharedCount, hint: 'header · footer · etc' },
    { href: '/design-system/tokens', label: 'tokens', value: tokenTotal, hint: 'colors · spacing · radius' },
    { href: '/design-system/sitemap', label: 'pages', value: pages.length, hint: 'sitemap & analysis' },
  ]

  const quickLinks = [
    { href: '/design-system/components', label: 'Components', meta: String(components.length) },
    { href: '/design-system/shared', label: 'Shared Components', meta: String(sharedCount) },
    { href: '/design-system/tokens/colors', label: 'Colors', meta: String(colorCount), swatches: true },
    { href: '/design-system/tokens/typography', label: 'Typography', meta: '' },
    { href: '/design-system/tokens/spacing', label: 'Spacing & Radius', meta: String(spacingCount + radiusCount) },
    { href: '/design-system/docs', label: 'Documentation', meta: '' },
    { href: '/design-system/recommendations', label: 'Recommendations', meta: '' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER */}
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Design System
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Components, tokens, and recent activity — for this project.
        </p>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-md border border-border bg-card p-4 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {s.label}
            </div>
            <div className="mt-1.5 font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums text-foreground">
              {s.value}
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-muted-foreground/70">
              <span>{s.hint}</span>
              <ArrowIcon className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>
        ))}
      </div>

      {/* ACTIVITY HEATMAP */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>activity · last year</SectionLabel>
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
            {changes.length} events
          </span>
        </div>
        <div className="w-full overflow-x-auto pb-1">
          <div className="mb-1 flex min-w-0 gap-0.5 font-mono text-[9px] text-muted-foreground/70 sm:gap-1">
            {Array.from({ length: weeks }, (_, col) => (
              <span key={col} className="w-2.5 min-w-2.5 shrink-0 sm:w-3 sm:min-w-3">{monthLabel(col).toLowerCase()}</span>
            ))}
          </div>
          <div className="flex min-w-0 items-start gap-0.5 touch-pan-x sm:gap-1">
          {Array.from({ length: weeks }, (_, col) => (
            <div key={col} className="flex shrink-0 flex-col gap-0.5">
              {Array.from({ length: rows }, (_, row) => {
                const idx = col * rows + row
                const day = last364[idx]
                if (!day) return null
                const count = actDays.get(day) ?? 0
                const level = countToLevel(count)
                return (
                  <div
                    key={day}
                    className="size-2.5 min-w-2.5 rounded-[2px] transition-colors sm:size-3 sm:min-w-3 sm:rounded-sm"
                    style={{
                      backgroundColor:
                        level === 0
                          ? 'hsl(var(--border))'
                          : level === 1
                            ? 'color-mix(in srgb, hsl(var(--primary)) 25%, hsl(var(--border)))'
                            : level === 2
                              ? 'color-mix(in srgb, hsl(var(--primary)) 50%, hsl(var(--border)))'
                              : level === 3
                                ? 'color-mix(in srgb, hsl(var(--primary)) 75%, hsl(var(--border)))'
                                : 'hsl(var(--primary))',
                    }}
                    title={\`\${day}: \${count} change\${count === 1 ? '' : 's'}\`}
                  />
                )
              })}
            </div>
          ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
          <span>less</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="size-2.5 shrink-0 rounded-[2px] sm:size-3 sm:rounded-sm"
                style={{
                  backgroundColor:
                    i === 0
                      ? 'hsl(var(--border))'
                      : \`color-mix(in srgb, hsl(var(--primary)) \${i * 25}%, hsl(var(--border)))\`,
                }}
              />
            ))}
          </div>
          <span>more</span>
        </div>
        {changes.length === 0 && (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground/70">
            no activity yet · run <code className="rounded border border-border bg-muted px-1.5 py-0.5 text-foreground">coherent chat</code> to start
          </p>
        )}
      </div>

      {/* TWO-COL — QUICK LINKS + RECENT CHANGES */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <SectionLabel>quick links</SectionLabel>
          </div>
          <div className="flex flex-col p-2">
            {quickLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center justify-between rounded-md px-3 py-2 font-mono text-[12.5px] text-foreground outline-none transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-2.5">
                  <span>{l.label}</span>
                  {l.swatches && (
                    <div className="flex gap-0.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                      <span className="h-2.5 w-2.5 rounded-sm border border-border bg-muted-foreground" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-destructive" />
                    </div>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10.5px] tabular-nums text-muted-foreground/70">
                  {l.meta}
                  <ArrowIcon />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <SectionLabel>recent changes</SectionLabel>
          </div>
          <div className="p-2">
            {changes.length === 0 ? (
              <p className="px-2 py-3 font-mono text-[11.5px] text-muted-foreground/70">
                no changes recorded yet
              </p>
            ) : (
              <div className="flex flex-col">
                {changes.slice(0, 10).map((change, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-border px-3 py-2 font-mono text-[11.5px] last:border-0">
                    <span className={\`mt-0.5 shrink-0 rounded-[3px] border border-border bg-muted px-1.5 text-[9px] uppercase tracking-[0.08em] \${TYPE_TONE[change.type] || 'text-muted-foreground'}\`}>
                      {TYPE_LABELS[change.type] || 'EVENT'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground">{change.description}</div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">{timeAgo(change.timestamp)}</div>
                    </div>
                  </div>
                ))}
                {changes.length > 10 && (
                  <p className="pt-2 text-center font-mono text-[10.5px] text-muted-foreground/70">
                    + {changes.length - 10} more changes
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
`
  }

  /**
   * Generate design system components index page — Console skin.
   */
  private generateComponentsIndexPage(): string {
    return `'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function ComponentsIndexPage() {
  const [components, setComponents] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/design-system/config')
      .then((res) => res.json())
      .then((data) => setComponents(data.components ?? []))
      .catch(() => setComponents([]))
  }, [])

  const grouped = components.reduce((acc: Record<string, any[]>, c) => {
    const cat = c.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(c)
    return acc
  }, {})

  const variantSizeLabel = (comp: any) => {
    const v = comp.variants?.length ?? 0
    const s = comp.sizes?.length ?? 0
    if (v === 0 && s === 0) return 'default'
    const parts = []
    if (v > 0) parts.push(\`\${v} variant\${v !== 1 ? 's' : ''}\`)
    if (s > 0) parts.push(\`\${s} size\${s !== 1 ? 's' : ''}\`)
    return parts.join(' · ')
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Components
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          {components.length} component{components.length !== 1 ? 's' : ''} · click a card for variants, sizes, and code.
        </p>
      </div>
      {Object.entries(grouped).map(([category, comps]) => (
        <section key={category} className="flex flex-col gap-3">
          <SectionLabel>{category.replace(/-/g, ' ')}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(comps as any[]).map((comp) => (
              <Link
                key={comp.id}
                href={\`/design-system/components/\${comp.id}\`}
                className="group flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-foreground">{comp.name}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                    {variantSizeLabel(comp)}
                  </div>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-2 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
`
  }

  private generateComponentPage(component: ComponentDefinition): string {
    const variantExamples =
      component.variants.length > 0
        ? component.variants
            .map(
              v => `<div className="flex items-center gap-4">
        <${component.name} variant="${v.name}">
          ${v.name}
        </${component.name}>
        <code className="text-xs text-muted-foreground">variant="${v.name}"</code>
      </div>`,
            )
            .join('\n          ')
        : `<div className="text-sm text-muted-foreground">No variants</div>`

    const sizeExamples =
      component.sizes.length > 0
        ? component.sizes
            .map(
              s => `<div className="flex items-center gap-4">
        <${component.name} size="${s.name}">
          ${s.name}
        </${component.name}>
        <code className="text-xs text-muted-foreground">size="${s.name}"</code>
      </div>`,
            )
            .join('\n          ')
        : `<div className="text-sm text-muted-foreground">No sizes</div>`

    const usageCode = this.getUsageCode(component)

    return COMPONENT_SHOWCASE.replace(/{{COMPONENT_NAME}}/g, component.name)
      .replace(/{{COMPONENT_ID}}/g, component.id)
      .replace('{{COMPONENT_DESCRIPTION}}', this.getComponentDescription(component))
      .replace('{{COMPONENT_CATEGORY}}', component.category)
      .replace('{{VARIANT_EXAMPLES}}', variantExamples)
      .replace('{{SIZE_EXAMPLES}}', sizeExamples)
      .replace('{{USAGE_CODE_JSON}}', JSON.stringify(usageCode))
      .replace('{{PROPS_TABLE}}', this.generatePropsTable(component))
  }

  private getComponentDescription(component: ComponentDefinition): string {
    const descriptions: Record<string, string> = {
      button: 'Trigger actions and navigate the interface',
      input: 'Accept user text input',
      textarea: 'Accept multi-line user text input',
      checkbox: 'Toggle a single option on or off',
      select: 'Select one option from a dropdown',
      card: 'Container for content with optional header and footer',
      dialog: 'Modal dialog for focused tasks',
      badge: 'Display status or count',
      label: 'Label for form controls',
      alert: 'Display important feedback messages',
      progress: 'Show progress of a task',
      avatar: 'Display user or entity image',
      table: 'Display tabular data',
      separator: 'Visual divider between content',
      tabs: 'Organize content into switchable panels',
      accordion: 'Collapsible content sections',
    }
    return descriptions[component.id] ?? `${component.name} component`
  }

  private getUsageCode(component: ComponentDefinition): string {
    const defaultVariant = component.variants[0]?.name ?? 'default'
    const defaultSize = component.sizes[0]?.name ?? 'md'

    if (component.id === 'button') {
      return `<Button variant="${defaultVariant}" size="${defaultSize}">Click me</Button>`
    }
    if (component.id === 'input') {
      return `<Input placeholder="Enter text..." />`
    }
    if (component.id === 'textarea') {
      return `<Textarea placeholder="Enter message..." rows={4} />`
    }
    if (component.id === 'card') {
      return `<Card>\n  <h3>Title</h3>\n  <p>Content</p>\n</Card>`
    }

    return `<${component.name} />`
  }

  private generatePropsTable(component: ComponentDefinition): string {
    const variantType =
      component.variants.length > 0 ? component.variants.map(v => `"${v.name}"`).join(' | ') : 'string'
    const sizeType = component.sizes.length > 0 ? component.sizes.map(s => `"${s.name}"`).join(' | ') : 'string'
    const defaultVariant = component.variants[0]?.name ?? 'default'
    const defaultSize = component.sizes[0]?.name ?? 'md'

    const props = [
      { name: 'variant', type: variantType, default: `"${defaultVariant}"` },
      { name: 'size', type: sizeType, default: `"${defaultSize}"` },
      { name: 'className', type: 'string', default: 'undefined' },
    ]

    return props
      .map(
        prop => `<tr className="border-b">
        <td className="p-3 font-mono">${prop.name}</td>
        <td className="p-3 font-mono text-xs">${prop.type}</td>
        <td className="p-3 font-mono text-xs">${prop.default}</td>
      </tr>`,
      )
      .join('\n              ')
  }

  private generateTokensHome(): string {
    return `import Link from 'next/link'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function TokensPage() {
  const cards = [
    {
      href: '/design-system/tokens/colors',
      label: 'Colors',
      hint: 'light and dark palettes',
      preview: (
        <div className="flex gap-1">
          <div className="size-4 rounded-sm bg-primary" />
          <div className="size-4 rounded-sm border border-border bg-muted-foreground" />
          <div className="size-4 rounded-sm bg-destructive" />
        </div>
      ),
    },
    {
      href: '/design-system/tokens/typography',
      label: 'Typography',
      hint: 'font families, sizes, weights',
      preview: (
        <span className="font-mono text-[22px] font-medium leading-none tracking-tight text-foreground">Aa</span>
      ),
    },
    {
      href: '/design-system/tokens/spacing',
      label: 'Spacing & Radius',
      hint: 'scale and border radius',
      preview: (
        <div className="flex items-end gap-1.5">
          <div className="w-2 rounded-sm bg-primary/70" style={{ height: 6 }} />
          <div className="w-2 rounded-sm bg-primary/70" style={{ height: 12 }} />
          <div className="w-2 rounded-sm bg-primary/70" style={{ height: 18 }} />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Design Tokens
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Color, typography, spacing, and radius that define your design system.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-3 rounded-md border border-border bg-card p-5 outline-none transition-colors hover:border-primary/50 hover:bg-muted"
          >
            <div className="flex h-8 items-center">{c.preview}</div>
            <div>
              <div className="text-[14px] font-medium text-foreground">{c.label}</div>
              <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-muted-foreground/70">
                <span>{c.hint}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
`
  }

  private generateColorsPage(): string {
    return `'use client'
import { useEffect, useState } from 'react'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

function ColorRow({ name, value, cssVar }: { name: string; value: string; cssVar?: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-3 py-2 font-mono last:border-0">
      <div className="h-9 w-9 shrink-0 rounded-md border border-border" style={{ backgroundColor: value }} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-foreground">{name}</div>
        <div className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground/70">
          {value}
          {cssVar && (<>{' · '}<span className="text-primary">var({cssVar})</span></>)}
        </div>
      </div>
    </div>
  )
}

export default function ColorsPage() {
  const [tokens, setTokens] = useState<{ colors?: { light?: Record<string, string>; dark?: Record<string, string> } } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/design-system/config')
      .then((res) => res.json())
      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })
      .catch(() => { setTokens(null); setLoading(false) })
  }, [])

  const light = tokens?.colors?.light ?? {}
  const dark = tokens?.colors?.dark ?? {}
  const keys = Array.from(new Set([...Object.keys(light), ...Object.keys(dark)]))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Color Tokens
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Design system color variables — light and dark themes.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-[11.5px] text-muted-foreground/70">loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-3">
              <SectionLabel>light · palette</SectionLabel>
            </div>
            {keys.length === 0 ? (
              <p className="px-4 py-6 font-mono text-[11.5px] text-muted-foreground/70">no color tokens</p>
            ) : (
              <div className="p-2">
                {keys.map((key) => {
                  const value = light[key]
                  if (!value) return null
                  return <ColorRow key={\`light-\${key}\`} name={key} value={value} cssVar={\`--\${key}\`} />
                })}
              </div>
            )}
          </div>
          <div className="dark overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-3">
              <SectionLabel>dark · palette</SectionLabel>
            </div>
            {keys.length === 0 ? (
              <p className="px-4 py-6 font-mono text-[11.5px] text-muted-foreground/70">no color tokens</p>
            ) : (
              <div className="p-2">
                {keys.map((key) => {
                  const value = dark[key]
                  if (!value) return null
                  return <ColorRow key={\`dark-\${key}\`} name={key} value={value} />
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
`
  }

  private generateTypographyPage(): string {
    return `'use client'
import { useEffect, useState } from 'react'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted px-4 py-3">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function TypographyPage() {
  const [tokens, setTokens] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/design-system/config')
      .then((res) => res.json())
      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })
      .catch(() => { setTokens(null); setLoading(false) })
  }, [])

  const typography = tokens?.typography ?? {}
  const fontFamily = typography.fontFamily ?? {}
  const fontSize = typography.fontSize ?? {}
  const fontWeight = typography.fontWeight ?? {}
  const lineHeight = typography.lineHeight ?? {}

  const remToPx = (rem: string) => {
    const val = parseFloat(rem)
    return isNaN(val) ? rem : \`\${val * 16}px\`
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Typography
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Font families, sizes, weights, and line heights.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-[11.5px] text-muted-foreground/70">loading…</p>
      ) : (
        <>
          <Card title="font families">
            <div className="flex flex-col gap-5">
              {Object.entries(fontFamily).map(([name, value]) => (
                <div key={name} className="flex flex-col gap-1">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">{name}</div>
                  <div className="font-mono text-[10.5px] text-muted-foreground/70">{value as string}</div>
                  <div className="text-[18px] text-foreground" style={{ fontFamily: value as string }}>
                    The quick brown fox jumps over the lazy dog
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="font sizes">
            <div className="flex flex-col gap-5">
              {Object.entries(fontSize).map(([name, value]) => (
                <div key={name} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 font-mono text-[10.5px]">
                    <span className="uppercase tracking-[0.14em] text-muted-foreground/70">{name}</span>
                    <span className="tabular-nums text-muted-foreground/70">{value as string} · {remToPx(value as string)}</span>
                  </div>
                  <div className="text-foreground" style={{ fontSize: value as string, lineHeight: 1.2 }}>
                    The quick brown fox jumps over the lazy dog
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="font weights">
            <div className="flex flex-wrap gap-6">
              {Object.entries(fontWeight).map(([name, value]) => (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div className="text-[28px] leading-none text-foreground" style={{ fontWeight: value as number }}>Aa</div>
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">{name}</div>
                  <div className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{String(value)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="line heights">
            <div className="flex flex-col gap-4">
              {Object.entries(lineHeight).map(([name, value]) => (
                <div key={name} className="flex flex-col gap-1.5">
                  <div className="font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
                    <span className="uppercase tracking-[0.14em]">{name}</span>{' · '}<span>{String(value)}</span>
                  </div>
                  <div className="max-w-md rounded-md border border-border bg-muted p-3 text-[13px] text-foreground" style={{ lineHeight: value as number }}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
`
  }

  private generateSpacingPage(): string {
    return `'use client'
import { useEffect, useState } from 'react'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function SpacingPage() {
  const [tokens, setTokens] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/design-system/config')
      .then((res) => res.json())
      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })
      .catch(() => { setTokens(null); setLoading(false) })
  }, [])

  const spacing = tokens?.spacing ?? {}
  const radius = tokens?.radius ?? {}

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Spacing & Radius
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Scale and border radius tokens — used across every component.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-[11.5px] text-muted-foreground/70">loading…</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-3">
              <SectionLabel>spacing · scale</SectionLabel>
            </div>
            <div className="p-4">
              {Object.keys(spacing).length === 0 ? (
                <p className="font-mono text-[11.5px] text-muted-foreground/70">no spacing tokens</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(spacing).map(([name, value]) => (
                    <div key={name} className="grid grid-cols-[56px_96px_1fr] items-center gap-3 font-mono text-[12px]">
                      <div className="text-right font-medium text-foreground">{name}</div>
                      <div className="text-[10.5px] tabular-nums text-muted-foreground/70">{value as string}</div>
                      <div className="h-5 rounded-sm bg-primary/70" style={{ width: value as string }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border bg-muted px-4 py-3">
              <SectionLabel>border radius</SectionLabel>
            </div>
            <div className="p-4">
              {Object.keys(radius).length === 0 ? (
                <p className="font-mono text-[11.5px] text-muted-foreground/70">no radius tokens</p>
              ) : (
                <div className="flex flex-wrap gap-5">
                  {Object.entries(radius).map(([name, value]) => (
                    <div key={name} className="flex flex-col items-center gap-1.5">
                      <div className="h-14 w-14 border-2 border-primary/70 bg-primary/10" style={{ borderRadius: value as string }} />
                      <div className="font-mono text-[11px] font-medium text-foreground">{name}</div>
                      <div className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{value as string}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
`
  }

  private generateSitemapPage(): string {
    return `import { readFileSync } from 'fs'
import { join } from 'path'
import Link from 'next/link'

function loadPages() {
  try {
    const raw = readFileSync(join(process.cwd(), 'design-system.config.ts'), 'utf-8')
    const jsonMatch = raw.match(/export\\s+const\\s+config\\s*=\\s*/)
    const jsonStart = jsonMatch ? raw.indexOf('{', raw.indexOf(jsonMatch[0])) : -1
    if (jsonStart === -1) return []
    let jsonStr = raw.slice(jsonStart)
    jsonStr = jsonStr.replace(/\\}\\s*(as\\s+const|satisfies\\s+\\w+)\\s*;?\\s*$/, '}')
    jsonStr = jsonStr.replace(/,\\s*([\\]\\}])/g, '$1')
    const json = JSON.parse(jsonStr)
    return (json.pages || [])
      .filter((p: any) => {
        const route = p.route || '/' + p.id
        return !route.includes('[') && !route.includes(']')
      })
      .map((p: any) => ({
        name: p.name || p.id,
        route: p.route || '/' + p.id,
        sections: p.pageAnalysis?.sections?.map((s: any) => s.name) || [],
        componentUsage: p.pageAnalysis?.componentUsage || {},
        iconCount: p.pageAnalysis?.iconCount ?? 0,
        layoutPattern: p.pageAnalysis?.layoutPattern || null,
        hasForm: p.pageAnalysis?.hasForm ?? false,
      }))
  } catch {
    return []
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 rounded-[2px] bg-primary" />
      {children}
    </div>
  )
}

export default function SitemapPage() {
  const pages = loadPages()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-foreground">
          Sitemap
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          All pages · sections · component usage.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {pages.map((page: any) => (
          <div key={page.route} className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={page.route} className="text-[14px] font-medium text-foreground transition-colors hover:text-primary">
                {page.name}
              </Link>
              <span className="font-mono text-[11px] text-muted-foreground/70">{page.route}</span>
              {page.layoutPattern && (
                <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {page.layoutPattern}
                </span>
              )}
              {page.hasForm && (
                <span className="inline-flex items-center rounded border border-primary/35 bg-primary/10 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                  form
                </span>
              )}
            </div>
            {page.sections.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {page.sections.map((s: string) => (
                  <span key={s} className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{s}</span>
                ))}
              </div>
            )}
            {Object.keys(page.componentUsage).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(page.componentUsage).filter(([,c]) => (c as number) > 0).map(([name, count]) => (
                  <span key={name} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {name}<span className="text-muted-foreground/60">{String.fromCharCode(215)}{count as number}</span>
                  </span>
                ))}
                {page.iconCount > 0 && (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    Icons {String.fromCharCode(215)}{page.iconCount}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
`
  }
}
