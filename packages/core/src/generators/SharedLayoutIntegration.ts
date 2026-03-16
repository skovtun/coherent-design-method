/**
 * Shared Layout Integration (Epic 2, Story 2.3).
 * Updates app/layout.tsx to import and render layout-type shared components.
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { loadManifest } from '../managers/SharedComponentsRegistry.js'
import { toSharedFileName } from './SharedComponentGenerator.js'

const LAYOUT_PATH = 'app/layout.tsx'

/** Component name -> import path (e.g. Header -> @/components/shared/header) */
function getImportPath(name: string): string {
  const file = toSharedFileName(name)
  return `@/components/shared/${file}`
}

/** PascalCase for JSX (Header, Footer) */
function toPascalCase(name: string): string {
  return (
    name
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (_, c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '') || 'Block'
  )
}

/**
 * Ensure app/layout.tsx imports and renders layout-type shared components.
 * - Layout components whose name contains "footer" are rendered after the content wrapper.
 * - Others are rendered before (right after body open, before AppNav).
 *
 * NOTE: Call ensureAuthRouteGroup() after this to wrap Header/Footer
 * in ShowWhenNotAuthRoute (hides on /design-system/* and auth routes).
 */
export async function integrateSharedLayoutIntoRootLayout(projectRoot: string): Promise<boolean> {
  const manifest = await loadManifest(projectRoot)
  const layoutComponents = manifest.shared.filter(e => e.type === 'layout')
  if (layoutComponents.length === 0) return false

  const layoutPath = join(projectRoot, LAYOUT_PATH)
  let content: string
  try {
    content = await readFile(layoutPath, 'utf-8')
  } catch {
    return false
  }

  const headers: string[] = []
  const footers: string[] = []
  for (const entry of layoutComponents) {
    const pascal = toPascalCase(entry.name)
    if (content.includes(`<${pascal}`)) continue
    const isFooter = entry.name.toLowerCase().includes('footer')
    if (isFooter) footers.push(pascal)
    else headers.push(pascal)
  }
  if (headers.length === 0 && footers.length === 0) return false

  // Add imports after globals.css import
  const importLines = layoutComponents.map(e => `import { ${toPascalCase(e.name)} } from '${getImportPath(e.name)}'`)
  let result = content
  const globalsImport = "import './globals.css'"
  const globalsIdx = result.indexOf(globalsImport)
  if (globalsIdx !== -1) {
    const lineEnd = result.indexOf('\n', globalsIdx) + 1
    for (const line of importLines) {
      if (result.includes(line)) continue
      result = result.slice(0, lineEnd) + line + '\n' + result.slice(lineEnd)
    }
  }

  // Insert Header(s) right after <body ...> tag, before any existing content
  if (headers.length > 0) {
    const bodyOpen = result.indexOf('<body')
    if (bodyOpen === -1) return false
    const bodyTagEnd = result.indexOf('>', bodyOpen) + 1
    const headerJsx = headers.map(h => `        <${h} />`).join('\n')
    result = result.slice(0, bodyTagEnd) + '\n' + headerJsx + result.slice(bodyTagEnd)
  }

  // Insert Footer(s) right before </body> tag
  if (footers.length > 0) {
    const bodyCloseIdx = result.lastIndexOf('</body>')
    if (bodyCloseIdx !== -1) {
      const footerJsx = footers.map(f => `        <${f} />`).join('\n')
      result = result.slice(0, bodyCloseIdx) + footerJsx + '\n      ' + result.slice(bodyCloseIdx)
    }
  }

  if (result !== content) {
    await writeFile(layoutPath, result, 'utf-8')
    return true
  }
  return false
}
