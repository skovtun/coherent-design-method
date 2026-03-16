/**
 * Generate Next.js App Router pages from Figma frames (Story 3.11).
 * Frame → route → app/{route}/page.tsx; layout from auto-layout; component instances from map.
 */

import type { FigmaPageData, FigmaNode, FigmaLayout } from '../types/figma.js'

/** Component map: figma component definition id → base or shared (from coherent.figma-component-map.json). */
export type FigmaComponentMap = Record<
  string,
  { kind: 'base'; baseId: string } | { kind: 'shared'; cid: string; name: string; file: string }
>

/** One generated page: file path and full TSX content. */
export interface GeneratedPage {
  route: string
  filePath: string
  content: string
}

/** Base component id → import path (without extension) and default export name(s). */
const BASE_IMPORTS: Record<string, { path: string; names: string[] }> = {
  button: { path: '@/components/ui/button', names: ['Button'] },
  card: { path: '@/components/ui/card', names: ['Card', 'CardHeader', 'CardTitle', 'CardContent', 'CardFooter'] },
  input: { path: '@/components/ui/input', names: ['Input'] },
  textarea: { path: '@/components/ui/textarea', names: ['Textarea'] },
  badge: { path: '@/components/ui/badge', names: ['Badge'] },
  label: { path: '@/components/ui/label', names: ['Label'] },
}

/**
 * Get Next.js app page file path for a route.
 * "" → app/page.tsx; "dashboard" → app/dashboard/page.tsx.
 */
export function getPageFilePath(route: string): string {
  const r = (route || '').trim()
  return r === '' ? 'app/page.tsx' : `app/${r}/page.tsx`
}

/**
 * Layout to Tailwind container classes (flex + gap + padding).
 */
function layoutToClassName(layout?: FigmaLayout | null): string {
  if (!layout || layout.layoutMode === 'NONE') return 'flex flex-col gap-4 p-4'
  const dir = layout.layoutMode === 'HORIZONTAL' ? 'flex-row' : 'flex-col'
  const gap =
    layout.itemSpacing != null && layout.itemSpacing <= 8
      ? 'gap-2'
      : layout.itemSpacing != null && layout.itemSpacing <= 16
        ? 'gap-4'
        : 'gap-4'
  return `flex ${dir} ${gap} p-4`
}

/** Escape for JSX text content (no raw < or >). */
function escapeForJsxText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Recursively collect all component IDs used under a node (by componentId).
 */
function collectComponentIds(node: FigmaNode, out: Set<string>): void {
  if (node.componentId) out.add(node.componentId)
  for (const child of node.children ?? []) collectComponentIds(child, out)
}

/**
 * Build import lines for a set of figma component IDs using the map.
 */
function buildImports(componentIds: Set<string>, componentMap: FigmaComponentMap): string[] {
  const lines: string[] = []
  const basePaths = new Map<string, string[]>()
  const sharedImports = new Map<string, string>()

  for (const id of componentIds) {
    const entry = componentMap[id]
    if (!entry) continue
    if (entry.kind === 'base') {
      const info = BASE_IMPORTS[entry.baseId]
      if (info) basePaths.set(info.path, info.names)
    } else {
      const importPath = '@/' + entry.file.replace(/\.tsx?$/, '')
      if (!sharedImports.has(importPath)) sharedImports.set(importPath, entry.name)
    }
  }

  for (const [path, names] of basePaths) {
    lines.push(`import { ${names.join(', ')} } from '${path}'`)
  }
  for (const [path, name] of sharedImports) {
    lines.push(`import { ${name} } from '${path}'`)
  }
  return lines.sort()
}

/**
 * Render a single node to JSX string (indented). Uses component map for instances.
 */
