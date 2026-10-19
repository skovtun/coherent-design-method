/**
 * The generated design-system viewer (`<app>/design-system/**`), ADR-0013.
 *
 * Every file starts with DS_MARKER and is rewritten from the code-derived
 * model inside each edit that touches components or tokens, before the build,
 * so it is verified and undone with the edit. The project graph ignores this
 * directory (graph.ts), so it never counts as a page that renders components.
 *
 * Live previews: shadcn primitives get a generated render (only when every part
 * the recipe needs is exported, so it typechecks); other components show the
 * `<name>.preview.tsx` the agent writes next to them. Each preview sits in its
 * own error boundary. Theme utilities only, no arbitrary values.
 */
import { posix } from 'path'
import { DS_MARKER, type DesignSystem, type DsComponent, type TokenCategory } from './design-system.js'

export interface SiteContext {
  appName: string
  /** Most recent edits first. */
  edits: { label: string; verdict: string | null; at: string }[]
}

const FILES = [
  'page.tsx',
  'layout.tsx',
  '_data.ts',
  '_previews.tsx',
  '_nav.tsx',
  '_boundary.tsx',
  'tokens/colors/page.tsx',
  'tokens/typography/page.tsx',
  'tokens/spacing/page.tsx',
  'components/page.tsx',
  'components/[id]/page.tsx',
  'rules/page.tsx',
]

/** Every file of the viewer, project-relative; `page.tsx` first (it carries the ownership marker). */
export const dsFiles = (appDir: string) => FILES.map(f => `${appDir}/design-system/${f}`)

const HEAD = `// ${DS_MARKER}: written by Coherent from the code on every edit that touches components or tokens. Do not edit by hand.\n`

const KIND_LABEL: Record<DsComponent['kind'], string> = { ui: 'Primitive', shared: 'Shared', block: 'Block' }

const PRIMITIVE_CATEGORY: Record<string, string> = {
  Button: 'Form',
  Input: 'Form',
  Textarea: 'Form',
  Label: 'Form',
  Checkbox: 'Form',
  Switch: 'Form',
  Select: 'Form',
  Slider: 'Form',
  RadioGroup: 'Form',
  Calendar: 'Form',
  Card: 'Data display',
  Badge: 'Data display',
  Avatar: 'Data display',
  Table: 'Data display',
  Separator: 'Data display',
  Alert: 'Feedback',
  Progress: 'Feedback',
  Skeleton: 'Feedback',
  Toaster: 'Feedback',
  Dialog: 'Overlay',
  Sheet: 'Overlay',
  Popover: 'Overlay',
  Tooltip: 'Overlay',
  DropdownMenu: 'Overlay',
  Tabs: 'Navigation',
  Breadcrumb: 'Navigation',
  ScrollArea: 'Layout',
}

type Recipe = { needs?: string[]; children?: string; render?: (a: (n: string) => string) => string }

