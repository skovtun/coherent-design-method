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
import {
  DS_MARKER,
  DS_SYNC_REQUEST,
  previewPathFor,
  type DesignSystem,
  type DsComponent,
  type TokenCategory,
} from './design-system.js'

export interface SiteContext {
  appName: string
  version: string
  /** Every committed edit, most recent first (activity heatmap and recent changes). */
  edits: { label: string; verdict: string | null; at: string; files?: string[] }[]
  /** Page routes of the app, for the sitemap. */
  pages: string[]
  /** Library icons the app imports (Lucide, Tabler, Heroicons…), with the files that import them. */
  icons: { name: string; module: string; library: string; files: string[] }[]
  /** Icon libraries installed in the app, by label. */
  iconLibraries?: string[]
  /** Hardcoded design values across the app (ADR-0013 slice 2). */
  rawValues?: { file: string; line: number; kind: string; value: string }[]
  /** lucide-react is a dependency: the Icons page can browse the whole set. */
  hasIcons: boolean
}

const FILES = [
  'page.tsx',
  'layout.tsx',
  '_data.ts',
  '_activity.ts',
  '_previews.tsx',
  '_shell.tsx',
  '_boundary.tsx',
  '_ui.tsx',
  '_detail.tsx',
  '_icons.tsx',
  '_icon-catalog.tsx',
  '_copy.tsx',
  '_color.ts',
  '_reach.tsx',
  'tokens/page.tsx',
  'tokens/colors/page.tsx',
  'tokens/typography/page.tsx',
  'tokens/spacing/page.tsx',
  'tokens/icons/page.tsx',
  'components/page.tsx',
  'components/[id]/page.tsx',
  'shared/page.tsx',
  'shared/[id]/page.tsx',
  'sitemap/page.tsx',
  'docs/page.tsx',
  'recommendations/page.tsx',
]

/** Every file of the viewer, project-relative; `page.tsx` first (it carries the ownership marker). */
export const dsFiles = (appDir: string) => FILES.map(f => `${appDir}/design-system/${f}`)

/** Changes with every edit; compared separately when checking the viewer is current. */
export const DS_VOLATILE = '_activity.ts'

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
    section: c.kind === 'ui' ? 'components' : 'shared',
    category:
      c.kind === 'ui'
        ? (PRIMITIVE_CATEGORY[c.name] ?? 'Other')
        : c.kind === 'shared'
          ? 'Used on several pages'
          : 'Page blocks',
    file: c.file,
    props: c.props ? c.props.replace(/\s+/g, ' ').slice(0, 400) : null,
    parts: c.parts ?? [],
    routes: c.routes,
    variants: (c.variants ?? []).map(g => ({ name: g.name, default: g.default ?? null, options: g.options })),
    preview: live.has(c.slug) ? (c.preview ? 'authored' : 'generated') : null,
    example: c.example ?? null,
    tokens: c.tokens ?? [],
  }))
  const tokens = TOKEN_ORDER.flatMap(cat =>
    ds.tokens
      .filter(t => t.category === cat)
      .map(t => ({
        name: t.name,
        category: t.category,
        value: t.value,
        dark: t.dark ?? null,
        usedBy: ds.components.filter(c => c.tokens?.includes(t.name)).map(c => c.slug),
        routes: t.routes ?? [],
      })),
  )
  const pages = ctx.pages.map(route => ({
    route,
    components: ds.components.filter(c => c.routes.includes(route)).map(c => c.slug),
  }))
  return `${HEAD}export interface DsComponent {
  id: string | null
  slug: string
  name: string
  kind: 'Primitive' | 'Shared' | 'Block'
  section: 'components' | 'shared'
  category: string
  file: string
  props: string | null
  parts: string[]
  routes: string[]
  variants: { name: string; default: string | null; options: { value: string; classes: string }[] }[]
  preview: 'authored' | 'generated' | null
  example: { code: string; file: string } | null
  /** Tokens its file references directly. */
  tokens: string[]
}

export interface DsToken {
  name: string
  category: string
  value: string
  dark: string | null
  /** Slugs of components whose file references it directly. */
  usedBy: string[]
  /** Pages that render a file referencing it directly. */
  routes: string[]
}

export const app = ${JSON.stringify({ name: ctx.appName, version: ctx.version })}

export const components: DsComponent[] = ${JSON.stringify(components, null, 2)}

export const tokens: DsToken[] = ${JSON.stringify(tokens, null, 2)}

export const pages: { route: string; components: string[] }[] = ${JSON.stringify(pages, null, 2)}

export const icons: { key: string; name: string; library: string; files: string[] }[] = ${JSON.stringify(
    ctx.icons.map(i => ({ key: i.module + ':' + i.name, name: i.name, library: i.library, files: i.files })),
    null,
    2,
  )}

export const iconLibraries: string[] = ${JSON.stringify(ctx.iconLibraries ?? [])}

export const rawValues: { file: string; line: number; kind: string; value: string }[] = ${JSON.stringify(ctx.rawValues ?? [], null, 2)}

export const duplicates: { id: string; components: string[] }[] = ${JSON.stringify(ds.duplicates)}

export const hrefOf = (c: DsComponent) => '/design-system/' + c.section + '/' + c.slug
`
}

function renderActivity(ds: DesignSystem, ctx: SiteContext): string {
  const own = ctx.edits.filter(e => !e.label.startsWith(DS_SYNC_REQUEST))
  const history: Record<string, { label: string; verdict: string | null; at: string }[]> = {}
  for (const c of ds.components) {
    const files = [c.file, previewPathFor(c.file)]
    const hits = own.filter(e => e.files?.some(f => files.includes(f))).slice(0, 10)
    if (hits.length) history[c.slug] = hits.map(({ label, verdict, at }) => ({ label, verdict, at }))
  }
  const activity: Record<string, number> = {}
  for (const e of ctx.edits) activity[e.at.slice(0, 10)] = (activity[e.at.slice(0, 10)] ?? 0) + 1
  return `${HEAD}export const generatedAt: string | null = ${JSON.stringify(ctx.edits[0]?.at.slice(0, 10) ?? null)}

export const edits: { label: string; verdict: string | null; at: string }[] = ${JSON.stringify(
    ctx.edits.slice(0, 10).map(({ label, verdict, at }) => ({ label, verdict, at })),
    null,
    2,
  )}

export const history: Record<string, { label: string; verdict: string | null; at: string }[]> = ${JSON.stringify(history, null, 2)}

export const activity: Record<string, number> = ${JSON.stringify(activity, null, 2)}
`
}

const UI = `${HEAD}import type { ReactNode } from 'react'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
      <span className="size-1.5 rounded-sm bg-primary" />
      {children}
    </div>
  )
}

export function Panel({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <SectionLabel>{label}</SectionLabel>
        {right}
      </div>
      {children}
    </section>
  )
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-3xl font-medium tracking-tight text-foreground">{title}</h1>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}
`

