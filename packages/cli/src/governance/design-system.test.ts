import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildGraph } from './graph.js'
import {
  annotate,
  buildDesignSystem,
  componentDecls,
  parseTokens,
  planSync,
  renderDesignSystemPage,
  resolveTarget,
} from './design-system.js'

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

  it('renders a page with every ID and token, using theme utilities only', () => {
    const page = renderDesignSystemPage(buildDesignSystem(buildGraph(root)))
    expect(page).toContain('@coherent-generated design-system')
    expect(page).toContain('"CID-002"')
    expect(page).toContain('"--primary"')
    // No arbitrary Tailwind values in className strings.
    expect(page.match(/className="[^"]*\[[^"]*"/g)).toBeNull()
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

  it('get one ID per file; their parts are addressed through it', () => {
    const plan = planSync(buildGraph(root))
    expect(plan.assigned).toEqual([{ id: 'CID-001', name: 'Select', file: 'src/components/ui/select.tsx' }])
    write('src/components/ui/select.tsx', plan.annotations.get('src/components/ui/select.tsx')!)
    const ds = buildDesignSystem(buildGraph(root))
    expect(ds.components).toMatchObject([{ id: 'CID-001', name: 'Select', parts: ['SelectItem'] }])
    expect(resolveTarget(ds, '@SelectItem')).toMatchObject({ component: { id: 'CID-001' } })
  })
})