/** Safe standalone renders for common shadcn primitives. */
const RECIPES: Record<string, Recipe> = {
  Button: { children: 'Button' },
  Badge: { children: 'Badge' },
  Input: { render: a => `<${a('Input')} placeholder="name@company.com" className="max-w-xs" />` },
  Textarea: { render: a => `<${a('Textarea')} placeholder="Write a message" className="max-w-sm" />` },
  Label: { render: a => `<${a('Label')}>Email address</${a('Label')}>` },
  Checkbox: { render: a => `<${a('Checkbox')} defaultChecked />` },
  Switch: { render: a => `<${a('Switch')} defaultChecked />` },
  Progress: { render: a => `<${a('Progress')} value={60} className="max-w-sm" />` },
  Skeleton: { render: a => `<${a('Skeleton')} className="h-4 w-48" />` },
  Separator: { render: a => `<${a('Separator')} className="max-w-sm" />` },
  Avatar: {
    needs: ['AvatarFallback'],
    render: a => `<${a('Avatar')}><${a('AvatarFallback')}>AK</${a('AvatarFallback')}></${a('Avatar')}>`,
  },
  Card: {
    needs: ['CardHeader', 'CardTitle', 'CardDescription', 'CardContent'],
    render: a =>
      `<${a('Card')} className="max-w-sm"><${a('CardHeader')}><${a('CardTitle')}>Card title</${a('CardTitle')}><${a('CardDescription')}>Supporting text for the card.</${a('CardDescription')}></${a('CardHeader')}><${a('CardContent')}><p className="text-sm">Card content</p></${a('CardContent')}></${a('Card')}>`,
  },
  Alert: {
    needs: ['AlertTitle', 'AlertDescription'],
    render: a =>
      `<${a('Alert')} className="max-w-md"><${a('AlertTitle')}>Heads up</${a('AlertTitle')}><${a('AlertDescription')}>Something worth knowing.</${a('AlertDescription')}></${a('Alert')}>`,
  },
  Tabs: {
    needs: ['TabsList', 'TabsTrigger', 'TabsContent'],
    render: a =>
      `<${a('Tabs')} defaultValue="one"><${a('TabsList')}><${a('TabsTrigger')} value="one">Overview</${a('TabsTrigger')}><${a('TabsTrigger')} value="two">Activity</${a('TabsTrigger')}></${a('TabsList')}><${a('TabsContent')} value="one" className="text-sm">Overview content</${a('TabsContent')}><${a('TabsContent')} value="two" className="text-sm">Activity content</${a('TabsContent')}></${a('Tabs')}>`,
  },
  Table: {
    needs: ['TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell'],
    render: a =>
      `<${a('Table')}><${a('TableHeader')}><${a('TableRow')}><${a('TableHead')}>Name</${a('TableHead')}><${a('TableHead')}>Status</${a('TableHead')}></${a('TableRow')}></${a('TableHeader')}><${a('TableBody')}><${a('TableRow')}><${a('TableCell')}>Northwind</${a('TableCell')}><${a('TableCell')}>Active</${a('TableCell')}></${a('TableRow')}><${a('TableRow')}><${a('TableCell')}>Contoso</${a('TableCell')}><${a('TableCell')}>Paused</${a('TableCell')}></${a('TableRow')}></${a('TableBody')}></${a('Table')}>`,
  },
}

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/[-_]/g, ' ')

function recipeFor(c: DsComponent): Recipe | null {
  if (c.kind !== 'ui') return null
  const r = RECIPES[c.name]
  if (!r) return null
  const have = new Set([c.name, ...(c.parts ?? [])])
  return (r.needs ?? []).every(n => have.has(n)) ? r : null
}

/** Variant groups that can be rendered by setting a string prop. */
const renderableGroups = (c: DsComponent) =>
  (c.variants ?? []).filter(g => g.options.length && g.options.every(o => !['true', 'false'].includes(o.value)))

const toImport = (fromDir: string, file: string) => {
  const rel = posix.relative(fromDir, file).replace(/\.(tsx|jsx)$/, '')
  return rel.startsWith('.') ? rel : `./${rel}`
}

function renderPreviews(ds: DesignSystem, dir: string): { code: string; live: Set<string> } {
  const imports: string[] = []
  const entries: string[] = []
  const variantEntries: string[] = []
  const live = new Set<string>()
  ds.components.forEach((c, i) => {
    const prefix = `C${i}`
    if (c.preview) {
      imports.push(`import ${prefix}_Preview from '${toImport(dir, c.preview)}'`)
      entries.push(`  '${c.slug}': () => <${prefix}_Preview />,`)
      live.add(c.slug)
      return
    }
    const r = recipeFor(c)
    if (!r) return
    const used = new Set<string>([c.name])
    const a = (n: string) => {
      used.add(n)
      return `${prefix}_${n}`
    }
    const one = (props: string, text: string) => `<${a(c.name)}${props}>${text}</${a(c.name)}>`
    const groups = r.children ? renderableGroups(c) : []
    let main: string
    if (r.render) main = r.render(a)
    else {
      const g = groups.find(x => x.name === 'variant')
      main = g
        ? `<div className="flex flex-wrap items-center gap-3">${g.options.map(o => one(` variant="${o.value}"`, label(o.value))).join('')}</div>`
        : one('', r.children!)
    }
    entries.push(`  '${c.slug}': () => (${main}),`)
    if (groups.length)
      variantEntries.push(
        `  '${c.slug}': {\n${groups
          .map(
            g =>
              `    ${JSON.stringify(g.name)}: {\n${g.options
                .map(o => `      ${JSON.stringify(o.value)}: () => ${one(` ${g.name}="${o.value}"`, label(o.value))},`)
                .join('\n')}\n    },`,
          )
          .join('\n')}\n  },`,
      )
    imports.push(
      `import { ${[...used].map(n => `${n} as ${prefix}_${n}`).join(', ')} } from '${toImport(dir, c.file)}'`,
    )
    live.add(c.slug)
  })
  const code = `${HEAD}import type { ReactNode } from 'react'
${imports.join('\n')}

export const previews: Record<string, () => ReactNode> = {
${entries.join('\n')}
}

export const variantPreviews: Record<string, Record<string, Record<string, () => ReactNode>>> = {
${variantEntries.join('\n')}
}
`
  return { code, live }
}