const SHELL = `${HEAD}'use client'

import Link from 'next/link'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { app, components, pages, tokens } from './_data'
import { generatedAt } from './_activity'

type Icon = 'foundations' | 'base' | 'shared' | 'sitemap' | 'docs' | 'recs'
type Group = { label: string; href: string; prefix: string; icon: Icon; links: { href: string; label: string }[]; count: number | null }

const base = components.filter(c => c.section === 'components')
const shared = components.filter(c => c.section === 'shared')

const TOP: Group[] = [
  {
    label: 'Foundations',
    href: '/design-system/tokens',
    prefix: '/design-system/tokens',
    icon: 'foundations',
    count: tokens.length,
    links: [
      { href: '/design-system/tokens/colors', label: 'Color' },
      { href: '/design-system/tokens/typography', label: 'Typography' },
      { href: '/design-system/tokens/spacing', label: 'Spacing & radius' },
      { href: '/design-system/tokens/icons', label: 'Icons' },
    ],
  },
  {
    label: 'Base Components',
    href: '/design-system/components',
    prefix: '/design-system/components',
    icon: 'base',
    count: base.length,
    links: [
      { href: '/design-system/components', label: 'All components' },
      ...base.map(c => ({ href: '/design-system/components/' + c.slug, label: c.name })),
    ],
  },
  {
    label: 'Shared Components',
    href: '/design-system/shared',
    prefix: '/design-system/shared',
    icon: 'shared',
    count: shared.length,
    links: [
      { href: '/design-system/shared', label: 'All shared components' },
      ...shared.map(c => ({ href: '/design-system/shared/' + c.slug, label: c.name })),
    ],
  },
]

const TAIL: Group[] = [
  { label: 'Sitemap', href: '/design-system/sitemap', prefix: '/design-system/sitemap', icon: 'sitemap', count: pages.length, links: [] },
  { label: 'Documentation', href: '/design-system/docs', prefix: '/design-system/docs', icon: 'docs', count: null, links: [] },
  { label: 'Recommendations', href: '/design-system/recommendations', prefix: '/design-system/recommendations', icon: 'recs', count: null, links: [] },
]

function GroupIcon({ name }: { name: Icon }) {
  const p = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'foundations') return <svg {...p}><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
  if (name === 'base') return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
  if (name === 'shared') return <svg {...p}><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
  if (name === 'sitemap') return <svg {...p}><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4" /><path d="M5 17v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" /></svg>
  if (name === 'docs') return <svg {...p}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
  return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.5.4 1 .9 1 1.6V18h6v-1.7c0-.7.5-1.2 1-1.6A7 7 0 0 0 12 2Z" /></svg>
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), [])
  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark
        setDark(next)
        document.documentElement.classList.toggle('dark', next)
      }}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
      )}
    </button>
  )
}

const SECTION_LABEL: Record<string, string> = {
  tokens: 'Foundations',
  components: 'Base Components',
  shared: 'Shared Components',
  sitemap: 'Sitemap',
  docs: 'Documentation',
  recommendations: 'Recommendations',
}

function crumbs(path: string): { label: string; href: string }[] {
  const parts = path.replace('/design-system', '').split('/').filter(Boolean)
  if (!parts.length) return []
  const out = [{ label: SECTION_LABEL[parts[0]] ?? parts[0], href: '/design-system/' + parts[0] }]
  if (parts[1]) {
    const c = components.find(x => x.slug === parts[1])
    out.push({ label: c ? c.name : parts[1].charAt(0).toUpperCase() + parts[1].slice(1).replace(/-/g, ' '), href: path })
  }
  return out
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/design-system'
  const [open, setOpen] = useState(false)
  const inGroup = (g: Group) => path === g.prefix || path.startsWith(g.prefix + '/') || g.links.some(l => l.href === path)

  const renderGroup = (g: Group) => {
    const active = inGroup(g)
    return (
      <div key={g.label} className="mb-1">
        <Link
          href={g.href}
          onClick={() => setOpen(false)}
          className={
            'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-widest transition-colors ' +
            (active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
          }
        >
          <span className={active ? 'shrink-0 text-foreground' : 'shrink-0 text-muted-foreground'}>
            <GroupIcon name={g.icon} />
          </span>
          <span className="flex-1">{g.label}</span>
          {g.count ? <span className="font-mono text-xs normal-case tracking-normal tabular-nums text-muted-foreground">{g.count}</span> : null}
        </Link>
        {active && g.links.length ? (
          <div className="mb-3 mt-1 flex flex-col gap-px">
            {g.links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={
                  'rounded-md px-3 py-1.5 text-sm transition-colors ' +
                  (path === l.href ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const nav = (
    <>
      {TOP.map(renderGroup)}
      <div className="my-3 border-t border-border" />
      {TAIL.map(renderGroup)}
    </>
  )
  const back = (
    <Link href="/" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
      Back to App
    </Link>
  )
  const trail = crumbs(path)

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-background md:block">
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="px-5 pb-4 pt-5">
            <Link href="/design-system" className="block">
              <div className="font-semibold tracking-tight text-foreground">{app.name}</div>
              <div className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground">Design System</div>
            </Link>
          </div>
          <div className="border-b border-border" />
          <div className="px-3 py-2">{back}</div>
          <div className="border-b border-border" />
          <nav aria-label="Design System navigation" className="flex-1 overflow-y-auto px-3 py-4">
            {nav}
          </nav>
          <div className="border-t border-border px-5 py-3 font-mono text-xs text-muted-foreground">
            <div>version · <span className="tabular-nums text-foreground">{app.version}</span></div>
            <div>updated · <span className="tabular-nums text-foreground">{generatedAt ?? '—'}</span></div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/design-system" className="text-sm font-semibold tracking-tight">{app.name}</Link>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">DS</span>
          </div>
          <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
            <Link href="/design-system" className="transition-colors hover:text-foreground">Design System</Link>
            {trail.map((c, i) => (
              <Fragment key={c.href + i}>
                <span aria-hidden>/</span>
                {i === trail.length - 1 ? (
                  <span className="text-foreground">{c.label}</span>
                ) : (
                  <Link href={c.href} className="transition-colors hover:text-foreground">{c.label}</Link>
                )}
              </Fragment>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground md:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {open ? (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>) : (<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>)}
              </svg>
            </button>
          </div>
        </header>
        {open ? (
          <div className="border-b border-border bg-background px-3 py-4 md:hidden">
            <div className="mb-3">{back}</div>
            {nav}
          </div>
        ) : null}
        <main className="flex-1 bg-muted/70">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6 lg:py-8">{children}</div>
          <div className="mx-auto w-full max-w-7xl px-4 pb-4 lg:px-6">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <a href="https://getcoherent.design" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground transition-colors hover:text-primary">Coherent Design Method</a>
              <span aria-hidden>·</span>
              <a href="https://github.com/skovtun/coherent-design-method" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">GitHub</a>
              <span aria-hidden>·</span>
              <span>design system read from this app&apos;s code</span>
            </div>
          </div>
        </main>
      </div>
    </div>
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
    return this.state.error ? <p className="text-sm text-destructive">Preview failed: {this.state.error}</p> : this.props.children
  }
}
`

const LAYOUT = `${HEAD}import type { ReactNode } from 'react'
import { Shell } from './_shell'

export const metadata = { title: 'Design System' }

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>
}
`

