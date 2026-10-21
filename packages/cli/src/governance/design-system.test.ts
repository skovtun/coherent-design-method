import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildGraph, impactOf } from './graph.js'
import { planTargets } from './session.js'
import { annotate, buildDesignSystem, componentDecls, parseTokens, planSync, resolveTarget } from './design-system.js'
import { renderDesignSystemFiles } from './design-system-site.js'

describe('componentDecls', () => {
  it('finds exported components in every export style, with the ID each carries', () => {
    const src = `'use client'
import * as React from 'react'
/** Primary action. */
/** @coherent-id CID-004 */
export function Hero() { return <section /> }
export const Card = React.forwardRef<HTMLDivElement, {}>((p, ref) => <div ref={ref} />)
function Button() { return <button /> }
const buttonVariants = () => ''
export { Button, buttonVariants }
export const formatPrice = (n: number) => String(n)
function Footer() { return <footer /> }
export default Footer
`
    const d = componentDecls('x.tsx', src)
    expect(d.map(x => [x.name, x.id ?? null])).toEqual([
      ['Hero', 'CID-004'],
      ['Card', null],
      ['Button', null],
      ['Footer', null],
    ])
  })
})

describe('annotate', () => {
  it('adds an ID above each unannotated component, keeps existing comments, and is idempotent', () => {
    const src = `/** Docs. */\nexport function A() { return null }\n/** @coherent-id CID-001 */\nexport function B() { return null }\n`
    const r = annotate('x.tsx', src, ['CID-009'])
    expect(r.assigned).toEqual([{ name: 'A', id: 'CID-009' }])
    expect(r.text).toContain('/** Docs. */\n/** @coherent-id CID-009 */\nexport function A')
    expect(componentDecls('x.tsx', r.text).map(d => d.id)).toEqual(['CID-009', 'CID-001'])
    expect(annotate('x.tsx', r.text, ['CID-010']).text).toBe(r.text)
  })
})

describe('parseTokens', () => {
  it('reads :root and .dark values and drops @theme aliases of them', () => {
    const css = `@import "tailwindcss";
@theme inline {
  --color-primary: var(--primary);
  --radius-lg: calc(var(--radius) + 2px);
  --font-sans: var(--font-geist-sans);
}
:root { --primary: oklch(0.6 0.2 150); /* brand */ --radius: 0.625rem; }
.dark { --primary: oklch(0.7 0.2 150); }
`
    const t = parseTokens('app/globals.css', css)
    expect(t.map(x => [x.name, x.category, x.value, x.dark ?? null])).toEqual([
      ['--primary', 'color', 'oklch(0.6 0.2 150)', 'oklch(0.7 0.2 150)'],
      ['--radius', 'radius', '0.625rem', null],
      ['--font-sans', 'font', 'var(--font-geist-sans)', null],
    ])
  })
})

let root: string
const write = (p: string, c: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), c)
}