const TOKEN_ORDER: TokenCategory[] = ['color', 'font', 'size', 'space', 'radius', 'shadow', 'other']

function renderData(ds: DesignSystem, ctx: SiteContext, live: Set<string>): string {
  const components = ds.components.map(c => ({
    id: c.id ?? null,
    slug: c.slug,
    name: c.name,
    kind: KIND_LABEL[c.kind],
    category: c.kind === 'ui' ? (PRIMITIVE_CATEGORY[c.name] ?? 'Other') : null,
    file: c.file,
    props: c.props ? c.props.replace(/\s+/g, ' ').slice(0, 400) : null,
    parts: c.parts ?? [],
    routes: c.routes,
    variants: (c.variants ?? []).map(g => ({ name: g.name, default: g.default ?? null, options: g.options })),
    preview: live.has(c.slug) ? (c.preview ? 'authored' : 'generated') : null,
  }))
  const tokens = TOKEN_ORDER.flatMap(cat =>
    ds.tokens
      .filter(t => t.category === cat)
      .map(t => ({ name: t.name, category: t.category, value: t.value, dark: t.dark ?? null })),
  )
  return `${HEAD}export interface DsComponent {
  id: string | null
  slug: string
  name: string
  kind: 'Primitive' | 'Shared' | 'Block'
  category: string | null
  file: string
  props: string | null
  parts: string[]
  routes: string[]
  variants: { name: string; default: string | null; options: { value: string; classes: string }[] }[]
  preview: 'authored' | 'generated' | null
}

export interface DsToken {
  name: string
  category: string
  value: string
  dark: string | null
}

export const app = ${JSON.stringify({ name: ctx.appName })}

export const components: DsComponent[] = ${JSON.stringify(components, null, 2)}

export const tokens: DsToken[] = ${JSON.stringify(tokens, null, 2)}

export const edits: { label: string; verdict: string | null; at: string }[] = ${JSON.stringify(ctx.edits.slice(0, 8), null, 2)}

export const duplicates: { id: string; components: string[] }[] = ${JSON.stringify(ds.duplicates)}
`
}

const NAV = `${HEAD}'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { app, components, tokens } from './_data'

const sections = [
  {
    label: 'Foundations',
    items: [
      { label: 'Colors', href: '/design-system/tokens/colors', count: tokens.filter(t => t.category === 'color').length },
      { label: 'Typography', href: '/design-system/tokens/typography', count: null },
      { label: 'Spacing, radius, shadow', href: '/design-system/tokens/spacing', count: null },
    ],
  },
  {
    label: 'Components',
    items: [
      { label: 'All components', href: '/design-system/components', count: components.length },
      { label: 'Shared', href: '/design-system/components#shared', count: components.filter(c => c.kind === 'Shared').length },
      { label: 'Blocks', href: '/design-system/components#blocks', count: components.filter(c => c.kind === 'Block').length },
      { label: 'Primitives', href: '/design-system/components#primitives', count: components.filter(c => c.kind === 'Primitive').length },
    ],
  },
  { label: 'Governance', items: [{ label: 'Rules', href: '/design-system/rules', count: null }] },
]

export function DsNav() {
  const path = usePathname()
  const link = (href: string) =>
    'flex items-center justify-between rounded-md px-3 py-1.5 text-sm ' +
    (href === path || (href === '/design-system/components' && path.startsWith(href + '/'))
      ? 'bg-muted font-medium text-foreground'
      : 'text-muted-foreground hover:text-foreground')
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r p-4 md:flex">
        <div className="px-3">
          <Link href="/design-system" className="font-semibold">
            {app.name}
          </Link>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Design system</div>
        </div>
        <Link href="/" className="px-3 text-sm text-muted-foreground hover:text-foreground">
          ← Back to app
        </Link>
        {sections.map(s => (
          <div key={s.label} className="space-y-1">
            <div className="px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">{s.label}</div>
            {s.items.map(i => (
              <Link key={i.href} href={i.href} className={link(i.href)}>
                <span>{i.label}</span>
                {i.count !== null ? <span className="text-xs tabular-nums text-muted-foreground">{i.count}</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <nav className="flex gap-4 overflow-x-auto border-b px-4 py-3 text-sm md:hidden">
        <Link href="/design-system" className="font-semibold">
          Design system
        </Link>
        <Link href="/design-system/tokens/colors">Colors</Link>
        <Link href="/design-system/tokens/typography">Type</Link>
        <Link href="/design-system/components">Components</Link>
        <Link href="/design-system/rules">Rules</Link>
      </nav>
    </>
  )
}
`