const HOME = `${HEAD}import Link from 'next/link'
import { components, icons, pages, tokens } from './_data'
import { activity, edits } from './_activity'
import { Arrow, PageTitle, Panel } from './_ui'

const WEEKS = 52
const levelColor = (l: number) =>
  l === 0 ? 'var(--border)' : l === 4 ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) ' + l * 25 + '%, var(--border))'

export default function DesignSystemHome() {
  const base = components.filter(c => c.section === 'components').length
  const shared = components.filter(c => c.section === 'shared').length
  const colors = tokens.filter(t => t.category === 'color').length
  const total = Object.values(activity).reduce((a, b) => a + b, 0)
  // Columns are calendar weeks starting on Sunday, like GitHub; days after today stay empty.
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7)
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d > today ? null : d.toISOString().slice(0, 10)
  })
  const months = Array.from({ length: WEEKS }, (_, col) => {
    const d = new Date(start)
    d.setDate(d.getDate() + col * 7)
    return d.getDate() <= 7 ? d.toLocaleString('en', { month: 'short' }) : ''
  })
  const summary = [
    { href: '/design-system/tokens', label: 'foundations', value: tokens.length, hint: 'tokens · colors · type' },
    { href: '/design-system/components', label: 'base', value: base, hint: 'shadcn primitives' },
    { href: '/design-system/shared', label: 'shared', value: shared, hint: 'product components' },
    { href: '/design-system/sitemap', label: 'pages', value: pages.length, hint: 'sitemap & usage' },
  ]
  const links = [
    { href: '/design-system/tokens/colors', label: 'Colors', meta: String(colors), swatches: true },
    { href: '/design-system/tokens/typography', label: 'Typography', meta: '' },
    { href: '/design-system/tokens/spacing', label: 'Spacing & Radius', meta: '' },
    { href: '/design-system/tokens/icons', label: 'Icons', meta: String(icons.length) },
    { href: '/design-system/components', label: 'Base Components', meta: String(base) },
    { href: '/design-system/shared', label: 'Shared Components', meta: String(shared) },
    { href: '/design-system/sitemap', label: 'Sitemap', meta: String(pages.length) },
    { href: '/design-system/docs', label: 'Documentation', meta: '' },
    { href: '/design-system/recommendations', label: 'Recommendations', meta: '' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Design System" sub="Components, tokens and recent activity, read from this app's code." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map(s => (
          <Link key={s.href} href={s.href} className="group rounded-lg border border-border bg-card shadow-sm p-4 transition-colors hover:border-primary hover:bg-muted">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
            <div className="mt-1.5 font-mono text-3xl font-medium tabular-nums text-foreground">{s.value}</div>
            <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>{s.hint}</span>
              <Arrow className="transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>
        ))}
      </div>

      <Panel label="activity · last year" right={<span className="font-mono text-xs tabular-nums text-muted-foreground">{total} edits</span>}>
        <div className="overflow-x-auto p-4">
          <div className="flex gap-1">
            <div className="flex shrink-0 flex-col gap-1 pr-1 pt-5 font-mono text-xs text-muted-foreground">
              {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                <div key={i} className="h-3 leading-3">{d}</div>
              ))}
            </div>
            {Array.from({ length: WEEKS }, (_, col) => (
              <div key={col} className="flex shrink-0 flex-col gap-1">
                <div className="h-4 w-3 overflow-visible whitespace-nowrap font-mono text-xs text-muted-foreground">{months[col]}</div>
                {days.slice(col * 7, col * 7 + 7).map((day, row) => {
                  if (!day) return <div key={row} className="size-3" />
                  const n = activity[day] ?? 0
                  const level = n === 0 ? 0 : Math.min(4, Math.ceil(n / 2))
                  return <div key={day} title={day + ': ' + n + ' edit' + (n === 1 ? '' : 's')} className="size-3" style={{ backgroundColor: levelColor(level), borderRadius: 2 }} />
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 font-mono text-xs text-muted-foreground">
            <span className="mr-1">less</span>
            {[0, 1, 2, 3, 4].map(l => (
              <div key={l} className="size-3" style={{ backgroundColor: levelColor(l), borderRadius: 2 }} />
            ))}
            <span className="ml-1">more</span>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="quick links">
          <div className="flex flex-col p-2">
            {links.map(l => (
              <Link key={l.href} href={l.href} className="flex items-center justify-between rounded-md px-3 py-2 font-mono text-sm text-foreground transition-colors hover:bg-muted">
                <span className="flex items-center gap-2.5">
                  {l.label}
                  {l.swatches ? (
                    <span className="flex gap-0.5">
                      <span className="size-2.5 rounded-sm bg-primary" />
                      <span className="size-2.5 rounded-sm bg-muted-foreground" />
                      <span className="size-2.5 rounded-sm bg-destructive" />
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  {l.meta}
                  <Arrow />
                </span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel label="recent changes">
          <div className="p-2">
            {edits.length ? (
              edits.map(e => (
                <div key={e.at + e.label} className="flex items-start gap-3 border-b border-border px-3 py-2 font-mono text-xs last:border-0">
                  <span className={'mt-0.5 shrink-0 rounded-sm border border-border bg-muted px-1.5 uppercase tracking-wide ' + (e.verdict === 'verified' ? 'text-primary' : e.verdict === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                    {e.verdict === 'verified' ? 'verified' : e.verdict === 'failed' ? 'failed' : 'partial'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{e.label}</div>
                    <div className="mt-0.5 text-muted-foreground">{e.at.slice(0, 10)}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-2 py-3 font-mono text-xs text-muted-foreground">no edits recorded yet</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
`

const TOKENS_HOME = `${HEAD}import Link from 'next/link'
import { icons, tokens } from '../_data'
import { Arrow, PageTitle } from '../_ui'

export default function FoundationsPage() {
  const count = (c: string) => tokens.filter(t => t.category === c).length
  const cards = [
    { href: '/design-system/tokens/colors', label: 'Color', meta: count('color') + ' tokens, light and dark' },
    { href: '/design-system/tokens/typography', label: 'Typography', meta: count('font') + ' font tokens, type scale, weights' },
    { href: '/design-system/tokens/spacing', label: 'Spacing & radius', meta: count('radius') + ' radius, ' + count('shadow') + ' shadow tokens, spacing scale' },
    { href: '/design-system/tokens/icons', label: 'Icons', meta: icons.length + ' icons in use' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Foundations" sub="The tokens every component and page is built from. Change one by name: &quot;--primary: a warmer shade&quot;." />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(c => (
          <Link key={c.href} href={c.href} className="group flex items-center justify-between rounded-lg border border-border bg-card shadow-sm p-5 transition-colors hover:border-primary hover:bg-muted">
            <div>
              <div className="font-medium">{c.label}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{c.meta}</div>
            </div>
            <Arrow className="transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  )
}
`

const COLOR = `${HEAD}import type { DsToken } from './_data'

export type Tok = DsToken
export type Role = { base: Tok; fg?: Tok }

export const isFg = (n: string) => n === '--foreground' || n.endsWith('-foreground')
export const baseOf = (n: string) => (n === '--foreground' ? '--background' : n.slice(0, -'-foreground'.length))
export const fgOf = (n: string) => (n === '--background' ? '--foreground' : n + '-foreground')

/** A colour and the text colour meant to sit on it, shown together. */
export function roles(list: Tok[], all: Map<string, Tok>): Role[] {
  return list
    .filter(t => !(isFg(t.name) && all.has(baseOf(t.name))))
    .map(t => ({ base: t, fg: isFg(t.name) ? undefined : all.get(fgOf(t.name)) }))
}

export function luminance(c?: string) {
  const m = c?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1]
  const [r, g, b] = [0, 2, 4]
    .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a?: string, b?: string) {
  const x = luminance(a)
  const y = luminance(b)
  if (x === null || y === null) return null
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export const ink = (bg?: string) => {
  const l = luminance(bg)
  return l === null ? undefined : l > 0.4 ? '#000000' : '#ffffff'
}

/** Every colour with a text colour meant for it, and the contrast in each theme. */
export function pairs(tokens: Tok[]) {
  const colors = tokens.filter(t => t.category === 'color')
  const all = new Map(colors.map(t => [t.name, t]))
  return roles(colors, all)
    .filter(r => r.fg)
    .map(r => ({
      ...r,
      light: contrast(r.base.value, r.fg!.value),
      dark: contrast(r.base.dark ?? r.base.value, r.fg!.dark ?? r.fg!.value),
    }))
}
`

const COPY = `${HEAD}'use client'

import { useState, type ReactNode } from 'react'

/** Click to copy: IDs, token names and values are what you type into an edit. */
export function Copy({ text, className = '' }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={'Copy ' + text}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
      className={'cursor-copy transition-colors hover:text-primary ' + className}
    >
      {done ? 'copied' : text}
    </button>
  )
}

/** A card that copies \`text\` on click; its content stays, a small note confirms. */
export function CopyTile({ text, className = '', children }: { text: string; className?: string; children: ReactNode }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={'Copy ' + text}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
      className={'relative cursor-copy ' + className}
    >
      {children}
      {done ? <span className="absolute right-2 top-2 font-mono text-xs text-primary">copied</span> : null}
    </button>
  )
}
`

