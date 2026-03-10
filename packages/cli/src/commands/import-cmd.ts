/**
 * Import command (Story 3.8–3.12): Figma import pipeline.
 * Flow: fetch → parse → tokens → normalize components → pages → config → layout → DS viewer.
 */

import chalk from 'chalk'
import ora from 'ora'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { resolve, join, dirname } from 'path'
import { existsSync } from 'fs'
import {
  FigmaClient,
  parseFigmaFileResponse,
  extractTokensFromFigma,
  mergeExtractedColorsWithDefaults,
  buildCssVariables,
  EXAMPLE_MULTIPAGE_CONFIG,
  normalizeFigmaComponents,
  setSharedMapping,
  generateSharedComponent,
  generatePagesFromFigma,
  integrateSharedLayoutIntoRootLayout,
  DesignSystemManager,
  validateConfig,
  FRAMEWORK_VERSIONS,
  CLI_VERSION,
} from '@coherent/core'
import type { DesignSystemConfig, PageDefinition } from '@coherent/core'
import type { FigmaPageData } from '@coherent/core'
import { findConfig } from '../utils/find-config.js'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { writeCursorRules } from '../utils/cursor-rules.js'

const FIGMA_IMPORT_FILENAME = 'coherent.figma-import.json'
const FIGMA_COMPONENT_MAP_FILENAME = 'coherent.figma-component-map.json'
const GLOBALS_CSS_PATH = 'app/globals.css'
const DESIGN_SYSTEM_CONFIG_PATH = 'design-system.config.ts'

const MINIMAL_ROOT_LAYOUT = `import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'App',
  description: 'Generated from Figma import',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
`

/** Convert Figma page route to kebab id. */
function routeToId(route: string): string {
  const r = (route || '').trim()
  return r === '' ? 'home' : r.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'page'
}

/** Build PageDefinition[] from Figma pages. */
function figmaPagesToPageDefinitions(pages: FigmaPageData[]): PageDefinition[] {
  const now = new Date().toISOString()
  return pages.map((p, i) => ({
    id: routeToId(p.route),
    name: p.name?.trim() || p.route || 'Page',
    route: p.route === '' ? '/' : `/${p.route}`,
    layout: 'centered',
    sections: [],
    title: p.name?.trim() || (p.route === '' ? 'Home' : p.route),
    description: 'Generated from Figma',
    requiresAuth: false,
    createdAt: now,
    updatedAt: now,
  }))
}

/** Build full DesignSystemConfig from merged tokens + Figma pages. */
function buildFigmaImportConfig(
  mergedConfig: DesignSystemConfig,
  pages: PageDefinition[],
  fileName: string
): DesignSystemConfig {
  const now = new Date().toISOString()
  const navItems = pages.map((p, i) => ({
    label: p.name,
    route: p.route,
    requiresAuth: false,
    order: i,
  }))
  return validateConfig({
    ...mergedConfig,
    name: fileName?.trim() || 'Figma Import',
    description: 'Imported from Figma',
    coherentVersion: CLI_VERSION,
    frameworkVersions: {
      next: FRAMEWORK_VERSIONS.next,
      react: FRAMEWORK_VERSIONS.react,
      tailwind: FRAMEWORK_VERSIONS.tailwindcss,
    },
    pages,
    navigation: { enabled: true, type: 'header', items: navItems },
    layoutBlocks: [],
    createdAt: now,
    updatedAt: now,
  })
}

export function createImportCommand(): { command: string; description: string; subcommands: Array<{ name: string; description: string; action: (args: unknown, opts: unknown) => Promise<void> }> } {
  return {
    command: 'import',
    description: 'Import design from Figma (or other sources)',
    subcommands: [
      {
        name: 'figma',
        description: 'Import a Figma file (fetch structure, then extract tokens/components/pages)',
        action: importFigmaAction,
      },
    ],
  }
}