describe('design system from a project', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cds-'))
    write('src/app/globals.css', ':root { --primary: #10b981; --radius: 0.5rem; }\n')
    write('src/components/ui/button.tsx', 'function Button() { return <button /> }\nexport { Button }\n')
    write('src/components/kpi-card.tsx', '/** @coherent-id CID-002 */\nexport function KpiCard() { return <div /> }\n')
    write('src/components/hero.tsx', 'export function Hero() { return <section /> }\n')
    write(
      'src/app/page.tsx',
      "import { KpiCard } from '../components/kpi-card'\nimport { Hero } from '../components/hero'\nimport { Button } from '../components/ui/button'\nexport default () => <><Hero /><KpiCard /><Button /></>\n",
    )
    write(
      'src/app/earnings/page.tsx',
      "import { KpiCard } from '../../components/kpi-card'\nexport default () => <KpiCard />\n",
    )
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('classifies components by reach and finds the next free ID', () => {
    const ds = buildDesignSystem(buildGraph(root))
    expect(ds.components.map(c => [c.name, c.kind, c.id ?? null, c.routes])).toEqual([
      ['Hero', 'block', null, ['/']],
      ['KpiCard', 'shared', 'CID-002', ['/', '/earnings']],
      ['Button', 'ui', null, ['/']],
    ])
    expect(ds.nextId).toBe('CID-003')
    expect(ds.page).toBeNull()
  })

  it('maps each token to the components and pages that reference it in code', () => {
    write('src/app/globals.css', ':root { --primary: #10b981; --radius: 0.5rem; --muted: #eee; --brand: #f00; }\n')
    write(
      'src/components/kpi-card.tsx',
      '/** @coherent-id CID-002 */\nexport function KpiCard() { return <div className="rounded-lg bg-primary/90 hover:text-muted" /> }\n',
    )
    write(
      'src/components/hero.tsx',
      "export function Hero() { return <section style={{ color: 'var(--brand)' }} /> }\n",
    )
    const ds = buildDesignSystem(buildGraph(root))
    const t = (n: string) => ds.tokens.find(x => x.name === n)
    expect([t('--primary')?.usedBy, t('--primary')?.routes]).toEqual([['CID-002'], ['/', '/earnings']])
    expect([t('--brand')?.usedBy, t('--brand')?.routes]).toEqual([['Hero'], ['/']])
    expect(t('--radius')?.usedBy).toEqual(['CID-002'])
    expect(ds.components.find(c => c.name === 'KpiCard')?.tokens).toEqual(['--muted', '--primary', '--radius'])
    expect(ds.components.find(c => c.name === 'Button')?.tokens).toBeUndefined()
  })

  it('a refactor expects every affected page to render unchanged', () => {
    const graph = buildGraph(root)
    const file = 'src/components/kpi-card.tsx'
    const impact = impactOf(graph, file)
    const normal = planTargets(root, graph, 'component', [file], impact)
    const refactor = planTargets(root, graph, 'component', [file], impact, true)
    expect(normal.targets.filter(t => t.expected === 'change').map(t => t.route)).toEqual(['/', '/earnings'])
    expect(refactor.targets.map(t => [t.route, t.expected])).toEqual([
      ['/', 'same'],
      ['/earnings', 'same'],
    ])
  })

  it('addresses exactly: by ID, by name, by token; never by a guess', () => {
    const ds = buildDesignSystem(buildGraph(root))
    expect(resolveTarget(ds, 'cid-002')).toMatchObject({ type: 'component', component: { name: 'KpiCard' } })
    expect(resolveTarget(ds, '@hero')).toMatchObject({
      type: 'component',
      component: { file: 'src/components/hero.tsx' },
    })
    expect(resolveTarget(ds, '--radius')).toMatchObject({ type: 'token', token: { file: 'src/app/globals.css' } })
    expect(() => resolveTarget(ds, 'CID-099')).toThrow(/No component carries CID-099/)
    expect(() => resolveTarget(ds, 'Kpi')).toThrow(/Nothing named/)
  })

  it('plans IDs for unannotated components in a stable order', () => {
    const plan = planSync(buildGraph(root))
    expect(plan.assigned).toEqual([
      { id: 'CID-003', name: 'Hero', file: 'src/components/hero.tsx' },
      { id: 'CID-004', name: 'Button', file: 'src/components/ui/button.tsx' },
    ])
    expect(plan.page).toBe('src/app/design-system/page.tsx')
  })

  it('refuses to take over a /design-system page that is not Coherent’s', () => {
    write('src/app/design-system/page.tsx', 'export default () => <p>mine</p>\n')
    expect(() => planSync(buildGraph(root))).toThrow(/not Coherent's design-system page/)
  })

  it('renders the viewer with every ID, token and generated primitive preview, theme utilities only', () => {
    write(
      'src/components/ui/badge.tsx',
      "import { cva } from 'class-variance-authority'\nconst badgeVariants = cva('rounded', { variants: { variant: { default: 'bg-primary', outline: 'border' } }, defaultVariants: { variant: 'default' } })\nfunction Badge() { return <span /> }\nexport { Badge, badgeVariants }\n",
    )
    const files = renderDesignSystemFiles(buildDesignSystem(buildGraph(root)), 'src/app', {
      appName: 'Demo',
      version: '1.0.0',
      edits: [
        {
          label: 'CID-002: bigger number',
          verdict: 'verified',
          at: '2026-10-19T10:00:00Z',
          files: ['src/components/kpi-card.tsx'],
        },
        {
          label: 'Sync the design system: IDs',
          verdict: 'verified',
          at: '2026-10-18T10:00:00Z',
          files: ['src/components/kpi-card.tsx'],
        },
      ],
      pages: ['/'],
      icons: [],
      hasIcons: false,
    })
    expect([...files.keys()]).toContain('src/app/design-system/shared/[id]/page.tsx')
    expect([...files.keys()]).toContain('src/app/design-system/components/[id]/page.tsx')
    const data = files.get('src/app/design-system/_data.ts')!
    expect(data).toContain('"CID-002"')
    expect(data).toContain('"--primary"')
    const activity = files.get('src/app/design-system/_activity.ts')!
    expect(activity).toContain('"cid-002": [')
    expect(activity.match(/bigger number/g)).toHaveLength(2) // recent edits + KpiCard history, sync not in history
    expect(activity).not.toContain('"files"')
    const previews = files.get('src/app/design-system/_previews.tsx')!
    expect(previews).toMatch(/import \{ Badge as C\d+_Badge \} from '\.\.\/\.\.\/components\/ui\/badge'/)
    expect(previews).toContain('variant="outline">Outline<')
    expect(activity).toContain('export const renderedOn: string = "2026-10-19"')
    for (const [, text] of files) {
      expect(text.startsWith('// @coherent-generated design-system')).toBe(true)
      expect(text.match(/className="[^"]*\[[^"]*"/g)).toBeNull()
      // Next 16 cacheComponents refuses to prerender a page that reads the current time.
      expect(text).not.toMatch(/new Date\(\)|Date\.now\(\)/)
    }
  })
})

describe('icons', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cds-'))
    write(
      'src/components/icons/logo.tsx',
      "import type { SVGProps } from 'react'\nexport function Logo(props: SVGProps<SVGSVGElement>) { return <svg {...props} /> }\n",
    )
    write('src/app/page.tsx', "import { Logo } from '../components/icons/logo'\nexport default () => <Logo />\n")
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('imports used icons from each library and the app’s own icons', () => {
    const files = renderDesignSystemFiles(buildDesignSystem(buildGraph(root)), 'src/app', {
      appName: 'Demo',
      version: '1.0.0',
      edits: [],
      pages: ['/'],
      icons: [
        { name: 'House', module: 'lucide-react', library: 'Lucide', files: ['src/app/page.tsx'] },
        { name: 'HomeIcon', module: '@heroicons/react/24/outline', library: 'Heroicons', files: ['src/app/page.tsx'] },
      ],
      iconLibraries: ['Lucide', 'Heroicons'],
      hasIcons: true,
    })
    const icons = files.get('src/app/design-system/_icons.tsx')!
    expect(icons).toContain('import { House as I0 } from "lucide-react"')
    expect(icons).toContain('import { HomeIcon as I1 } from "@heroicons/react/24/outline"')
    expect(icons).toContain('import { Logo as U0 } from "../../components/icons/logo"')
    expect(files.get('src/app/design-system/_data.ts')).toContain('"key": "@heroicons/react/24/outline:HomeIcon"')
  })
})