const REACH = `${HEAD}import Link from 'next/link'
import { components, hrefOf, tokens } from './_data'
import { baseOf, isFg } from './_color'

const plural = (n: number, one: string) => n + ' ' + one + (n === 1 ? '' : 's')

/** Where tokens are referenced in the code (static references: classes like bg-primary, var(--x)). */
export function Reach({ names }: { names: string[] }) {
  const own = tokens.filter(t => names.includes(t.name))
  const used = components.filter(c => own.some(t => t.usedBy.includes(c.slug)))
  const routes = [...new Set(own.flatMap(t => t.routes))].sort()
  if (!used.length && !routes.length)
    return <div className="font-mono text-xs text-muted-foreground">not referenced in components or pages; may be used from the stylesheet</div>
  return (
    <details className="font-mono text-xs">
      <summary
        title="Static references in the code: classes like bg-primary and var(--name). Stylesheet rules can reach further, so a token edit still re-renders every page."
        className="cursor-pointer text-muted-foreground hover:text-foreground"
      >
        {'used by ' + plural(used.length, 'component') + ' · on ' + plural(routes.length, 'page')}
      </summary>
      {used.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {used.map(c => (
            <Link key={c.slug} href={hrefOf(c)} className="rounded-md border border-border bg-card px-2 py-0.5 hover:bg-muted">
              {c.id ? c.name + ' · ' + c.id : c.name}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mt-2 break-all text-muted-foreground">{routes.join('  ·  ')}</div>
    </details>
  )
}

const TOKEN_PAGE: Record<string, string> = { color: 'colors', font: 'typography', radius: 'spacing', shadow: 'spacing', space: 'spacing' }

/** Where a token is shown in the viewer. */
export const tokenHref = (name: string) => {
  const t = tokens.find(x => x.name === name)
  const page = t ? TOKEN_PAGE[t.category] : undefined
  // A text colour sits on the card of the colour it is meant for.
  const card = isFg(name) && tokens.some(x => x.name === baseOf(name)) ? baseOf(name) : name
  return '/design-system/tokens' + (page ? '/' + page : '') + (t?.category === 'color' ? '#token' + card.slice(1) : '')
}
`

const COLORS = `${HEAD}import { tokens } from '../../_data'
import { PageTitle, Panel, SectionLabel } from '../../_ui'
import { Copy } from '../../_copy'
import { Reach } from '../../_reach'
import { contrast, ink, roles, type Role, type Tok } from '../../_color'

const GROUPS: { label: string; hint: string; match: (n: string) => boolean }[] = [
  { label: 'surfaces & text', hint: 'page, cards, popovers and the text on them', match: n => /^--(background|foreground|card|popover|muted)/.test(n) },
  { label: 'brand & actions', hint: 'buttons, links, highlights', match: n => /^--(primary|secondary|accent)/.test(n) },
  { label: 'status', hint: 'errors, success, warnings', match: n => /^--(destructive|success|warning|info|error)/.test(n) },
  { label: 'lines & focus', hint: 'borders, inputs, focus rings', match: n => /^--(border|input|ring)$/.test(n) },
  { label: 'charts', hint: 'data series', match: n => n.startsWith('--chart') },
  { label: 'sidebar', hint: 'app navigation', match: n => n.startsWith('--sidebar') },
]

const anchor = (n: string) => 'token' + n.slice(1)
function Contrast({ ratio, theme }: { ratio: number | null; theme: string }) {
  if (ratio === null) return null
  const ok = ratio >= 4.5
  const large = ratio >= 3
  return (
    <span className={'rounded-md border border-border px-1.5 py-0.5 font-mono text-xs ' + (ok ? 'text-foreground' : large ? 'text-muted-foreground' : 'text-destructive')}>
      {theme} {ratio.toFixed(1)} · {ok ? 'AA' : large ? 'AA large' : 'fails AA'}
    </span>
  )
}

function Half({ bg, fg, label }: { bg?: string; fg?: string; label: string }) {
  return (
    <div className="flex h-24 flex-1 flex-col justify-between p-3" style={{ background: bg, color: fg ?? ink(bg) }}>
      <span className="font-mono text-xs" style={{ opacity: 0.75 }}>{label}</span>
      {fg ? <span className="text-2xl font-medium leading-none">Aa</span> : null}
    </div>
  )
}

function RoleCard({ role }: { role: Role }) {
  const { base, fg } = role
  return (
    <div id={anchor(base.name)} className="scroll-mt-20 overflow-hidden rounded-lg border border-border bg-card shadow-sm target:ring-2 target:ring-ring">
      <div className="flex">
        <Half bg={base.value} fg={fg?.value} label="light" />
        <Half bg={base.dark ?? base.value} fg={fg?.dark ?? fg?.value} label={base.dark ? 'dark' : 'dark · same'} />
      </div>
      <div className="space-y-1.5 border-t border-border p-3">
        {[base, fg].filter((t): t is Tok => !!t).map(t => (
          <div key={t.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Copy text={t.name} className="font-mono text-sm text-foreground" />
            <span className="font-mono text-xs text-muted-foreground">
              <Copy text={t.value} />
              {t.dark && t.dark !== t.value ? (
                <>
                  {' / '}
                  <Copy text={t.dark} />
                </>
              ) : null}
            </span>
          </div>
        ))}
        {fg ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Contrast ratio={contrast(base.value, fg.value)} theme="light" />
            <Contrast ratio={contrast(base.dark ?? base.value, fg.dark ?? fg.value)} theme="dark" />
          </div>
        ) : null}
        <div className="pt-1">
          <Reach names={[base.name, ...(fg ? [fg.name] : [])]} />
        </div>
      </div>
    </div>
  )
}

function Strip({ roles, dark }: { roles: Role[]; dark: boolean }) {
  return (
    <div className="flex h-14 overflow-hidden rounded-lg border border-border">
      {roles.map(r => {
        const v = dark ? r.base.dark ?? r.base.value : r.base.value
        return (
          <a
            key={r.base.name}
            href={'#' + anchor(r.base.name)}
            title={r.base.name + ' ' + v}
            aria-label={r.base.name}
            className="flex-1 transition-opacity hover:opacity-80"
            style={{ background: v }}
          />
        )
      })}
    </div>
  )
}

export default function ColorsPage() {
  const colors = tokens.filter(t => t.category === 'color')
  const all = new Map(colors.map(t => [t.name, t]))
  const placed = new Set<string>()
  const groups = GROUPS.map(g => {
    const list = colors.filter(t => !placed.has(t.name) && g.match(t.name))
    list.forEach(t => placed.add(t.name))
    return { ...g, roles: roles(list, all) }
  })
  const rest = colors.filter(t => !placed.has(t.name))
  if (rest.length) groups.push({ label: 'other', hint: 'custom colors', match: () => true, roles: roles(rest, all) })
  const shown = groups.filter(g => g.roles.length)
  const palette = shown.filter(g => g.label !== 'sidebar').flatMap(g => g.roles)
  return (
    <div className="flex flex-col gap-8">
      <PageTitle
        title="Color"
        sub={colors.length + ' color tokens. Each colour is shown with the text colour meant for it, in light and dark, with its contrast.'}
      />
      <Panel label="palette">
        <div className="space-y-2 p-4">
          <div className="font-mono text-xs text-muted-foreground">light</div>
          <Strip roles={palette} dark={false} />
          <div className="pt-2 font-mono text-xs text-muted-foreground">dark</div>
          <Strip roles={palette} dark />
        </div>
      </Panel>
      {shown.map(g => (
        <section key={g.label} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <SectionLabel>{g.label}</SectionLabel>
            <span className="text-xs text-muted-foreground">{g.hint}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.roles.map(r => (
              <RoleCard key={r.base.name} role={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
`