const BOUNDARY = `${HEAD}'use client'

import { Component, type ReactNode } from 'react'

/** One failing preview must not take the whole page down. */
export class PreviewBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  render() {
    return this.state.error ? (
      <p className="text-sm text-destructive">Preview failed: {this.state.error}</p>
    ) : (
      this.props.children
    )
  }
}
`

const LAYOUT = `${HEAD}import type { ReactNode } from 'react'
import { DsNav } from './_nav'

export const metadata = { title: 'Design system' }

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <DsNav />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-6 py-10 lg:px-10">{children}</main>
      </div>
    </div>
  )
}
`

const LABEL = `<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />`

const HOME = `${HEAD}import Link from 'next/link'
import { components, edits, tokens } from './_data'

export default function DesignSystemHome() {
  const count = (kind: string) => components.filter(c => c.kind === kind).length
  const cards = [
    { label: 'Foundations', value: tokens.length, note: 'tokens: color, type, radius', href: '/design-system/tokens/colors' },
    { label: 'Shared', value: count('Shared'), note: 'used on 2+ pages', href: '/design-system/components#shared' },
    { label: 'Blocks', value: count('Block'), note: 'page sections', href: '/design-system/components#blocks' },
    { label: 'Primitives', value: count('Primitive'), note: 'shadcn base components', href: '/design-system/components#primitives' },
  ]
  const sample = components.find(c => c.kind === 'Shared' && c.id) ?? components.find(c => c.id)
  const token = tokens.find(t => t.name === '--primary') ?? tokens[0]
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Design system</h1>
        <p className="text-muted-foreground">Every token and component of this app, read from its code and kept current with each edit.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="rounded-lg border bg-card p-5 transition-colors hover:bg-muted">
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{c.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{c.value}</div>
            <div className="mt-2 text-sm text-muted-foreground">{c.note}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">${LABEL}Change anything by address</div></div>
          <div className="space-y-3 p-5 text-sm">
            <p className="text-muted-foreground">Tell your agent what to change and name it. The edit stays inside that component or token, and every page using it follows.</p>
            {sample ? (
              <p className="rounded-md bg-muted px-3 py-2 font-mono">{sample.id}: make the corners rounder</p>
            ) : null}
            {token ? <p className="rounded-md bg-muted px-3 py-2 font-mono">{token.name}: a warmer shade</p> : null}
            <p className="rounded-md bg-muted px-3 py-2 font-mono">Add a pricing table and put it on /pricing</p>
          </div>
        </section>
        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">${LABEL}Recent changes</div></div>
          <ul className="divide-y text-sm">
            {edits.length ? (
              edits.map(e => (
                <li key={e.at + e.label} className="flex items-start justify-between gap-4 px-5 py-3">
                  <span className="min-w-0">{e.label}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.verdict ?? 'open'}</span>
                </li>
              ))
            ) : (
              <li className="px-5 py-3 text-muted-foreground">No edits yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
`

const COLORS = `${HEAD}import { tokens } from '../../_data'

export default function ColorsPage() {
  const colors = tokens.filter(t => t.category === 'color')
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Colors</h1>
        <p className="text-muted-foreground">{colors.length} color tokens, light and dark. Change one by name: &quot;--primary: a warmer shade&quot;.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {colors.map(t => (
          <div key={t.name} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-20">
              <div className="flex-1" style={{ background: t.value || undefined }} />
              {t.dark ? <div className="flex-1" style={{ background: t.dark }} /> : null}
            </div>
            <div className="space-y-1 border-t p-3">
              <div className="font-mono text-sm">{t.name}</div>
              <div className="font-mono text-xs text-muted-foreground">
                {t.value}
                {t.dark ? ' · dark ' + t.dark : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
`

