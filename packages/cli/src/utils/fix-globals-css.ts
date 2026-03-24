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
    if (!content.includes('@theme inline')) return true
    if (content.includes('@tailwind base')) return true
    const REQUIRED_V4_TOKENS = [
      '--color-transparent',
      '--color-sidebar-background',
      '--color-chart-1',
      '--color-black',
      '--color-white',
      '--radius-xs',
    ]
    for (const token of REQUIRED_V4_TOKENS) {
      if (!content.includes(token)) return true
    }
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
    if (existsSync(layoutPath)) {
      let layoutContent = readFileSync(layoutPath, 'utf-8')
      if (layoutContent.includes('dangerouslySetInnerHTML')) {
        const styleStart = layoutContent.indexOf('<style dangerouslySetInnerHTML')
        if (styleStart !== -1) {
          const styleEnd = layoutContent.indexOf('/>', styleStart)
          if (styleEnd !== -1) {
            const before = layoutContent.slice(0, styleStart).replace(/\s+$/, '')
            const after = layoutContent.slice(styleEnd + 2).replace(/^\s*\n/, '\n')
            layoutContent = before + after
          }
        }
        layoutContent = layoutContent.replace(/\s*<head>\s*<\/head>\s*/g, '\n')
        writeFileSync(layoutPath, layoutContent, 'utf-8')
      }
    }
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
    const cssVars = buildCssVariables(config)
    const marker = '__html: '
    const markerIdx = layoutContent.indexOf(marker)
    if (markerIdx !== -1) {
      const valueStart = markerIdx + marker.length
      const jsonStr = JSON.stringify(cssVars)
      const oldQuoteStart = layoutContent.indexOf('"', valueStart)
      if (oldQuoteStart !== -1) {
        let i = oldQuoteStart + 1
        while (i < layoutContent.length) {
          if (layoutContent[i] === '\\') {
            i += 2
            continue
          }
          if (layoutContent[i] === '"') break
          i++
        }
        layoutContent = layoutContent.slice(0, oldQuoteStart) + jsonStr + layoutContent.slice(i + 1)
      }
    }
    writeFileSync(layoutPath, layoutContent, 'utf-8')
    return
  }
  const cssVars = buildCssVariables(config)
  const headBlock = `<head>
        <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(cssVars)} }} />
      </head>`
  layoutContent = layoutContent.replace('<html lang="en">', '<html lang="en">\n      ' + headBlock)
  writeFileSync(layoutPath, layoutContent, 'utf-8')
}