const TYPOGRAPHY = `${HEAD}import { tokens } from '../../_data'
import { Reach } from '../../_reach'
import { PageTitle, Panel } from '../../_ui'

const SAMPLE = 'The quick brown fox jumps over the lazy dog'
const scale = [
  ['xs', 'text-xs', '0.75rem · 12px'],
  ['sm', 'text-sm', '0.875rem · 14px'],
  ['base', 'text-base', '1rem · 16px'],
  ['lg', 'text-lg', '1.125rem · 18px'],
  ['xl', 'text-xl', '1.25rem · 20px'],
  ['2xl', 'text-2xl', '1.5rem · 24px'],
  ['3xl', 'text-3xl', '1.875rem · 30px'],
  ['4xl', 'text-4xl', '2.25rem · 36px'],
]
const weights = [
  ['normal', 'font-normal'],
  ['medium', 'font-medium'],
  ['semibold', 'font-semibold'],
  ['bold', 'font-bold'],
]

export default function TypographyPage() {
  const fonts = tokens.filter(t => t.category === 'font')
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Typography" sub="Font families, sizes and weights." />
      <Panel label="font families">
        <div className="divide-y divide-border">
          {fonts.length ? (
            fonts.map(t => (
              <div key={t.name} className="space-y-1 p-4">
                <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t.name.replace('--font-', '')}</div>
                <div className="font-mono text-xs text-muted-foreground">{t.value}</div>
                <div className="text-lg" style={{ fontFamily: 'var(' + t.name + ')' }}>{SAMPLE}</div>
                <Reach names={[t.name]} />
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No font tokens in the stylesheet; the app uses the default font.</p>
          )}
        </div>
      </Panel>
      <Panel label="font sizes">
        <div className="divide-y divide-border">
          {scale.map(([name, cls, size]) => (
            <div key={name} className="space-y-1 p-4">
              <div className="font-mono text-xs text-muted-foreground"><span className="uppercase">{name}</span> {size}</div>
              <div className={cls + ' truncate'}>{SAMPLE}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="weights">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {weights.map(([name, cls]) => (
            <div key={name} className="space-y-1">
              <div className={cls + ' text-xl'}>Aa Bb Cc</div>
              <div className="font-mono text-xs text-muted-foreground">{name}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
`

const SPACING = `${HEAD}import { tokens } from '../../_data'
import { Reach } from '../../_reach'
import { PageTitle, Panel } from '../../_ui'

const space = [
  ['1', 'w-1', '4px'],
  ['2', 'w-2', '8px'],
  ['3', 'w-3', '12px'],
  ['4', 'w-4', '16px'],
  ['6', 'w-6', '24px'],
  ['8', 'w-8', '32px'],
  ['12', 'w-12', '48px'],
  ['16', 'w-16', '64px'],
  ['24', 'w-24', '96px'],
]
const radii = ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full']
const shadows = ['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl']

export default function SpacingPage() {
  const radiusTokens = tokens.filter(t => t.category === 'radius')
  const shadowTokens = tokens.filter(t => t.category === 'shadow')
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Spacing & radius" sub="The spacing scale, corner radii and elevation." />
      <Panel label="radius">
        {radiusTokens.length ? (
          <div className="divide-y divide-border border-b border-border">
            {radiusTokens.map(t => (
              <div key={t.name} className="flex items-start gap-4 p-4">
                <div className="size-12 shrink-0 border-2 border-primary bg-muted" style={{ borderRadius: 'var(' + t.name + ')' }} />
                <div className="min-w-0 space-y-1">
                  <div className="font-mono text-xs">{t.name} <span className="text-muted-foreground">{t.value}</span></div>
                  <Reach names={[t.name]} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid gap-6 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {radii.map(r => (
            <div key={r} className="space-y-2">
              <div className={r + ' size-16 border-2 border-primary bg-muted'} />
              <div className="font-mono text-xs text-muted-foreground">{r}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="spacing">
        <div className="divide-y divide-border">
          {space.map(([step, cls, px]) => (
            <div key={step} className="flex items-center gap-6 px-4 py-2">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{step} · {px}</span>
              <span className={cls + ' h-3 rounded-sm bg-primary'} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="shadow">
        <div className="grid gap-6 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {shadowTokens.map(t => (
            <div key={t.name} className="space-y-2">
              <div className="h-16 rounded-lg bg-card" style={{ boxShadow: 'var(' + t.name + ')' }} />
              <div className="font-mono text-xs">{t.name}</div>
              <Reach names={[t.name]} />
            </div>
          ))}
          {shadows.map(s => (
            <div key={s} className="space-y-2">
              <div className={s + ' h-16 rounded-lg border border-border bg-card'} />
              <div className="font-mono text-xs text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
`

/** A user's own icon: a component under an `icons/` folder whose props are SVG props (or none). */
const isCustomIcon = (c: DsComponent) =>
  c.kind !== 'ui' && /(^|\/)icons\//.test(c.file) && (!c.props || /svg/i.test(c.props))

function renderIcons(ds: DesignSystem, ctx: SiteContext, dir: string): { used: string; catalog: string } {
  const byModule = new Map<string, { name: string; key: string; i: number }[]>()
  ctx.icons.forEach((icon, i) =>
    byModule.set(icon.module, [
      ...(byModule.get(icon.module) ?? []),
      { name: icon.name, key: icon.module + ':' + icon.name, i },
    ]),
  )
  const custom = ds.components.filter(isCustomIcon)
  const imports = [
    ...[...byModule].map(
      ([module, list]) =>
        `import { ${list.map(x => `${x.name} as I${x.i}`).join(', ')} } from ${JSON.stringify(module)}`,
    ),
    ...custom.map((c, i) => `import { ${c.name} as U${i} } from ${JSON.stringify(toImport(dir, c.file))}`),
  ]
  const used = `${HEAD}import type { ComponentType } from 'react'
${imports.join('\n')}

type IconComponent = ComponentType<{ className?: string }>

export const usedIcons: Record<string, IconComponent> = {
${[...byModule.values()]
  .flat()
  .map(x => `  ${JSON.stringify(x.key)}: I${x.i} as IconComponent,`)
  .join('\n')}
}

/** The app's own icons (components under an icons/ folder), by component slug. */
export const customIcons: { slug: string; name: string; id: string | null; Icon: IconComponent }[] = [
${custom.map((c, i) => `  { slug: ${JSON.stringify(c.slug)}, name: ${JSON.stringify(c.name)}, id: ${JSON.stringify(c.id ?? null)}, Icon: U${i} as IconComponent },`).join('\n')}
]
`
  const catalog = ctx.hasIcons
    ? `${HEAD}'use client'

import { useState, type ComponentType } from 'react'
import * as lucide from 'lucide-react'

type IconComponent = ComponentType<{ className?: string }>
const canonical = Object.entries(lucide.icons as unknown as Record<string, IconComponent>)
const nameOf = new Map(canonical.map(([name, Icon]) => [Icon, name]))
// Renamed icons keep their old export (Home is now House): search both.
const aliases = new Map<string, string[]>()
for (const [key, value] of Object.entries(lucide as unknown as Record<string, IconComponent>)) {
  const name = nameOf.get(value)
  if (!name || key === name || key.startsWith('Lucide') || key.endsWith('Icon')) continue
  aliases.set(name, [...(aliases.get(name) ?? []), key])
}
const all = canonical.map(([name, Icon]) => ({ name, Icon, terms: [name, ...(aliases.get(name) ?? [])].join(' ').toLowerCase() }))

export function IconCatalog() {
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const words = q.toLowerCase().replace(/[-_]/g, ' ').split(' ').filter(Boolean)
  const hits = all.filter(i => words.every(w => i.terms.includes(w)))
  const copy = (name: string) =>
    void navigator.clipboard?.writeText(name).then(() => {
      setCopied(name)
      setTimeout(() => setCopied(null), 1200)
    })
  return (
    <div className="space-y-4 p-4">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={'Search ' + all.length + ' Lucide icons'}
        className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      {hits.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {hits.slice(0, 160).map(({ name, Icon }) => (
            <button
              key={name}
              type="button"
              title={'Copy ' + name + (aliases.get(name) ? ' (also ' + aliases.get(name)!.join(', ') + ')' : '')}
              onClick={() => copy(name)}
              className="flex cursor-copy flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary"
            >
              <Icon className="size-5" />
              <span className="w-full truncate text-center font-mono text-xs text-muted-foreground">{copied === name ? 'copied' : name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No Lucide icon matches &quot;{q}&quot;.</p>
      )}
      {hits.length > 160 ? <p className="font-mono text-xs text-muted-foreground">{hits.length - 160} more: refine the search.</p> : null}
    </div>
  )
}
`
    : `${HEAD}export function IconCatalog() {
  return <p className="p-4 text-sm text-muted-foreground">lucide-react is not installed in this app.</p>
}
`
  return { used, catalog }
}