async function importFigmaAction(
  urlOrKey: string,
  opts: { token?: string; pages?: boolean; dryRun?: boolean }
): Promise<void> {
  if (typeof urlOrKey !== 'string' || !urlOrKey.trim()) {
    console.error(chalk.red('\n❌ Figma URL or file key is required.\n'))
    console.log(chalk.dim('  Usage: coherent import figma <url-or-key> --token <your-token>\n'))
    process.exit(1)
  }

  const token = opts.token ?? process.env.FIGMA_ACCESS_TOKEN ?? process.env.FIGMA_TOKEN
  if (!token || typeof token !== 'string') {
    console.error(chalk.red('\n❌ Figma token required.\n'))
    console.log(chalk.dim('  Use: coherent import figma <url-or-key> --token <your-token>'))
    console.log(chalk.dim('  Or set FIGMA_ACCESS_TOKEN or FIGMA_TOKEN in your environment.\n'))
    console.log(chalk.dim('  Get a token: Figma → Settings → Personal access tokens.\n'))
    process.exit(1)
  }

  const generatePages = opts.pages !== false
  const dryRun = Boolean(opts.dryRun)

  const fileKey = FigmaClient.extractFileKey(urlOrKey)
  if (!fileKey) {
    console.error(chalk.red('\n❌ Invalid Figma URL or file key.\n'))
    console.log(chalk.dim('  Use a URL like: https://www.figma.com/file/ABC123/MyDesign'))
    console.log(chalk.dim('  Or the file key: ABC123\n'))
    process.exit(1)
  }

  const project = findConfig()
  const projectRoot = project?.root ?? process.cwd()

  const spinner = ora()
  const client = new FigmaClient(token, { onProgress: (msg) => { spinner.text = msg } })

  const stats = {
    filesWritten: [] as string[],
    colorStyles: 0,
    textStyles: 0,
    componentsTotal: 0,
    baseCount: 0,
    sharedCount: 0,
    pagesGenerated: 0,
    configUpdated: false,
    layoutIntegrated: false,
    dsFilesWritten: 0,
  }

  const write = async (filePath: string, content: string): Promise<void> => {
    if (dryRun) {
      stats.filesWritten.push(filePath)
      return
    }
    const fullPath = join(projectRoot, filePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
    stats.filesWritten.push(filePath)
  }

  try {
    spinner.start('Fetching Figma file...')
    const raw = await client.fetchFile(fileKey)
    spinner.succeed('File fetched')

    spinner.start('Parsing structure...')
    const intermediate = parseFigmaFileResponse(raw, fileKey)
    spinner.succeed('Parsed')

    await write(FIGMA_IMPORT_FILENAME, JSON.stringify(intermediate, null, 2))

    spinner.start('Extracting design tokens...')
    const extracted = extractTokensFromFigma(intermediate)
    const mergedColors = mergeExtractedColorsWithDefaults(extracted)
    const mergedConfig = {
      ...EXAMPLE_MULTIPAGE_CONFIG,
      tokens: {
        ...EXAMPLE_MULTIPAGE_CONFIG.tokens,
        colors: mergedColors,
        typography: {
          ...EXAMPLE_MULTIPAGE_CONFIG.tokens.typography,
          ...extracted.typography,
        },
        radius: {
          ...EXAMPLE_MULTIPAGE_CONFIG.tokens.radius,
          ...extracted.radius,
        },
      },
    }
    stats.colorStyles = intermediate.colorStyles.length
    stats.textStyles = intermediate.textStyles.length

    const cssVars = buildCssVariables(mergedConfig)
    const fullGlobals =
      `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n@layer base {\n` +
      cssVars +
      `\n  * {\n    border-color: var(--border);\n  }\n\n  body {\n    background-color: var(--background);\n    color: var(--foreground);\n  }\n}\n`
    await write(GLOBALS_CSS_PATH, fullGlobals)
    spinner.succeed('Tokens extracted, globals.css written')

    spinner.start('Normalizing components...')
    const normResult = normalizeFigmaComponents(intermediate)
    stats.componentsTotal = intermediate.components.length

    for (const entry of normResult.entries) {
      if (entry.kind === 'base') stats.baseCount++
      else {
        stats.sharedCount++
        if (!dryRun) {
          const { id, name, file } = await generateSharedComponent(projectRoot, {
            name: entry.suggestedName,
            type: 'widget',
            code: entry.suggestedTsx,
            description: `From Figma: ${entry.figmaName}`,
          })
          setSharedMapping(normResult, entry.figmaId, id, name, file)
        }
      }
    }

    const componentMapObj: Record<string, { kind: 'base'; baseId: string } | { kind: 'shared'; cid: string; name: string; file: string }> = {}
    normResult.figmaToCoherent.forEach((v, k) => {
      componentMapObj[k] = v.kind === 'base' ? { kind: 'base', baseId: v.baseId } : { kind: 'shared', cid: v.cid, name: v.name, file: v.file }
    })
    if (dryRun) stats.filesWritten.push(FIGMA_COMPONENT_MAP_FILENAME)
    else await writeFile(resolve(projectRoot, FIGMA_COMPONENT_MAP_FILENAME), JSON.stringify(componentMapObj, null, 2), 'utf-8')
    spinner.succeed('Components normalized, shared components registered')

    let generatedPages: { route: string; filePath: string; content: string }[] = []
    if (generatePages) {
      spinner.start('Generating pages from frames...')
      generatedPages = generatePagesFromFigma(intermediate.pages, componentMapObj)
      if (!dryRun) {
        for (const page of generatedPages) {
          await write(page.filePath, page.content)
        }
      } else {
        generatedPages.forEach((p) => stats.filesWritten.push(p.filePath))
      }
      stats.pagesGenerated = generatedPages.length
      spinner.succeed(`Generated ${generatedPages.length} page(s)`)
    }

    const pageDefs = figmaPagesToPageDefinitions(intermediate.pages)
    const fullConfig = buildFigmaImportConfig(mergedConfig, pageDefs, intermediate.fileName)

    if (!dryRun) {
      spinner.start('Updating design-system.config.ts...')
      const configPath = resolve(projectRoot, DESIGN_SYSTEM_CONFIG_PATH)
      const dsm = new DesignSystemManager(configPath)
      if (existsSync(configPath)) {
        await dsm.load()
        const existing = dsm.getConfig()
        dsm.updateConfig({
          ...existing,
          tokens: fullConfig.tokens,
          pages: fullConfig.pages,
          navigation: fullConfig.navigation,
          name: fullConfig.name,
          description: fullConfig.description,
          updatedAt: fullConfig.updatedAt,
        })
        await dsm.save()
      } else {
        await writeFile(configPath, `/**
 * Design System Configuration
 * Generated by Coherent Figma import. Edit as needed.
 */
export const config = ${JSON.stringify(fullConfig, null, 2)} as const
`, 'utf-8')
        stats.filesWritten.push(DESIGN_SYSTEM_CONFIG_PATH)
      }
      stats.configUpdated = true
      spinner.succeed('design-system.config.ts updated')

      spinner.start('Ensuring root layout...')
      const layoutPath = join(projectRoot, 'app/layout.tsx')
      if (!existsSync(layoutPath)) {
        await mkdir(dirname(layoutPath), { recursive: true })
        await writeFile(layoutPath, MINIMAL_ROOT_LAYOUT, 'utf-8')
        stats.filesWritten.push('app/layout.tsx')
      }
      spinner.succeed('Root layout OK')

      spinner.start('Integrating shared layout (Header/Footer)...')
      const layoutIntegrated = await integrateSharedLayoutIntoRootLayout(projectRoot)
      stats.layoutIntegrated = layoutIntegrated
      spinner.succeed(layoutIntegrated ? 'Layout components wired' : 'No layout components to wire')

      spinner.start('Generating Design System viewer...')
      const dsFiles = await writeDesignSystemFiles(projectRoot, fullConfig)
      stats.dsFilesWritten = dsFiles.length
      spinner.succeed(`DS viewer: ${dsFiles.length} files`)
      try {
        await writeCursorRules(projectRoot)
      } catch (e) {
        if (process.env.COHERENT_DEBUG === '1') console.error(chalk.dim('Could not update .cursorrules:'), e)
      }
    } else {
      stats.filesWritten.push(DESIGN_SYSTEM_CONFIG_PATH)
      stats.configUpdated = true
    }

    printReport(stats, { dryRun, generatePages, fileName: intermediate.fileName })
  } catch (err) {
    spinner.fail('Import failed')
    const message = err instanceof Error ? err.message : String(err)
    console.error(chalk.red('\n❌ ' + message + '\n'))
    process.exit(1)
  }
}

function printReport(
  stats: {
    filesWritten: string[]
    colorStyles: number
    textStyles: number
    componentsTotal: number
    baseCount: number
    sharedCount: number
    pagesGenerated: number
    configUpdated: boolean
    layoutIntegrated: boolean
    dsFilesWritten: number
  },
  opts: { dryRun: boolean; generatePages: boolean; fileName: string }
): void {
  const { dryRun, generatePages, fileName } = opts
  console.log('')
  if (dryRun) {
    console.log(chalk.yellow('═══ Dry run (no files written) ═══'))
    console.log('')
  }
  console.log(chalk.green('✅ Figma import complete'))
  console.log('')
  console.log(chalk.cyan('  Statistics'))
  console.log(chalk.dim('  ───────────'))
  console.log(chalk.blue(`   File: ${fileName}`))
  console.log(chalk.blue(`   Color styles: ${stats.colorStyles}`))
  console.log(chalk.blue(`   Text styles: ${stats.textStyles}`))
  console.log(chalk.blue(`   Components: ${stats.componentsTotal} (${stats.baseCount} → base, ${stats.sharedCount} → shared)`))
  console.log(chalk.blue(`   Pages: ${stats.pagesGenerated}${!generatePages ? ' (skipped by --no-pages)' : ''}`))
  console.log(chalk.blue(`   design-system.config: ${stats.configUpdated ? 'updated' : '—'}`))
  console.log(chalk.blue(`   Layout (Header/Footer): ${stats.layoutIntegrated ? 'integrated' : '—'}`))
  console.log(chalk.blue(`   DS viewer files: ${stats.dsFilesWritten}`))
  console.log(chalk.blue(`   Total files ${dryRun ? 'that would be written' : 'written'}: ${stats.filesWritten.length}`))
  console.log('')
  if (stats.filesWritten.length > 0 && stats.filesWritten.length <= 30) {
    console.log(chalk.dim('  Files:'))
    stats.filesWritten.forEach((f) => console.log(chalk.dim(`    ${f}`)))
    console.log('')
  }
}
