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
   * Generate design system home page (fetches config from API at runtime)
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

const typeIcons: Record<string, string> = {
  'add-page': '📄',
  'modify-page': '✏️',
  'add-component': '🧩',
  'modify-component': '🔧',
  'modify-tokens': '🎨',
  'modify-config': '⚙️',
  init: '🚀',
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Design System</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your project's components, tokens, and recent activity.
        </p>
      </div>

      {/* Summary cards: Components, Shared, Tokens, Documentation (no separate Pages/Changes) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Link href="/design-system/components" className="rounded-lg border p-4 hover:border-primary transition-colors">
          <div className="text-2xl font-bold">{components.length}</div>
          <div className="text-sm text-muted-foreground">Components</div>
          <div className="text-xs text-muted-foreground mt-1">View all →</div>
        </Link>
        <Link href="/design-system/shared" className="rounded-lg border p-4 hover:border-primary transition-colors">
          <div className="text-2xl font-bold">{sharedCount}</div>
          <div className="text-sm text-muted-foreground">Shared Components</div>
          <div className="text-xs text-muted-foreground mt-1">Header, Footer, etc. →</div>
        </Link>
        <Link href="/design-system/tokens" className="rounded-lg border p-4 hover:border-primary transition-colors">
          <div className="text-2xl font-bold">{tokenTotal}</div>
          <div className="text-sm text-muted-foreground">Tokens</div>
          <div className="text-xs text-muted-foreground mt-1">Colors · Spacing · Radius</div>
        </Link>
        <Link href="/design-system/sitemap" className="rounded-lg border p-4 hover:border-primary transition-colors">
          <div className="text-2xl font-bold">{pages.length}</div>
          <div className="text-sm text-muted-foreground">Pages</div>
          <div className="text-xs text-muted-foreground mt-1">Sitemap & analysis →</div>
        </Link>
      </div>

      {/* Activity heatmap (last year) — GitHub-style grid, contained so it never overflows screen */}
      <div className="rounded-lg border p-3 sm:p-4 w-full max-w-full overflow-hidden">
        <h2 className="text-sm font-medium mb-2 sm:mb-3">Activity (last year)</h2>
        <div className="w-full max-w-full overflow-x-auto overflow-y-hidden pb-1">
          <div className="flex gap-0.5 sm:gap-1 text-[10px] text-muted-foreground mb-1 min-w-0">
            {Array.from({ length: weeks }, (_, col) => (
              <span key={col} className="shrink-0 w-2.5 min-w-2.5 sm:w-3 sm:min-w-3">{monthLabel(col)}</span>
            ))}
          </div>
          <div className="flex items-start gap-0.5 sm:gap-1 min-w-0 touch-pan-x">
          {Array.from({ length: weeks }, (_, col) => (
            <div key={col} className="flex flex-col gap-0.5 shrink-0">
              {Array.from({ length: rows }, (_, row) => {
                const idx = col * rows + row
                const day = last364[idx]
                if (!day) return null
                const count = actDays.get(day) ?? 0
                const level = countToLevel(count)
                return (
                  <div
                    key={day}
                    className="size-2.5 min-w-2.5 sm:size-3 sm:min-w-3 rounded-[2px] sm:rounded-sm transition-colors"
                    style={{
                      backgroundColor:
                        level === 0
                          ? 'var(--muted)'
                          : level === 1
                            ? 'color-mix(in srgb, var(--primary) 25%, var(--muted))'
                            : level === 2
                              ? 'color-mix(in srgb, var(--primary) 50%, var(--muted))'
                              : level === 3
                                ? 'color-mix(in srgb, var(--primary) 75%, var(--muted))'
                                : 'var(--primary)',
                    }}
                    title={\`\${day}: \${count} change\${count === 1 ? '' : 's'}\`}
                  />
                )
              })}
            </div>
          ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="size-2.5 sm:size-3 rounded-[2px] sm:rounded-sm shrink-0"
                style={{
                  backgroundColor:
                    i === 0
                      ? 'var(--muted)'
                      : \`color-mix(in srgb, var(--primary) \${i * 25}%, var(--muted))\`,
                }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
        {changes.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">No activity yet. Run <code className="rounded bg-muted px-1">coherent chat</code> to start building.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick links */}
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium mb-3">Quick links</h2>
          <div className="space-y-2">
            <Link href="/design-system/components" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Components ({components.length})</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/shared" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Shared Components ({sharedCount})</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/tokens/colors" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <div className="flex items-center gap-2">
                <span>Colors ({colorCount})</span>
                <div className="flex gap-0.5">
                  <div className="size-3 rounded-sm bg-primary" />
                  <div className="size-3 rounded-sm bg-secondary border" />
                  <div className="size-3 rounded-sm bg-destructive" />
                </div>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/tokens/typography" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Typography</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/tokens/spacing" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Spacing & Radius ({spacingCount + radiusCount})</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/docs" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Documentation</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
            <Link href="/design-system/recommendations" className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors">
              <span>Recommendations</span>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          </div>
        </div>

        {/* Recent changes log */}
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium mb-3">Recent changes</h2>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <div className="space-y-0">
              {changes.slice(0, 10).map((change, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <span className="text-sm shrink-0 mt-0.5" title={change.type}>
                    {typeIcons[change.type] || '📝'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{change.description}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(change.timestamp)}</div>
                  </div>
                </div>
              ))}
              {changes.length > 10 && (
                <p className="text-xs text-muted-foreground pt-2 text-center">
                  + {changes.length - 10} more changes
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
`
  }

  /**
   * Generate design system components index page (separate section, not anchor)
   */
  private generateComponentsIndexPage(): string {
    return `'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

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
    if (v === 0 && s === 0) return 'Default'
    const parts = []
    if (v > 0) parts.push(\`\${v} variant\${v !== 1 ? 's' : ''}\`)
    if (s > 0) parts.push(\`\${s} size\${s !== 1 ? 's' : ''}\`)
    return parts.join(' · ')
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Components</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {components.length} component{components.length !== 1 ? 's' : ''}. Click a card to view variants, sizes, and code.
        </p>
      </div>
      {Object.entries(grouped).map(([category, comps]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {category.replace(/-/g, ' ')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(comps as any[]).map((comp) => (
              <Link
                key={comp.id}
                href={\`/design-system/components/\${comp.id}\`}
                className="group flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{comp.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {variantSizeLabel(comp)}
                  </div>
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2">→</span>
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

export default function TokensPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Design Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Color, typography, spacing, and radius values that define your design system.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/design-system/tokens/colors" className="rounded-lg border p-6 hover:border-primary transition-colors">
          <div className="flex gap-2 mb-3">
            <div className="size-4 rounded bg-primary" />
            <div className="size-4 rounded bg-secondary border" />
            <div className="size-4 rounded bg-destructive" />
          </div>
          <div className="text-sm font-medium">Colors</div>
          <div className="text-xs text-muted-foreground mt-1">Light and dark theme palettes</div>
        </Link>
        <Link href="/design-system/tokens/typography" className="rounded-lg border p-6 hover:border-primary transition-colors">
          <div className="mb-3 text-sm font-bold">Aa</div>
          <div className="text-sm font-medium">Typography</div>
          <div className="text-xs text-muted-foreground mt-1">Font families, sizes, and weights</div>
        </Link>
        <Link href="/design-system/tokens/spacing" className="rounded-lg border p-6 hover:border-primary transition-colors">
          <div className="flex gap-1.5 mb-3 items-end">
            <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
            <div className="w-2.5 h-4 rounded-sm bg-primary" />
            <div className="w-2.5 h-6 rounded-sm bg-primary" />
          </div>
          <div className="text-sm font-medium">Spacing &amp; Radius</div>
          <div className="text-xs text-muted-foreground mt-1">Spacing scale and border radius</div>
        </Link>
      </div>
    </div>
  )
}
`
  }

  private generateColorsPage(): string {
    const lines: string[] = []
    lines.push("'use client'")
    lines.push("import { useEffect, useState } from 'react'")
    lines.push('')
    lines.push('export default function ColorsPage() {')
    lines.push(
      '  const [tokens, setTokens] = useState<{ colors?: { light?: Record<string, string>; dark?: Record<string, string> } } | null>(null)',
    )
    lines.push('  const [loading, setLoading] = useState(true)')
    lines.push('')
    lines.push('  useEffect(() => {')
    lines.push("    fetch('/api/design-system/config')")
    lines.push('      .then((res) => res.json())')
    lines.push('      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })')
    lines.push('      .catch(() => { setTokens(null); setLoading(false) })')
    lines.push('  }, [])')
    lines.push('')
    lines.push('  if (loading) {')
    lines.push('    return (')
    lines.push('      <div className="space-y-8">')
    lines.push('        <h1 className="text-4xl font-bold tracking-tight">Color Tokens</h1>')
    lines.push('        <p className="text-muted-foreground">Loading...</p>')
    lines.push('      </div>')
    lines.push('    )')
    lines.push('  }')
    lines.push('')
    lines.push('  const light = tokens?.colors?.light ?? {}')
    lines.push('  const dark = tokens?.colors?.dark ?? {}')
    lines.push('  const keys = Array.from(new Set([...Object.keys(light), ...Object.keys(dark)]))')
    lines.push('  const toCssVar = (key: string) => `--${key}`')
    lines.push('')
    lines.push('  return (')
    lines.push('    <div className="space-y-8">')
    lines.push('      <h1 className="text-4xl font-bold tracking-tight">Color Tokens</h1>')
    lines.push('      <p className="text-muted-foreground">Design system color variables (light and dark themes).</p>')
    lines.push('      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">')
    lines.push('        <div className="space-y-4">')
    lines.push('          <h2 className="text-xl font-semibold">Light Theme</h2>')
    lines.push('          <div className="rounded-lg border p-4 space-y-3">')
    lines.push('            {keys.length === 0 ? (')
    lines.push('              <p className="text-sm text-muted-foreground">No color tokens</p>')
    lines.push('            ) : (')
    lines.push('              keys.map((key) => {')
    lines.push('                const value = light[key]')
    lines.push('                if (!value) return null')
    lines.push('                return (')
    lines.push('                  <div key={`light-${key}`} className="flex items-center gap-4">')
    lines.push('                    <div')
    lines.push('                      className="h-10 w-10 shrink-0 rounded-md border"')
    lines.push('                      style={{ backgroundColor: value }}')
    lines.push('                    />')
    lines.push('                    <div className="min-w-0 flex-1">')
    lines.push('                      <div className="font-medium capitalize">{key}</div>')
    lines.push(
      '                      <div className="text-xs text-muted-foreground font-mono">{value} · var({toCssVar(key)})</div>',
    )
    lines.push('                    </div>')
    lines.push('                  </div>')
    lines.push('                )')
    lines.push('              })')
    lines.push('            )}')
    lines.push('          </div>')
    lines.push('        </div>')
    lines.push('        <div className="space-y-4">')
    lines.push('          <h2 className="text-xl font-semibold">Dark Theme</h2>')
    lines.push('          <div className="dark rounded-lg border border-border p-4 space-y-3 bg-background">')
    lines.push('            {keys.length === 0 ? (')
    lines.push('              <p className="text-sm text-muted-foreground">No color tokens</p>')
    lines.push('            ) : (')
    lines.push('              keys.map((key) => {')
    lines.push('                const value = dark[key]')
    lines.push('                if (!value) return null')
    lines.push('                return (')
    lines.push('                  <div key={`dark-${key}`} className="flex items-center gap-4">')
    lines.push('                    <div')
    lines.push('                      className="h-10 w-10 shrink-0 rounded-md border border-border"')
    lines.push('                      style={{ backgroundColor: value }}')
    lines.push('                    />')
    lines.push('                    <div className="min-w-0 flex-1">')
    lines.push('                      <div className="font-medium capitalize text-foreground">{key}</div>')
    lines.push('                      <div className="text-xs text-muted-foreground font-mono">{value}</div>')
    lines.push('                    </div>')
    lines.push('                  </div>')
    lines.push('                )')
    lines.push('              })')
    lines.push('            )}')
    lines.push('          </div>')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('    </div>')
    lines.push('  )')
    lines.push('}')
    return lines.join('\n')
  }

  private generateTypographyPage(): string {
    const lines: string[] = []
    lines.push("'use client'")
    lines.push("import { useEffect, useState } from 'react'")
    lines.push('')
    lines.push('export default function TypographyPage() {')
    lines.push('  const [tokens, setTokens] = useState<any>(null)')
    lines.push('  const [loading, setLoading] = useState(true)')
    lines.push('')
    lines.push('  useEffect(() => {')
    lines.push("    fetch('/api/design-system/config')")
    lines.push('      .then((res) => res.json())')
    lines.push('      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })')
    lines.push('      .catch(() => { setTokens(null); setLoading(false) })')
    lines.push('  }, [])')
    lines.push('')
    lines.push('  if (loading) {')
    lines.push('    return (')
    lines.push('      <div className="space-y-8">')
    lines.push('        <h1 className="text-4xl font-bold tracking-tight">Typography</h1>')
    lines.push('        <p className="text-muted-foreground">Loading...</p>')
    lines.push('      </div>')
    lines.push('    )')
    lines.push('  }')
    lines.push('')
    lines.push('  const typography = tokens?.typography ?? {}')
    lines.push('  const fontFamily = typography.fontFamily ?? {}')
    lines.push('  const fontSize = typography.fontSize ?? {}')
    lines.push('  const fontWeight = typography.fontWeight ?? {}')
    lines.push('  const lineHeight = typography.lineHeight ?? {}')
    lines.push('')
    lines.push('  const remToPx = (rem: string) => {')
    lines.push('    const val = parseFloat(rem)')
    lines.push('    return isNaN(val) ? rem : `${val * 16}px`')
    lines.push('  }')
    lines.push('')
    lines.push('  return (')
    lines.push('    <div className="space-y-10">')
    lines.push('      <h1 className="text-4xl font-bold tracking-tight">Typography</h1>')
    lines.push('      <p className="text-muted-foreground">Font families, sizes, weights, and line heights.</p>')
    lines.push('')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Font Families</h2>')
    lines.push('        <div className="rounded-lg border p-6 space-y-6">')
    lines.push('          {Object.entries(fontFamily).map(([name, value]) => (')
    lines.push('            <div key={name} className="space-y-2">')
    lines.push('              <div className="text-sm font-medium capitalize">{name}</div>')
    lines.push('              <div className="text-xs text-muted-foreground font-mono">{value as string}</div>')
    lines.push(
      '              <div className="text-lg" style={{ fontFamily: value as string }}>The quick brown fox jumps over the lazy dog</div>',
    )
    lines.push('            </div>')
    lines.push('          ))}')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Font Sizes</h2>')
    lines.push('        <div className="rounded-lg border p-6 space-y-6">')
    lines.push('          {Object.entries(fontSize).map(([name, value]) => (')
    lines.push('            <div key={name} className="space-y-1">')
    lines.push('              <div className="flex items-baseline gap-2">')
    lines.push('                <span className="text-sm font-medium">{name}</span>')
    lines.push(
      '                <span className="text-xs text-muted-foreground font-mono">{value as string} ({remToPx(value as string)})</span>',
    )
    lines.push('              </div>')
    lines.push(
      '              <div style={{ fontSize: value as string }}>The quick brown fox jumps over the lazy dog</div>',
    )
    lines.push('            </div>')
    lines.push('          ))}')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Font Weights</h2>')
    lines.push('        <div className="rounded-lg border p-6">')
    lines.push('          <div className="flex flex-wrap gap-8">')
    lines.push('            {Object.entries(fontWeight).map(([name, value]) => (')
    lines.push('              <div key={name} className="space-y-1 text-center">')
    lines.push('                <div className="text-2xl" style={{ fontWeight: value as number }}>Aa</div>')
    lines.push('                <div className="text-xs font-medium">{name}</div>')
    lines.push('                <div className="text-xs text-muted-foreground">{String(value)}</div>')
    lines.push('              </div>')
    lines.push('            ))}')
    lines.push('          </div>')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Line Heights</h2>')
    lines.push('        <div className="rounded-lg border p-6 space-y-6">')
    lines.push('          {Object.entries(lineHeight).map(([name, value]) => (')
    lines.push('            <div key={name} className="space-y-1">')
    lines.push('              <div className="text-sm font-medium">{name} ({String(value)})</div>')
    lines.push(
      '              <div className="text-sm bg-muted/50 p-3 rounded max-w-md" style={{ lineHeight: value as number }}>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</div>',
    )
    lines.push('            </div>')
    lines.push('          ))}')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('    </div>')
    lines.push('  )')
    lines.push('}')
    return lines.join('\n')
  }

  private generateSpacingPage(): string {
    const lines: string[] = []
    lines.push("'use client'")
    lines.push("import { useEffect, useState } from 'react'")
    lines.push('')
    lines.push('export default function SpacingPage() {')
    lines.push('  const [tokens, setTokens] = useState<any>(null)')
    lines.push('  const [loading, setLoading] = useState(true)')
    lines.push('')
    lines.push('  useEffect(() => {')
    lines.push("    fetch('/api/design-system/config')")
    lines.push('      .then((res) => res.json())')
    lines.push('      .then((data) => { setTokens(data.tokens ?? null); setLoading(false) })')
    lines.push('      .catch(() => { setTokens(null); setLoading(false) })')
    lines.push('  }, [])')
    lines.push('')
    lines.push('  if (loading) {')
    lines.push('    return (')
    lines.push('      <div className="space-y-8">')
    lines.push('        <h1 className="text-4xl font-bold tracking-tight">Spacing & Radius</h1>')
    lines.push('        <p className="text-muted-foreground">Loading...</p>')
    lines.push('      </div>')
    lines.push('    )')
    lines.push('  }')
    lines.push('')
    lines.push('  const spacing = tokens?.spacing ?? {}')
    lines.push('  const radius = tokens?.radius ?? {}')
    lines.push('')
    lines.push('  return (')
    lines.push('    <div className="space-y-10">')
    lines.push('      <h1 className="text-4xl font-bold tracking-tight">Spacing & Radius</h1>')
    lines.push('      <p className="text-muted-foreground">Spacing scale and border radius tokens.</p>')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Spacing Scale</h2>')
    lines.push('        <div className="rounded-lg border p-6 space-y-4">')
    lines.push('          {Object.keys(spacing).length === 0 ? (')
    lines.push('            <p className="text-sm text-muted-foreground">No spacing tokens</p>')
    lines.push('          ) : (')
    lines.push('            Object.entries(spacing).map(([name, value]) => (')
    lines.push('              <div key={name} className="flex items-center gap-4">')
    lines.push('                <div className="w-12 text-sm font-mono font-medium text-right">{name}</div>')
    lines.push('                <div className="w-24 text-xs text-muted-foreground font-mono">{value as string}</div>')
    lines.push('                <div')
    lines.push('                  className="h-6 rounded bg-primary/70"')
    lines.push('                  style={{ width: value as string }}')
    lines.push('                />')
    lines.push('              </div>')
    lines.push('            ))')
    lines.push('          )}')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('      <div className="space-y-4">')
    lines.push('        <h2 className="text-2xl font-semibold">Border Radius</h2>')
    lines.push('        <div className="rounded-lg border p-6">')
    lines.push('          {Object.keys(radius).length === 0 ? (')
    lines.push('            <p className="text-sm text-muted-foreground">No radius tokens</p>')
    lines.push('          ) : (')
    lines.push('            <div className="flex flex-wrap gap-6">')
    lines.push('              {Object.entries(radius).map(([name, value]) => (')
    lines.push('                <div key={name} className="flex flex-col items-center gap-2">')
    lines.push('                  <div')
    lines.push('                    className="h-16 w-16 border-2 border-primary/70 bg-primary/10"')
    lines.push('                    style={{ borderRadius: value as string }}')
    lines.push('                  />')
    lines.push('                  <div className="text-xs font-medium">{name}</div>')
    lines.push('                  <div className="text-xs text-muted-foreground font-mono">{value as string}</div>')
    lines.push('                </div>')
    lines.push('              ))}')
    lines.push('            </div>')
    lines.push('          )}')
    lines.push('        </div>')
    lines.push('      </div>')
    lines.push('    </div>')
    lines.push('  )')
    lines.push('}')
    return lines.join('\n')
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

export default function SitemapPage() {
  const pages = loadPages()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sitemap</h1>
        <p className="text-muted-foreground mt-1">All pages, sections, and component usage</p>
      </div>
      <div className="space-y-4">
        {pages.map((page: any) => (
          <div key={page.route} className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Link href={page.route} className="font-semibold text-sm hover:text-primary transition-colors">
                {page.name}
              </Link>
              <span className="text-xs text-muted-foreground font-mono">{page.route}</span>
              {page.layoutPattern && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{page.layoutPattern}</span>}
              {page.hasForm && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">form</span>}
            </div>
            {page.sections.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {page.sections.map((s: string) => (
                  <span key={s} className="text-[11px] px-2 py-0.5 rounded-full border text-muted-foreground">{s}</span>
                ))}
              </div>
            )}
            {Object.keys(page.componentUsage).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(page.componentUsage).filter(([,c]) => (c as number) > 0).map(([name, count]) => (
                  <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {name}<span className="text-[10px] text-muted-foreground/60 ml-0.5">{String.fromCharCode(215)}{count as number}</span>
                  </span>
                ))}
                {page.iconCount > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Icons {String.fromCharCode(215)}{page.iconCount}</span>}
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
