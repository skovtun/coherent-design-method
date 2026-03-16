import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import chalk from 'chalk'
import { loadManifest, generateSharedComponent, integrateSharedLayoutIntoRootLayout } from '@getcoherent/core'
import { readFile, writeFile } from '../../utils/files.js'
import { ensureAuthRouteGroup } from '../../utils/auth-route-group.js'
import { extractBalancedTag, extractRelevantImports, extractStateHooks, addActiveNavToHeader } from './jsx-extractor.js'

function findAllPageFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== 'design-system') {
        results.push(...findAllPageFiles(full))
      } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx') {
        results.push(full)
      }
    }
  } catch { /* ignore permission errors */ }
  return results
}

export async function extractAndShareLayoutComponents(
  projectRoot: string,
  generatedPageFiles: string[],
): Promise<boolean> {
  const manifest = await loadManifest(projectRoot)
  const hasSharedHeader = manifest.shared.some(c => c.type === 'layout' && /header|nav/i.test(c.name))
  const hasSharedFooter = manifest.shared.some(c => c.type === 'layout' && /footer/i.test(c.name))
  if (hasSharedHeader && hasSharedFooter) return false

  let sourceCode = ''
  for (const file of generatedPageFiles) {
    try {
      const code = readFileSync(file, 'utf-8')
      if (code.includes('<header') || code.includes('<footer') || code.includes('<nav')) {
        sourceCode = code
        break
      }
    } catch {
      continue
    }
  }
  if (!sourceCode) return false

  let extracted = false

  if (!hasSharedHeader) {
    let headerJsx = extractBalancedTag(sourceCode, 'header')
    if (!headerJsx) headerJsx = extractBalancedTag(sourceCode, 'nav')
    if (headerJsx) {
      const imports = extractRelevantImports(sourceCode, headerJsx)
      const importBlock = imports.length > 0 ? imports.join('\n') + '\n' : "import Link from 'next/link'\n"
      const stateHooks = extractStateHooks(sourceCode, headerJsx)
      const needsReactImport = stateHooks.length > 0 && !importBlock.includes("from 'react'")
      const reactImport = needsReactImport ? "import { useState } from 'react'\n" : ''
      const stateBlock = stateHooks.length > 0 ? '  ' + stateHooks.join('\n  ') + '\n' : ''
      const returnIndent = stateBlock ? '  ' : '  '
      let headerComponent = `'use client'\n\n${reactImport}${importBlock}\nexport function Header() {\n${stateBlock}${returnIndent}return (\n    ${headerJsx}\n  )\n}\n`
      headerComponent = addActiveNavToHeader(headerComponent)
      await generateSharedComponent(projectRoot, {
        name: 'Header',
        type: 'layout',
        code: headerComponent,
        description: 'Main site header/navigation',
        usedIn: ['app/layout.tsx'],
      })
      extracted = true
    }
  }

  if (!hasSharedFooter) {
    const footerJsx = extractBalancedTag(sourceCode, 'footer')
    if (footerJsx) {
      const imports = extractRelevantImports(sourceCode, footerJsx)
      const importBlock = imports.length > 0 ? imports.join('\n') + '\n' : "import Link from 'next/link'\n"
      const stateHooks = extractStateHooks(sourceCode, footerJsx)
      const needsReactImport = stateHooks.length > 0 && !importBlock.includes("from 'react'")
      const reactImport = needsReactImport ? "import { useState } from 'react'\n" : ''
      const stateBlock = stateHooks.length > 0 ? '  ' + stateHooks.join('\n  ') + '\n' : ''
      const returnIndent = stateBlock ? '  ' : '  '
      const footerComponent = `'use client'\n\n${reactImport}${importBlock}\nexport function Footer() {\n${stateBlock}${returnIndent}return (\n    ${footerJsx}\n  )\n}\n`
      await generateSharedComponent(projectRoot, {
        name: 'Footer',
        type: 'layout',
        code: footerComponent,
        description: 'Site footer',
        usedIn: ['app/layout.tsx'],
      })
      extracted = true
    }
  }

  if (!extracted) return false

  await integrateSharedLayoutIntoRootLayout(projectRoot)
  await ensureAuthRouteGroup(projectRoot)

  const allPageFiles = new Set([
    ...generatedPageFiles,
    ...findAllPageFiles(resolve(projectRoot, 'app')),
  ])
  for (const file of allPageFiles) {
    try {
      let code = await readFile(file)
      const original = code
      const headerBlock = extractBalancedTag(code, 'header')
      if (headerBlock) {
        code = code.replace(headerBlock, '')
      } else {
        const navBlock = extractBalancedTag(code, 'nav')
        if (navBlock) code = code.replace(navBlock, '')
      }
      const footerBlock = extractBalancedTag(code, 'footer')
      if (footerBlock) code = code.replace(footerBlock, '')
      code = code.replace(/\n{3,}/g, '\n\n')
      if (code !== original) await writeFile(file, code)
    } catch {
      continue
    }
  }

  console.log(chalk.cyan('  🔗 Extracted Header and Footer as shared components (all pages via layout)'))
  return true
}