function nodeToJsx(node: FigmaNode, componentMap: FigmaComponentMap, indent: string): string {
  const nextIndent = indent + '  '
  const entry = node.componentId ? componentMap[node.componentId] : null

  if (entry?.kind === 'base') {
    const baseId = entry.baseId
    const label = node.name || ''
    if (baseId === 'button') return `${indent}<Button>${escapeForJsxText(node.name || 'Button')}</Button>`
    if (baseId === 'input') return `${indent}<Input placeholder={${JSON.stringify(label)}} />`
    if (baseId === 'textarea') return `${indent}<Textarea placeholder={${JSON.stringify(label)}} />`
    if (baseId === 'badge') return `${indent}<Badge>${escapeForJsxText(node.name || '')}</Badge>`
    if (baseId === 'label') return `${indent}<Label>${escapeForJsxText(node.name || '')}</Label>`
    if (baseId === 'card') {
      const childrenJsx = (node.children ?? []).map(c => nodeToJsx(c, componentMap, nextIndent)).join('\n')
      return `${indent}<Card>\n${childrenJsx || nextIndent + '<CardContent><p>Card</p></CardContent>'}\n${indent}</Card>`
    }
    const pascal = entry.baseId.charAt(0).toUpperCase() + entry.baseId.slice(1)
    return `${indent}<${pascal}>${escapeForJsxText(node.name || '')}</${pascal}>`
  }

  if (entry?.kind === 'shared') {
    return `${indent}<${entry.name} />`
  }

  const children = node.children ?? []
  const layout =
    node.layoutMode && node.layoutMode !== 'NONE'
      ? node.layoutMode === 'HORIZONTAL'
        ? 'flex flex-row gap-2'
        : 'flex flex-col gap-2'
      : ''
  const className = layout ? ` className="${layout}"` : ''

  if (node.type === 'TEXT' || node.characters) {
    const text = (node.characters ?? node.name ?? '').trim()
    if (text) return `${indent}<p className="text-sm">${escapeForJsxText(text)}</p>`
    return `${indent}<span />`
  }

  if (children.length === 0) {
    return `${indent}<div${className}>${escapeForJsxText(node.name || '')}</div>`
  }

  const childJsx = children.map(c => nodeToJsx(c, componentMap, nextIndent)).join('\n')
  return `${indent}<div${className}>\n${childJsx}\n${indent}</div>`
}

/**
 * Generate full page.tsx content for one Figma frame.
 */
export function generatePageFromFrame(
  page: FigmaPageData,
  componentMap: FigmaComponentMap,
  options?: { pageTitle?: string },
): string {
  const componentIds = new Set<string>()
  for (const child of page.children ?? []) collectComponentIds(child, componentIds)
  const importLines = buildImports(componentIds, componentMap)
  const containerClass = layoutToClassName(page.layout)
  const pageName = page.name.trim() || 'Page'
  const safePageName = pageName.replace(/[^A-Za-z0-9]/g, '') || 'Page'
  const title = options?.pageTitle ?? pageName

  const childrenJsx = (page.children ?? []).map(n => nodeToJsx(n, componentMap, '      ')).join('\n')

  const imports =
    importLines.length > 0
      ? `import { Metadata } from 'next'\n${importLines.join('\n')}\n\n`
      : `import { Metadata } from 'next'\n\n`

  return `${imports}export const metadata: Metadata = {
  title: ${JSON.stringify(title)},
  description: 'Generated from Figma',
}

export default function ${safePageName}Page() {
  return (
    <main className="${containerClass}">
${childrenJsx || '      <p className="text-muted-foreground">Content</p>'}
    </main>
  )
}
`
}

/**
 * Generate all pages from Figma intermediate data and component map.
 */
export function generatePagesFromFigma(
  pages: FigmaPageData[],
  componentMap: FigmaComponentMap,
  options?: { pageTitle?: (page: FigmaPageData) => string },
): GeneratedPage[] {
  return pages.map(page => ({
    route: page.route,
    filePath: getPageFilePath(page.route),
    content: generatePageFromFrame(page, componentMap, {
      pageTitle: options?.pageTitle?.(page),
    }),
  }))
}