const ICONS_PAGE = `${HEAD}import Link from 'next/link'
import { components, hrefOf, iconLibraries, icons } from '../../_data'
import { customIcons, usedIcons } from '../../_icons'
import { IconCatalog } from '../../_icon-catalog'
import { CopyTile } from '../../_copy'
import { PageTitle, Panel } from '../../_ui'

export default function IconsPage() {
  const libraries = [...new Set(icons.map(i => i.library))]
  const mixed = libraries.length > 1
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Icons"
        sub={
          (libraries.length ? 'In use: ' + libraries.join(', ') + '. ' : '') +
          'Click an icon to copy its name. To switch library, ask your agent ("use Phosphor icons"); to add your own, ask for an icon component in components/icons.'
        }
      />
      {mixed ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
          <span className="font-medium text-destructive">Mixed icon sets.</span>{' '}
          <span className="text-muted-foreground">This app imports icons from {libraries.join(' and ')}. Ask your agent to move them to one library.</span>
        </p>
      ) : null}
      <Panel label={'in use · ' + icons.length}>
        {icons.length ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {icons.map(i => {
              const Icon = usedIcons[i.key]
              return (
                <CopyTile key={i.key} text={i.name} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary">
                  {Icon ? <Icon className="size-5 shrink-0" /> : null}
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm">{i.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {(mixed ? i.library + ' · ' : '') + i.files.length + ' file' + (i.files.length === 1 ? '' : 's')}
                    </div>
                  </div>
                </CopyTile>
              )
            })}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No icons used yet.</p>
        )}
      </Panel>
      <Panel label={'your icons · ' + customIcons.length}>
        {customIcons.length ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {customIcons.map(({ slug, name, id, Icon }) => {
              const c = components.find(x => x.slug === slug)
              return (
                <div key={slug} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
                  <Icon className="size-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm">{name}</div>
                    {c ? <Link href={hrefOf(c)} className="font-mono text-xs text-muted-foreground hover:underline">{id ?? 'no ID'}</Link> : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            None yet. An icon of your own is a component in components/icons/ that renders an svg, takes className and uses currentColor. It gets an ID and shows here.
          </p>
        )}
      </Panel>
      {iconLibraries.includes('Lucide') ? (
        <Panel label="lucide library">
          <IconCatalog />
        </Panel>
      ) : null}
    </div>
  )
}
`

const INDEX = (section: 'components' | 'shared') => `${HEAD}import Link from 'next/link'
import { components, hrefOf } from '../_data'
import { Arrow, PageTitle, SectionLabel } from '../_ui'

const items = components.filter(c => c.section === ${JSON.stringify(section)})

export default function IndexPage() {
  const groups = [...new Set(items.map(c => c.category))]
  return (
    <div className="flex flex-col gap-8">
      <PageTitle
        title=${JSON.stringify(section === 'components' ? 'Components' : 'Shared Components')}
        sub={items.length + ${JSON.stringify(section === 'components' ? ' base components · click a card for variants, sizes and code.' : ' product components · click a card for its preview, props and the pages that use it.')}}
      />
      {groups.map(g => (
        <section key={g} className="space-y-3">
          <SectionLabel>{g}</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items
              .filter(c => c.category === g)
              .map(c => {
                const meta = c.variants.length
                  ? c.variants.map(v => v.options.length + ' ' + (v.name === 'variant' ? 'variants' : v.name === 'size' ? 'sizes' : v.name)).join(' · ')
                  : c.section === 'shared'
                    ? c.routes.length + (c.routes.length === 1 ? ' page' : ' pages')
                    : 'default'
                return (
                  <Link key={c.slug} href={hrefOf(c)} className="group flex items-center justify-between rounded-lg border border-border bg-card shadow-sm p-4 transition-colors hover:border-primary hover:bg-muted">
                    <div className="min-w-0">
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {c.id ?? 'no ID'} · {meta}
                        {c.preview ? '' : ' · no preview'}
                      </div>
                    </div>
                    <Arrow className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
`

const DETAIL = `${HEAD}import Link from 'next/link'
import { components } from './_data'
import { previews, variantPreviews } from './_previews'
import { PreviewBoundary } from './_boundary'
import { Panel, SectionLabel } from './_ui'
import { Copy } from './_copy'
import { history } from './_activity'
import { tokenHref } from './_reach'

export function ComponentDetail({ slug }: { slug: string }) {
  const c = components.find(x => x.slug === slug)
  if (!c) return <p className="text-sm text-muted-foreground">Unknown component.</p>
  const preview = previews[c.slug]
  const renders = variantPreviews[c.slug] ?? {}
  const importName = c.name
  const usage = c.variants.length
    ? '<' + importName + ' ' + c.variants.map(v => v.name + '="' + (v.default ?? v.options[0]?.value) + '"').join(' ') + ' />'
    : c.parts.length
      ? '<' + importName + '>\\n  …\\n</' + importName + '>'
      : '<' + importName + ' />'
  const imported = c.example ? [importName, ...c.parts.filter(p => c.example!.code.includes('<' + p))] : [importName, ...c.parts]
  const from = '@/' + c.file.replace(/^src\\//, '').replace(/\\.(tsx|jsx)$/, '')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel>{(c.section === 'components' ? 'components' : 'shared') + ' · ' + c.category}</SectionLabel>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-medium tracking-tight">{c.name}</h1>
          {c.id ? <Copy text={c.id} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-sm" /> : <span className="rounded-md border border-border px-2 py-0.5 font-mono text-sm">no ID</span>}
        </div>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{c.file}</p>
      </div>

      <Panel label="preview">
        <div className="p-6">
          {preview ? (
            <PreviewBoundary>{preview()}</PreviewBoundary>
          ) : (
            <p className="text-sm text-muted-foreground">
              No preview yet. Ask your agent: &quot;add a preview for {c.id ?? c.name}&quot;. Meanwhile it is live on the pages below.
            </p>
          )}
        </div>
      </Panel>

      {c.variants.map(g => (
        <Panel key={g.name} label={g.name === 'variant' ? 'variants' : g.name === 'size' ? 'sizes' : g.name}>
          <div className="divide-y divide-border">
            {g.options.map(o => (
              <div key={o.value} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                <div className="w-36 shrink-0">
                  {renders[g.name]?.[o.value] ? <PreviewBoundary>{renders[g.name][o.value]()}</PreviewBoundary> : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-mono text-sm">
                    {o.value}
                    {g.default === o.value ? <span className="ml-2 text-xs text-muted-foreground">default</span> : null}
                  </div>
                  <div className="break-words font-mono text-xs text-muted-foreground">{o.classes}</div>
                </div>
                <code className="shrink-0 font-mono text-xs">{g.name + '="' + o.value + '"'}</code>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <Panel
        label={c.example ? 'usage · in this app' : 'usage'}
        right={<span className="truncate font-mono text-xs text-muted-foreground">{c.example ? c.example.file : 'not used in this app yet'}</span>}
      >
        <pre className="overflow-x-auto p-4 font-mono text-xs">{'import ' + (imported.length > 3 ? '{\\n  ' + imported.join(',\\n  ') + ',\\n}' : '{ ' + imported.join(', ') + ' }') + ' from \\'' + from + '\\'\\n\\n' + (c.example ? c.example.code : usage)}</pre>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel label="props">
          <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-mono text-xs">{c.props ?? 'No props'}</pre>
          {c.parts.length ? <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Parts: {c.parts.join(', ')}</p> : null}
        </Panel>
        <Panel label={'used on · ' + c.routes.length}>
          <div className="flex flex-wrap gap-2 p-4">
            {c.routes.length ? (
              c.routes.map(r =>
                r.includes('[') ? (
                  <span key={r} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{r}</span>
                ) : (
                  <Link key={r} href={r} className="rounded-md bg-muted px-2 py-1 font-mono text-xs hover:underline">{r}</Link>
                ),
              )
            ) : (
              <span className="text-sm text-muted-foreground">Not on a page yet.</span>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        label={'tokens · ' + c.tokens.length}
        right={<span className="font-mono text-xs text-muted-foreground">referenced in its file</span>}
      >
        <div className="flex flex-wrap gap-1.5 p-4">
          {c.tokens.length ? (
            c.tokens.map(t => (
              <Link key={t} href={tokenHref(t)} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs hover:bg-muted">{t}</Link>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No token referenced directly; it may style itself through the components it renders.</span>
          )}
        </div>
      </Panel>

      <Panel label={'history · ' + (history[c.slug]?.length ?? 0)}>
        <div className="p-2">
          {history[c.slug]?.length ? (
            history[c.slug].map(e => (
              <div key={e.at + e.label} className="flex items-start gap-3 border-b border-border px-3 py-2 font-mono text-xs last:border-0">
                <span className={'mt-0.5 shrink-0 rounded-sm border border-border bg-muted px-1.5 uppercase tracking-wide ' + (e.verdict === 'verified' ? 'text-primary' : e.verdict === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                  {e.verdict === 'verified' ? 'verified' : e.verdict === 'failed' ? 'failed' : 'partial'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground">{e.label}</div>
                  <div className="mt-0.5 text-muted-foreground">{e.at.slice(0, 10)}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="px-2 py-3 font-mono text-xs text-muted-foreground">no edits to this component yet (ID syncs not counted)</p>
          )}
        </div>
      </Panel>
    </div>
  )
}
`