const TYPOGRAPHY = `${HEAD}import { tokens } from '../../_data'

const scale = [
  { name: 'text-xs', className: 'text-xs' },
  { name: 'text-sm', className: 'text-sm' },
  { name: 'text-base', className: 'text-base' },
  { name: 'text-lg', className: 'text-lg' },
  { name: 'text-xl', className: 'text-xl' },
  { name: 'text-2xl', className: 'text-2xl' },
  { name: 'text-3xl', className: 'text-3xl' },
  { name: 'text-4xl', className: 'text-4xl' },
  { name: 'text-5xl', className: 'text-5xl' },
]
const weights = [
  { name: 'font-normal', className: 'font-normal' },
  { name: 'font-medium', className: 'font-medium' },
  { name: 'font-semibold', className: 'font-semibold' },
  { name: 'font-bold', className: 'font-bold' },
]

export default function TypographyPage() {
  const fonts = tokens.filter(t => t.category === 'font')
  const sizes = tokens.filter(t => t.category === 'size')
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Typography</h1>
        <p className="text-muted-foreground">Font families from the tokens, and the type scale the app uses.</p>
      </header>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Font families</div></div>
        <div className="divide-y">
          {fonts.length ? (
            fonts.map(t => (
              <div key={t.name} className="space-y-1 px-5 py-4">
                <div className="font-mono text-xs text-muted-foreground">{t.name} · {t.value}</div>
                <div className="text-2xl" style={{ fontFamily: 'var(' + t.name + ')' }}>
                  The quick brown fox jumps over the lazy dog
                </div>
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">No font tokens in the stylesheet; the app uses the default font.</p>
          )}
        </div>
      </section>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Type scale</div></div>
        <div className="divide-y">
          {scale.map(s => (
            <div key={s.name} className="flex items-baseline gap-6 px-5 py-3">
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{s.name}</span>
              <span className={s.className + ' truncate'}>The quick brown fox</span>
            </div>
          ))}
          {sizes.map(t => (
            <div key={t.name} className="flex items-baseline gap-6 px-5 py-3">
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{t.name}</span>
              <span className="truncate" style={{ fontSize: 'var(' + t.name + ')' }}>The quick brown fox</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Weights</div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {weights.map(w => (
            <div key={w.name} className="space-y-1">
              <div className={w.className + ' text-xl'}>Aa Bb Cc</div>
              <div className="font-mono text-xs text-muted-foreground">{w.name}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
`

const SPACING = `${HEAD}import { tokens } from '../../_data'

const space = [
  { name: '1 · 4px', className: 'w-1' },
  { name: '2 · 8px', className: 'w-2' },
  { name: '3 · 12px', className: 'w-3' },
  { name: '4 · 16px', className: 'w-4' },
  { name: '6 · 24px', className: 'w-6' },
  { name: '8 · 32px', className: 'w-8' },
  { name: '12 · 48px', className: 'w-12' },
  { name: '16 · 64px', className: 'w-16' },
  { name: '24 · 96px', className: 'w-24' },
]
const radii = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full']
const shadows = ['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl']

export default function SpacingPage() {
  const radiusTokens = tokens.filter(t => t.category === 'radius')
  const shadowTokens = tokens.filter(t => t.category === 'shadow')
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Spacing, radius, shadow</h1>
        <p className="text-muted-foreground">The spacing scale, corner radii and elevation the app draws from.</p>
      </header>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Radius</div></div>
        <div className="grid gap-6 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {radiusTokens.map(t => (
            <div key={t.name} className="space-y-2">
              <div className="size-16 border-2 border-primary bg-muted" style={{ borderRadius: 'var(' + t.name + ')' }} />
              <div className="font-mono text-xs">{t.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{t.value}</div>
            </div>
          ))}
          {radii.map(r => (
            <div key={r} className="space-y-2">
              <div className={r + ' size-16 border-2 border-primary bg-muted'} />
              <div className="font-mono text-xs text-muted-foreground">{r}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Spacing</div></div>
        <div className="divide-y">
          {space.map(s => (
            <div key={s.name} className="flex items-center gap-6 px-5 py-2">
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{s.name}</span>
              <span className={s.className + ' h-3 rounded-sm bg-primary'} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Shadow</div></div>
        <div className="grid gap-6 p-5 sm:grid-cols-3 lg:grid-cols-5">
          {shadowTokens.map(t => (
            <div key={t.name} className="space-y-2">
              <div className="h-16 rounded-lg bg-card" style={{ boxShadow: 'var(' + t.name + ')' }} />
              <div className="font-mono text-xs">{t.name}</div>
            </div>
          ))}
          {shadows.map(s => (
            <div key={s} className="space-y-2">
              <div className={s + ' h-16 rounded-lg border bg-card'} />
              <div className="font-mono text-xs text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
`

