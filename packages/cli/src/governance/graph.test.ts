import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { buildGraph, impactOf, routeFromAppPath, type ProjectGraph } from './graph.js'

let root: string
let g: ProjectGraph

const files: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { jsx: 'react-jsx', moduleResolution: 'bundler', module: 'esnext', paths: { '@/*': ['./src/*'] } },
  }),
  'src/app/globals.css': '@import "tailwindcss";\n',
  'src/app/layout.tsx': `import "./globals.css";\nexport default function Root({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }`,
  'src/app/page.tsx': `import { Button } from "@/components/ui/button";\nexport default function SignIn() { return <Button>Go</Button> }`,
  'src/app/(dash)/layout.tsx': `import { Shell } from "@/components/shared/shell";\nexport default function L({ children }: { children: React.ReactNode }) { return <Shell>{children}</Shell> }`,
  'src/app/(dash)/overview/page.tsx': `import { KpiGrid } from "@/components/shared/kpi-grid";\nexport default function P() { return <KpiGrid /> }`,
  'src/app/(dash)/billing/[id]/page.tsx': `export default function P() { return <div /> }`,
  'src/components/shared/shell.tsx': `"use client";\nimport { Sidebar } from "./sidebar";\nexport function Shell({ children }: { children: React.ReactNode }) { return <div><Sidebar />{children}</div> }`,
  'src/components/shared/sidebar.tsx': `export function Sidebar() { return <nav /> }`,
  'src/components/shared/kpi-grid.tsx': `import { KpiCard } from "./kpi-card";\nexport function KpiGrid() { return <KpiCard label="a" value="1" /> }`,
  'src/components/shared/kpi-card.tsx': `interface KpiCardProps { label: string; value: string }\nexport function KpiCard({ label, value }: KpiCardProps) { return <div>{label}{value}</div> }`,
  'src/components/ui/button.tsx': `import * as React from "react";\nconst Button = React.forwardRef<HTMLButtonElement, { variant?: string }>((props, ref) => <button ref={ref} />);\nexport { Button }`,
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cg-'))
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), c)
  }
  g = buildGraph(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('routeFromAppPath', () => {
  it('strips route groups and keeps dynamic segments', () => {
    expect(routeFromAppPath('src/app/(dash)/billing/[id]/page.tsx', 'src/app')).toBe('/billing/[id]')
    expect(routeFromAppPath('src/app/page.tsx', 'src/app')).toBe('/')
  })
})

describe('buildGraph', () => {
  it('classifies nodes and resolves @/ aliases and relative imports', () => {
    expect(g.nodes['src/app/(dash)/overview/page.tsx'].kind).toBe('page')
    expect(g.nodes['src/app/(dash)/layout.tsx'].kind).toBe('layout')
    expect(g.nodes['src/components/ui/button.tsx'].kind).toBe('ui')
    expect(g.nodes['src/app/(dash)/overview/page.tsx'].imports).toEqual(['src/components/shared/kpi-grid.tsx'])
    expect(g.nodes['src/app/layout.tsx'].imports).toEqual(['src/app/globals.css'])
  })

  it('records client boundary and resolves local props types', () => {
    expect(g.nodes['src/components/shared/shell.tsx'].client).toBe(true)
    expect(g.nodes['src/components/shared/sidebar.tsx'].client).toBe(false)
    const kpi = g.nodes['src/components/shared/kpi-card.tsx'].exports[0]
    expect(kpi.name).toBe('KpiCard')
    expect(kpi.props).toContain('label: string')
  })

  it('sees exports declared via export { } lists', () => {
    expect(g.nodes['src/components/ui/button.tsx'].exports.map(e => e.name)).toEqual(['Button'])
  })
})

describe('impactOf', () => {
  it('follows component chains transitively to pages', () => {
    const i = impactOf(g, 'src/components/shared/kpi-card.tsx')
    expect(i.files).toEqual(['src/app/(dash)/overview/page.tsx', 'src/components/shared/kpi-grid.tsx'])
    expect(i.routes).toEqual(['/overview'])
  })

  it('reaches every page under a layout that renders the target', () => {
    expect(impactOf(g, 'src/components/shared/sidebar.tsx').routes).toEqual(['/billing/[id]', '/overview'])
  })

  it('treats the root stylesheet as site-wide', () => {
    expect(impactOf(g, 'src/app/globals.css').routes).toEqual(['/', '/billing/[id]', '/overview'])
  })

  it('does not leak a page-local component to sibling routes', () => {
    expect(impactOf(g, 'src/components/ui/button.tsx').routes).toEqual(['/'])
  })
})
