/**
 * Fix globals.css
 *
 * For Tailwind v3: writes minimal globals.css (no :root/.dark) and injects design tokens
 * into layout to avoid Next.js build SyntaxError 51:12 in CSS pipeline.
 * For Tailwind v4: writes v4-compatible CSS with @import "tailwindcss" and @theme inline.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { buildCssVariables } from '@getcoherent/core'
import { isTailwindV4, generateV4GlobalsCss } from './tailwind-version.js'

/**
 * Check if globals.css needs fixing.
 * v3: old format with :root/.dark causes Next.js CSS pipeline bug.
 * v4: needs @import "tailwindcss" and @theme inline for color utilities.
 */
export function needsGlobalsFix(projectRoot: string): boolean {
  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  if (!existsSync(globalsPath)) {
    return false
  }
  const content = readFileSync(globalsPath, 'utf-8')

  if (isTailwindV4(projectRoot)) {
    // v4: fix if missing @theme inline (color utilities won't work without it)
    if (!content.includes('@theme inline')) return true
    // v4: fix if still using v3 directives
    if (content.includes('@tailwind base')) return true
    // v4: fix if missing --color-transparent (border-transparent won't work without it)
    if (!content.includes('--color-transparent')) return true
    return false
  }

  // v3: fix if using old format with :root/.dark in globals (triggers CSS pipeline bug)
  if (content.includes(':root {') || content.includes('.dark {')) return true
  if (content.includes('@apply')) return true
  if (!content.includes('@tailwind base') || content.length < 100) return true
  return false
}

/**
 * Fix globals.css based on detected Tailwind version.
 */
export function fixGlobalsCss(projectRoot: string, config: Parameters<typeof buildCssVariables>[0]): void {
  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
  if (!existsSync(globalsPath)) {
    return
  }

  if (isTailwindV4(projectRoot)) {
    const v4Css = generateV4GlobalsCss(config)
    writeFileSync(globalsPath, v4Css, 'utf-8')
    return
  }

  // v3 path: minimal globals.css + inject CSS variables into layout
  const minimalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
}
`
  writeFileSync(globalsPath, minimalCss, 'utf-8')

  if (!existsSync(layoutPath)) {
    return
  }
  let layoutContent = readFileSync(layoutPath, 'utf-8')
  if (layoutContent.includes('dangerouslySetInnerHTML')) {
    return
  }
  const cssVars = buildCssVariables(config)
  const headBlock = `<head>
        <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(cssVars)} }} />
      </head>`
  layoutContent = layoutContent.replace('<html lang="en">', '<html lang="en">\n      ' + headBlock)
  writeFileSync(layoutPath, layoutContent, 'utf-8')
}