const DETAIL_PAGE = (section: 'components' | 'shared') => `${HEAD}import { notFound } from 'next/navigation'
import { components } from '../../_data'
import { ComponentDetail } from '../../_detail'

export function generateStaticParams() {
  return components.filter(c => c.section === ${JSON.stringify(section)}).map(c => ({ id: c.slug }))
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!components.some(c => c.slug === id && c.section === ${JSON.stringify(section)})) notFound()
  return <ComponentDetail slug={id} />
}
`

const SITEMAP = `${HEAD}import Link from 'next/link'
import { components, hrefOf, pages } from '../_data'
import { PageTitle, Panel } from '../_ui'

export default function SitemapPage() {
  const bySlug = new Map(components.map(c => [c.slug, c]))
  const area = (route: string) => '/' + (route.split('/')[1] ?? '')
  const areas = [...new Set(pages.map(p => area(p.route)))]
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Sitemap" sub={pages.length + ' pages, grouped by section, and the components each one is built from.'} />
      {areas.map(a => {
        const list = pages.filter(p => area(p.route) === a)
        return (
          <Panel key={a} label={a === '/' ? 'root' : a} right={<span className="font-mono text-xs tabular-nums text-muted-foreground">{list.length} {list.length === 1 ? 'page' : 'pages'}</span>}>
            <div className="divide-y divide-border">
              {list.map(p => {
                const used = p.components.map(s => bySlug.get(s)).filter((c): c is NonNullable<typeof c> => !!c)
                const shared = used.filter(c => c.section === 'shared')
                const base = used.filter(c => c.section === 'components')
                const cut = p.route.lastIndexOf('/')
                const parent = cut > 0 ? p.route.slice(0, cut) : ''
                const leaf = p.route.slice(cut) || '/'
                const label = (
                  <span className="break-all">
                    <span className="text-muted-foreground">{parent}</span>
                    <span className="text-foreground">{leaf}</span>
                  </span>
                )
                return (
                  <div key={p.route} className="flex min-w-0 flex-col gap-2 px-4 py-3">
                    <div className="font-mono text-sm">
                      {p.route.includes('[') ? label : <Link href={p.route} className="hover:underline">{label}</Link>}
                    </div>
                    {used.length ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {shared.map(c => (
                          <Link key={c.slug} href={hrefOf(c)} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted">
                            {c.name}
                          </Link>
                        ))}
                        {base.map(c => (
                          <Link key={c.slug} href={hrefOf(c)} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground">
                            {c.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">no design-system components</span>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
`

const DOCS = `${HEAD}import { components, tokens } from '../_data'
import { PageTitle, Panel } from '../_ui'

export default function DocsPage() {
  const sample = components.find(c => c.section === 'shared' && c.id) ?? components.find(c => c.id)
  const token = tokens.find(t => t.name === '--primary') ?? tokens[0]
  const steps = [
    ['Change a component by name or ID', (sample ? sample.id + ': make the corners rounder' : 'CID-001: make the corners rounder') + '. Only that component changes; every page using it follows, and pages that do not use it must render pixel-identically.'],
    ['Change a token', (token ? token.name : '--primary') + ': a warmer shade. Every component built from the token follows.'],
    ['Change something on one page only', 'If a component or token is shared, your agent asks first: a new component (or token) just for that page, or update it everywhere.'],
    ['Add a component', 'Describe it and where it goes. It gets the next free ID and appears here with a preview.'],
    ['Undo', 'Say "undo that": only the files of that edit are restored, byte for byte.'],
  ]
  const handoff = [
    ['Tokens for developers', 'npx coherent export tokens --format dtcg   (also: css, tailwind)'],
    ['For AI agents', 'npx coherent mcp --profile agent   (inventory, IDs, governed edits)'],
    ['Component source', 'Every component lives in components/ with its ID in a comment above it.'],
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Documentation" sub="How to work with this design system, and how to hand it off." />
      <Panel label="working with the system">
        <div className="divide-y divide-border">
          {steps.map(([title, body]) => (
            <div key={title} className="space-y-1 px-4 py-4">
              <div className="font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel label="handoff">
        <div className="divide-y divide-border">
          {handoff.map(([title, body]) => (
            <div key={title} className="space-y-1 px-4 py-4">
              <div className="font-medium">{title}</div>
              <p className="font-mono text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
`