const COMPONENTS = `${HEAD}import Link from 'next/link'
import { components, type DsComponent } from '../_data'

function Card({ c }: { c: DsComponent }) {
  const meta = [
    c.variants.length ? c.variants.map(v => v.options.length + ' ' + v.name).join(' · ') : null,
    c.kind === 'Primitive' ? null : c.routes.length ? 'on ' + c.routes.length + (c.routes.length === 1 ? ' page' : ' pages') : 'not on a page yet',
  ].filter(Boolean)
  return (
    <Link href={'/design-system/components/' + c.slug} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted">
      <div className="min-w-0 space-y-1">
        <div className="font-medium">{c.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{meta.join(' · ') || c.file}</div>
      </div>
      <div className="shrink-0 space-y-1 text-right">
        <div className="font-mono text-xs">{c.id ?? '—'}</div>
        {c.preview ? null : <div className="text-xs text-muted-foreground">no preview</div>}
      </div>
    </Link>
  )
}

function Group({ id, title, note, items }: { id: string; title: string; note: string; items: DsComponent[] }) {
  if (!items.length) return null
  return (
    <section id={id} className="scroll-mt-8 space-y-3">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(c => (
          <Card key={c.slug} c={c} />
        ))}
      </div>
    </section>
  )
}

export default function ComponentsPage() {
  const primitives = components.filter(c => c.kind === 'Primitive')
  const categories = [...new Set(primitives.map(c => c.category ?? 'Other'))]
  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Components</h1>
        <p className="text-muted-foreground">{components.length} components. Open one for its preview, variants, props and the pages that use it.</p>
      </header>
      <Group id="shared" title="Shared" note="Used on two or more pages: a change reaches all of them." items={components.filter(c => c.kind === 'Shared')} />
      <Group id="blocks" title="Blocks" note="Sections of a single page." items={components.filter(c => c.kind === 'Block')} />
      <section id="primitives" className="scroll-mt-8 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Primitives</h2>
          <p className="text-sm text-muted-foreground">The base components everything else is built from.</p>
        </div>
        {categories.map(cat => (
          <div key={cat} className="space-y-3">
            ${LABEL}{cat}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {primitives
                .filter(c => (c.category ?? 'Other') === cat)
                .map(c => (
                  <Card key={c.slug} c={c} />
                ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
`

