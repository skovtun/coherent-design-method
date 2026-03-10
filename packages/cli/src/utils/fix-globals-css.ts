/**
 * Fix globals.css
 * 
 * Writes minimal globals.css (no :root/.dark) and injects design tokens into layout
 * to avoid Next.js build SyntaxError 51:12 in CSS pipeline.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { buildCssVariables } from '@getcoherent/core'

/**
 * Check if globals.css needs fixing (old format with :root/.dark causes Next.js build SyntaxError 51:12)
 */
export function needsGlobalsFix(projectRoot: string): boolean {
  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  if (!existsSync(globalsPath)) {
    return false
  }
  const content = readFileSync(globalsPath, 'utf-8')
  // Fix if still using old format: :root/.dark in globals.css (triggers Next.js CSS pipeline bug)
  if (content.includes(':root {') || content.includes('.dark {')) {
    return true
  }
  if (content.includes('@apply')) {
    return true
  }
  if (!content.includes('@tailwind base') || content.length < 100) {
    return true
  }
  return false
}

/**
 * Fix globals.css: write minimal file (no :root/.dark) and inject design tokens into layout.tsx.
 * Avoids Next.js build SyntaxError 51:12 in CSS pipeline.
 */
export function fixGlobalsCss(
  projectRoot: string,
  config: Parameters<typeof buildCssVariables>[0]
): void {
  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
  if (!existsSync(globalsPath)) {
    return
  }

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