const RECOMMENDATIONS = `${HEAD}import Link from 'next/link'
import { components, duplicates, hrefOf, rawValues, tokens } from '../_data'
import { PageTitle, Panel } from '../_ui'
import { pairs } from '../_color'

const KIND_LABEL: Record<string, string> = { color: 'colour', type: 'type size', spacing: 'spacing', radius: 'radius', shadow: 'shadow' }

const enforced = [
  ['Addressed edits stay in place', 'An edit of a component by ID or name may change only that component. Pages that use it change; pages that do not must render pixel-identically.'],
  ['Pages do not restyle components', 'A page edit cannot change shared components, primitives or tokens.'],
  ['Tokens live in the stylesheet', 'A token edit changes only stylesheets, and every page follows.'],
  ['Every component has an ID', 'A new component without an @coherent-id comment, or with an ID already taken, fails verification.'],
  ['Shared changes are asked, not assumed', 'Asked to change something several pages use on only some of them, the agent asks: new component or token, or everywhere.'],
  ['Hardcoded values are flagged', 'Colours, type sizes, spacing, radius and shadows an edit writes as literals (bg-[#hex], text-[15px], text-blue-500, style colours) come back as warnings. They do not fail the edit yet.'],
  ['Every edit is proven', 'Declared files only, no new type or browser errors, a production build, before/after renders, no real names or emails. A failed edit is never committed.'],
]

export default function RecommendationsPage() {
  const noPreview = components.filter(c => !c.preview && c.section === 'shared')
  const unused = components.filter(c => c.section === 'shared' && c.routes.length === 0)
  const noDark = tokens.filter(t => t.category === 'color' && !t.dark)
  // Primitives in components/ui carry their library's own literals (shadcn's text-[0.8rem]): listed apart.
  const primitiveFiles = new Set(components.filter(c => c.section === 'components').map(c => c.file))
  const vendor = rawValues.filter(v => primitiveFiles.has(v.file))
  const own = rawValues.filter(v => !primitiveFiles.has(v.file))
  const rawFiles = [...new Set(own.map(v => v.file))]
  const repeated = Object.entries(
    own.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v.value]: (acc[v.value] ?? 0) + 1 }), {}),
  )
    .filter(([, n]) => n > 2)
    .sort((a, b) => b[1] - a[1])
  const weak = pairs(tokens).filter(p => (p.light !== null && p.light < 4.5) || (p.dark !== null && p.dark < 4.5))
  const stats = [
    { label: 'components without ID', value: components.filter(c => !c.id).length },
    { label: 'duplicate IDs', value: duplicates.length },
    { label: 'shared components without preview', value: noPreview.length },
    { label: 'components not on any page', value: unused.length },
    { label: 'text colours below AA contrast', value: weak.length },
    { label: 'hardcoded values', value: own.length },
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Recommendations" sub="The state of this design system, and the rules Coherent checks on every edit." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card shadow-sm p-4">
            <div className={'font-mono text-3xl font-medium tabular-nums ' + (s.value ? 'text-foreground' : 'text-primary')}>{s.value}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {noPreview.length || unused.length || noDark.length || weak.length ? (
        <Panel label="suggestions">
          <div className="divide-y divide-border text-sm">
            {noPreview.length ? (
              <div className="space-y-2 px-4 py-4">
                <div className="font-medium">Add previews</div>
                <p className="text-muted-foreground">Ask your agent to add previews for these, so they can be reviewed here:</p>
                <div className="flex flex-wrap gap-1.5">
                  {noPreview.map(c => (
                    <Link key={c.slug} href={hrefOf(c)} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs hover:bg-muted">{c.id ?? c.name}</Link>
                  ))}
                </div>
              </div>
            ) : null}
            {unused.length ? (
              <div className="space-y-2 px-4 py-4">
                <div className="font-medium">Not used on any page</div>
                <p className="text-muted-foreground">Place them, or ask your agent to remove them.</p>
                <div className="flex flex-wrap gap-1.5">
                  {unused.map(c => (
                    <Link key={c.slug} href={hrefOf(c)} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs hover:bg-muted">{c.name}</Link>
                  ))}
                </div>
              </div>
            ) : null}
            {weak.length ? (
              <div className="space-y-2 px-4 py-4">
                <div className="font-medium">Low contrast text</div>
                <p className="text-muted-foreground">
                  Below 4.5:1 normal text is hard to read (WCAG AA). Fix the token, for example &quot;{weak[0].fg!.name}: more contrast&quot;.
                </p>
                <div className="flex flex-col gap-1 font-mono text-xs">
                  {weak.map(p => (
                    <Link key={p.base.name} href={'/design-system/tokens/colors#token' + p.base.name.slice(1)} className="hover:underline">
                      {p.fg!.name} on {p.base.name}
                      <span className="text-muted-foreground">
                        {' · light ' + (p.light?.toFixed(1) ?? '?') + ' · dark ' + (p.dark?.toFixed(1) ?? '?')}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {noDark.length ? (
              <div className="space-y-2 px-4 py-4">
                <div className="font-medium">Colors without a dark value</div>
                <p className="font-mono text-xs text-muted-foreground">{noDark.map(t => t.name).join(' · ')}</p>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
      {rawValues.length ? (
        <Panel label={'hardcoded values · ' + own.length} right={<span className="font-mono text-xs text-muted-foreground">{rawFiles.length} files</span>}>
          <div className="divide-y divide-border text-sm">
            <p className="px-4 py-3 text-muted-foreground">
              Colours, sizes and radii written as literals instead of tokens. They do not follow a token change. Coherent warns when an edit adds one; ask your agent to replace them, for example &quot;replace hardcoded values in {rawFiles[0] ?? 'components/ui'}&quot;.
            </p>
            {repeated.length ? (
              <div className="space-y-2 px-4 py-3">
                <div className="font-medium">Repeated: candidates for a token</div>
                <div className="flex flex-wrap gap-1.5">
                  {repeated.map(([value, n]) => (
                    <span key={value} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs">
                      {value} <span className="text-muted-foreground">×{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {rawFiles.map(f => (
              <div key={f} className="space-y-1 px-4 py-3">
                <div className="font-mono text-xs text-foreground">{f}</div>
                {own
                  .filter(v => v.file === f)
                  .map(v => (
                    <div key={v.line + v.value} className="flex gap-3 font-mono text-xs text-muted-foreground">
                      <span className="w-10 shrink-0 tabular-nums">:{v.line}</span>
                      <span className="text-foreground">{v.value}</span>
                      <span>{KIND_LABEL[v.kind] ?? v.kind}</span>
                    </div>
                  ))}
              </div>
            ))}
            {vendor.length ? (
              <details className="px-4 py-3">
                <summary className="cursor-pointer text-muted-foreground">
                  {vendor.length + ' more in UI primitives (components/ui): mostly defaults of the UI library, left as they are'}
                </summary>
                <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                  {vendor.map(v => (
                    <div key={v.file + v.line + v.value}>
                      {v.file}:{v.line} <span className="text-foreground">{v.value}</span>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <Panel label="enforced on every edit">
        <div className="divide-y divide-border">
          {enforced.map(([title, body]) => (
            <div key={title} className="space-y-1 px-4 py-4">
              <div className="font-medium">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
`

/** All viewer files for this design system, keyed by project-relative path. */
export function renderDesignSystemFiles(ds: DesignSystem, appDir: string, ctx: SiteContext): Map<string, string> {
  const dir = `${appDir}/design-system`
  const { code: previews, live } = renderPreviews(ds, dir)
  const icons = renderIcons(ds, ctx, dir)
  const files: [string, string][] = [
    ['page.tsx', HOME],
    ['layout.tsx', LAYOUT],
    ['_data.ts', renderData(ds, ctx, live)],
    [DS_VOLATILE, renderActivity(ds, ctx)],
    ['_copy.tsx', COPY],
    ['_color.ts', COLOR],
    ['_reach.tsx', REACH],
    ['_previews.tsx', previews],
    ['_shell.tsx', SHELL],
    ['_boundary.tsx', BOUNDARY],
    ['_ui.tsx', UI],
    ['_detail.tsx', DETAIL],
    ['_icons.tsx', icons.used],
    ['_icon-catalog.tsx', icons.catalog],
    ['tokens/page.tsx', TOKENS_HOME],
    ['tokens/colors/page.tsx', COLORS],
    ['tokens/typography/page.tsx', TYPOGRAPHY],
    ['tokens/spacing/page.tsx', SPACING],
    ['tokens/icons/page.tsx', ICONS_PAGE],
    ['components/page.tsx', INDEX('components')],
    ['components/[id]/page.tsx', DETAIL_PAGE('components')],
    ['shared/page.tsx', INDEX('shared')],
    ['shared/[id]/page.tsx', DETAIL_PAGE('shared')],
    ['sitemap/page.tsx', SITEMAP],
    ['docs/page.tsx', DOCS],
    ['recommendations/page.tsx', RECOMMENDATIONS],
  ]
  return new Map(files.map(([f, c]) => [`${dir}/${f}`, c]))
}