const DETAIL = `${HEAD}import Link from 'next/link'
import { notFound } from 'next/navigation'
import { components } from '../../_data'
import { previews, variantPreviews } from '../../_previews'
import { PreviewBoundary } from '../../_boundary'

export function generateStaticParams() {
  return components.map(c => ({ id: c.slug }))
}

export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = components.find(x => x.slug === id)
  if (!c) notFound()
  const preview = previews[c.slug]
  const variantRenders = variantPreviews[c.slug] ?? {}
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="text-sm text-muted-foreground">
          <Link href="/design-system/components" className="hover:text-foreground">
            Components
          </Link>{' '}
          / {c.kind}
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{c.name}</h1>
          <span className="rounded-md border px-2 py-0.5 font-mono text-sm">{c.id ?? 'no ID'}</span>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{c.file}</p>
      </header>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Preview</div></div>
        <div className="p-6">
          {preview ? (
            <PreviewBoundary>{preview()}</PreviewBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">
              No preview yet. Ask your agent: &quot;add a preview for {c.id ?? c.name}&quot;. Meanwhile, see it live on the pages below.
            </p>
          )}
        </div>
      </section>

      {c.variants.length ? (
        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">${LABEL}Variants</div></div>
          <div className="divide-y">
            {c.variants.flatMap(g =>
              g.options.map(o => (
                <div key={g.name + o.value} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="w-40 shrink-0">
                    {variantRenders[g.name]?.[o.value] ? <PreviewBoundary>{variantRenders[g.name][o.value]()}</PreviewBoundary> : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-medium">
                      {o.value}
                      {g.default === o.value ? <span className="ml-2 text-xs text-muted-foreground">default</span> : null}
                    </div>
                    <div className="break-words font-mono text-xs text-muted-foreground">{o.classes}</div>
                  </div>
                  <code className="shrink-0 font-mono text-xs">{g.name + '="' + o.value + '"'}</code>
                </div>
              )),
            )}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">${LABEL}Props</div></div>
          <pre className="overflow-x-auto whitespace-pre-wrap p-5 font-mono text-xs">{c.props ?? 'No props'}</pre>
          {c.parts.length ? <p className="border-t px-5 py-3 text-sm text-muted-foreground">Parts: {c.parts.join(', ')}</p> : null}
        </section>
        <section className="rounded-lg border bg-card">
          <div className="border-b px-5 py-3">${LABEL}Used on</div></div>
          <div className="flex flex-wrap gap-2 p-5">
            {c.routes.length ? (
              c.routes.map(r =>
                r.includes('[') ? (
                  <span key={r} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {r}
                  </span>
                ) : (
                  <Link key={r} href={r} className="rounded-md bg-muted px-2 py-1 font-mono text-xs hover:underline">
                    {r}
                  </Link>
                ),
              )
            ) : (
              <span className="text-sm text-muted-foreground">Not on a page yet.</span>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
`

const RULES = `${HEAD}import { components, duplicates } from '../_data'

const enforced = [
  ['Addressed edits stay in place', 'An edit of a component by ID or name may change only that component. Every page that uses it changes; pages that do not must render pixel-identically.'],
  ['Pages do not restyle components', 'A page edit cannot change shared components, primitives or tokens. Changing one everywhere is a component edit; changing it on some pages is a variant or a new component.'],
  ['Tokens live in the stylesheet', 'A token edit changes only stylesheets, and every page follows.'],
  ['Every component has an ID', 'A new component without an @coherent-id comment, or with an ID already taken, fails verification.'],
  ['Shared changes are asked, not assumed', 'Asked to change something several pages use on only some of them, the agent asks: a new component or token, or change it everywhere.'],
  ['Every edit is proven', 'Declared files only, no new type or browser errors, a production build, before/after renders, no real names or emails in the UI. A failed edit is never committed.'],
]

export default function RulesPage() {
  const noPreview = components.filter(c => !c.preview)
  const noId = components.filter(c => !c.id)
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Rules</h1>
        <p className="text-muted-foreground">What Coherent checks on every edit, and the state of this design system.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Components without ID', value: noId.length },
          { label: 'Duplicate IDs', value: duplicates.length },
          { label: 'Components without preview', value: noPreview.length },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-5">
            <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>
      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-3">${LABEL}Enforced on every edit</div></div>
        <div className="divide-y">
          {enforced.map(([title, body]) => (
            <div key={title} className="space-y-1 px-5 py-4">
              <div className="font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
`

/** All viewer files for this design system, keyed by project-relative path. */
export function renderDesignSystemFiles(ds: DesignSystem, appDir: string, ctx: SiteContext): Map<string, string> {
  const dir = `${appDir}/design-system`
  const { code: previews, live } = renderPreviews(ds, dir)
  const files = new Map<string, string>([
    ['page.tsx', HOME],
    ['layout.tsx', LAYOUT],
    ['_data.ts', renderData(ds, ctx, live)],
    ['_previews.tsx', previews],
    ['_nav.tsx', NAV],
    ['_boundary.tsx', BOUNDARY],
    ['tokens/colors/page.tsx', COLORS],
    ['tokens/typography/page.tsx', TYPOGRAPHY],
    ['tokens/spacing/page.tsx', SPACING],
    ['components/page.tsx', COMPONENTS],
    ['components/[id]/page.tsx', DETAIL],
    ['rules/page.tsx', RULES],
  ])
  return new Map([...files].map(([f, c]) => [`${dir}/${f}`, c]))
}