describe('primitive aliases', () => {
  it('names a primitive after its file even when it is a re-exported part, and keeps an ID written elsewhere in the file', () => {
    const src = `import * as SelectPrimitive from "@radix-ui/react-select"
const Select = SelectPrimitive.Root
/** @coherent-id CID-022 */
function SelectGroup() { return <SelectPrimitive.Group /> }
function SelectItem() { return <SelectPrimitive.Item /> }
export { Select, SelectGroup, SelectItem }
`
    expect(componentDecls('select.tsx', src).map(d => d.name)).toEqual(['Select', 'SelectGroup', 'SelectItem'])
    root = mkdtempSync(join(tmpdir(), 'cds-'))
    try {
      write('src/components/ui/select.tsx', src)
      write('src/app/page.tsx', "import { Select } from '../components/ui/select'\nexport default () => <Select />\n")
      const c = buildDesignSystem(buildGraph(root)).components.find(x => x.file.endsWith('select.tsx'))
      expect([c?.name, c?.id, c?.parts]).toEqual(['Select', 'CID-022', ['SelectGroup', 'SelectItem']])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('primitives', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cds-'))
    write(
      'src/components/ui/select.tsx',
      'function SelectItem() { return <div /> }\nfunction Select() { return <div /> }\nexport { Select, SelectItem }\n',
    )
    write('src/app/page.tsx', "import { Select } from '../components/ui/select'\nexport default () => <Select />\n")
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('show a real use from the app, with the parts it composes', () => {
    write(
      'src/app/page.tsx',
      "import { Select, SelectItem } from '../components/ui/select'\nexport default () => (\n  <main>\n    <Select>\n      <SelectItem />\n    </Select>\n  </main>\n)\n",
    )
    const [select] = buildDesignSystem(buildGraph(root)).components
    expect(select.example).toEqual({ code: '<Select>\n  <SelectItem />\n</Select>', file: 'src/app/page.tsx' })
  })

  it('get one ID per file; their parts are addressed through it', () => {
    const plan = planSync(buildGraph(root))
    expect(plan.assigned).toEqual([{ id: 'CID-001', name: 'Select', file: 'src/components/ui/select.tsx' }])
    write('src/components/ui/select.tsx', plan.annotations.get('src/components/ui/select.tsx')!)
    const ds = buildDesignSystem(buildGraph(root))
    expect(ds.components).toMatchObject([{ id: 'CID-001', name: 'Select', parts: ['SelectItem'] }])
    expect(resolveTarget(ds, '@SelectItem')).toMatchObject({ component: { id: 'CID-001' } })
  })
})
