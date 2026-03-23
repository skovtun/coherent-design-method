/**
 * Sync Command
 *
 * Scans the actual codebase and updates the Design System to match reality:
 * 1. Token extraction from globals.css (CSS variables)
 * 2. Component detection in components/ (registers as shared CID-XXX)
 * 3. Style pattern extraction (saves to config for future AI context)
 * 4. Page analysis sync (metadata, sections, component usage)
 * 5. Regeneration of DS viewer, .cursorrules, CLAUDE.md
 */

import chalk from 'chalk'
import ora from 'ora'
import { existsSync, readFileSync } from 'fs'
import { join, relative, dirname } from 'path'
import { readdir, readFile } from 'fs/promises'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { DesignSystemManager } from '@getcoherent/core'
import type { SharedComponentType } from '@getcoherent/core'
import { analyzePageCode } from '../utils/page-analyzer.js'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { writeCursorRules } from '../utils/cursor-rules.js'
import { generateClaudeCodeFiles } from '../utils/claude-code.js'
import { loadManifest, saveManifest, findSharedComponent } from '@getcoherent/core'
import { reconcileComponents } from '../utils/component-integrity.js'

export interface SyncOptions {
  dryRun?: boolean
  tokens?: boolean
  components?: boolean
  patterns?: boolean
}

interface DiscoveredPage {
  filePath: string
  route: string
  code: string
  name: string
}

interface DetectedComponent {
  name: string
  file: string
  type: SharedComponentType
  usedInPages: string[]
  isNew: boolean
}

// ── Phase 1: Token Extraction ─────────────────────────────────────

interface ExtractedTokens {
  colors: {
    light: Record<string, string>
    dark: Record<string, string>
  }
  radius?: string
  defaultMode: 'light' | 'dark'
}

function extractTokensFromProject(projectRoot: string): ExtractedTokens | null {
  const lightColors: Record<string, string> = {}
  const darkColors: Record<string, string> = {}

  // Source 1: globals.css
  const globalsPath = join(projectRoot, 'app', 'globals.css')
  if (existsSync(globalsPath)) {
    const css = readFileSync(globalsPath, 'utf-8')
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/s)
    if (rootMatch) parseVarsInto(rootMatch[1], lightColors)
    const darkMatch = css.match(/\.dark\s*\{([^}]+)\}/s)
    if (darkMatch) parseVarsInto(darkMatch[1], darkColors)
  }

  // Source 2: inline <style> in layout.tsx (some projects inline tokens here)
  const layoutPath = join(projectRoot, 'app', 'layout.tsx')
  let layoutCode = ''
  if (existsSync(layoutPath)) {
    layoutCode = readFileSync(layoutPath, 'utf-8')
    // Match :root { ... } and .dark { ... } inside dangerouslySetInnerHTML or inline style
    const rootInline = layoutCode.match(/:root\s*\{([^}]+)\}/s)
    if (rootInline && Object.keys(lightColors).length === 0) {
      parseVarsInto(rootInline[1], lightColors)
    }
    const darkInline = layoutCode.match(/\.dark\s*\{([^}]+)\}/s)
    if (darkInline && Object.keys(darkColors).length === 0) {
      parseVarsInto(darkInline[1], darkColors)
    }
  }

  if (Object.keys(lightColors).length === 0 && Object.keys(darkColors).length === 0) {
    return null
  }

  // Detect default mode
  let defaultMode: 'light' | 'dark' = 'light'
  if (/className="[^"]*dark[^"]*"/.test(layoutCode)) {
    defaultMode = 'dark'
  }

  // Extract radius
  let radius: string | undefined
  const allCss = [existsSync(globalsPath) ? readFileSync(globalsPath, 'utf-8') : '', layoutCode].join('\n')
  const radiusMatch = allCss.match(/--radius:\s*([^;]+);/)
  if (radiusMatch) radius = radiusMatch[1].trim()

  return {
    colors: { light: lightColors, dark: darkColors },
    radius,
    defaultMode,
  }
}

function parseVarsInto(block: string, target: Record<string, string>): void {
  const varRe = /--(\w[\w-]*):\s*([^;]+);/g
  let m
  while ((m = varRe.exec(block)) !== null) {
    const name = m[1].trim()
    let value = m[2].trim()
    // Convert HSL values to hex-ish representation for display
    if (/^\d+\s+\d+%?\s+\d+%?$/.test(value)) {
      value = `hsl(${value.replace(/\s+/g, ', ')})`
    }
    target[name] = value
  }
}

// ── Phase 2: Component Detection ─────────────────────────────────

async function detectCustomComponents(projectRoot: string, allPageCode: string): Promise<DetectedComponent[]> {
  const results: DetectedComponent[] = []
  const componentsDir = join(projectRoot, 'components')
  if (!existsSync(componentsDir)) return results

  const files: string[] = []
  await walkForTsx(componentsDir, files, ['ui'])

  const fileResults = await Promise.all(
    files.map(async filePath => {
      const code = await readFile(filePath, 'utf-8')
      const relFile = relative(projectRoot, filePath)
      const exportedNames = extractExportedComponentNames(code)
      return exportedNames.map(name => ({
        name,
        file: relFile,
        type: inferComponentType(name, code),
        usedInPages: findPagesUsingComponent(allPageCode, name),
        isNew: true as const,
      }))
    }),
  )

  return fileResults.flat()
}

async function walkForTsx(dir: string, files: string[], skipDirs: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (skipDirs.includes(e.name) || e.name.startsWith('.')) continue
      await walkForTsx(full, files, skipDirs)
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.jsx')) {
      files.push(full)
    }
  }
}

function extractExportedComponentNames(code: string): string[] {
  const names: string[] = []
  // export function ComponentName
  const funcRe = /export\s+(?:default\s+)?function\s+([A-Z]\w+)/g
  let m
  while ((m = funcRe.exec(code)) !== null) names.push(m[1])
  // export const ComponentName
  const constRe = /export\s+const\s+([A-Z]\w+)\s*[=:]/g
  while ((m = constRe.exec(code)) !== null) names.push(m[1])
  return [...new Set(names)]
}

function inferComponentType(name: string, _code: string): 'layout' | 'section' | 'widget' {
  const lower = name.toLowerCase()
  if (/header|footer|sidebar|nav|layout|appbar|topbar/.test(lower)) return 'layout'
  if (/section|hero|pricing|testimonial|features|cta|banner/.test(lower)) return 'section'
  return 'widget'
}

function findPagesUsingComponent(allPageCode: string, name: string): string[] {
  const re = new RegExp(`<${name}[\\s/>]`)
  return re.test(allPageCode) ? ['used'] : []
}

// ── Phase 3: Style Pattern Extraction ────────────────────────────

interface StylePatterns {
  card?: string
  section?: string
  terminal?: string
  iconContainer?: string
  heroHeadline?: string
  sectionTitle?: string
  hoverPatterns?: string[]
}

function extractStylePatterns(allCode: string): StylePatterns {
  const patterns: StylePatterns = {}

  // Card styling: most common className containing rounded + border + bg-card
  const cardClasses = findMostCommonPattern(allCode, /className="([^"]*(?:rounded)[^"]*(?:border|bg-card)[^"]*)"/g)
  if (cardClasses) patterns.card = cardClasses

  // Section spacing
  const sectionSpacing = findMostCommonPattern(allCode, /className="[^"]*(py-\d+\s+(?:md|lg):py-\d+)[^"]*"/g)
  if (sectionSpacing) patterns.section = sectionSpacing

  // Terminal blocks
  const termClasses = findMostCommonPattern(
    allCode,
    /className="([^"]*(?:bg-zinc-950|font-mono)[^"]*(?:font-mono|bg-zinc-950)[^"]*)"/g,
  )
  if (termClasses) patterns.terminal = termClasses

  // Icon containers
  const iconClasses = findMostCommonPattern(allCode, /className="([^"]*bg-primary\/\d+[^"]*rounded[^"]*)"/g)
  if (iconClasses) patterns.iconContainer = iconClasses

  // Hero headline: largest text-Nxl with font-bold
  const heroRe = /className="[^"]*(text-(?:5|6|7)xl[^"]*font-bold[^"]*tracking[^"]*)"/g
  const heroMatch = heroRe.exec(allCode)
  if (heroMatch) patterns.heroHeadline = heroMatch[1].trim()

  // Section title
  const titleRe = /className="[^"]*(text-(?:2|3)xl[^"]*font-(?:bold|semibold)[^"]*)"/g
  const titleMatch = titleRe.exec(allCode)
  if (titleMatch) patterns.sectionTitle = titleMatch[1].trim()

  // Hover patterns
  const hoverSet = new Set<string>()
  const hoverRe = /(hover:\S+)/g
  let hm
  while ((hm = hoverRe.exec(allCode)) !== null) hoverSet.add(hm[1])
  if (hoverSet.size > 0) patterns.hoverPatterns = [...hoverSet].sort()

  return patterns
}

function findMostCommonPattern(code: string, re: RegExp): string | undefined {
  const counts = new Map<string, number>()
  let m
  while ((m = re.exec(code)) !== null) {
    const val = m[1].trim()
    counts.set(val, (counts.get(val) || 0) + 1)
  }
  if (counts.size === 0) return undefined
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

// ── Page Discovery ───────────────────────────────────────────────

async function discoverPages(appDir: string): Promise<DiscoveredPage[]> {
  const pages: DiscoveredPage[] = []

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['design-system', 'api', '_not-found'].includes(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(full)
      } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx') {
        const code = await readFile(full, 'utf-8')
        const routeDir = dirname(relative(appDir, full))
        let route = routeDir === '.' ? '/' : '/' + routeDir
        route = route.replace(/\/\([^)]+\)/g, '')
        if (!route.startsWith('/')) route = '/' + route
        pages.push({ filePath: full, route, code, name: inferPageName(route, code) })
      }
    }
  }

  await walk(appDir)
  return pages
}

function inferPageName(route: string, code: string): string {
  const funcMatch = code.match(/export\s+(?:default\s+)?function\s+(\w+)/)
  if (funcMatch) {
    const name = funcMatch[1].replace(/Page$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
    if (name && name !== 'default') return name
  }
  const titleMatch = code.match(/title:\s*['"]([^'"]+)['"]/)
  if (titleMatch) return titleMatch[1].split(/[|–—-]/).map(s => s.trim())[0] || 'Untitled'
  if (route === '/') return 'Home'
  return route
    .replace(/^\//, '')
    .replace(/[-/]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── Actual Token Usage (from classNames) ─────────────────────────

function extractActualTokenUsage(allCode: string) {
  const classNames = allCode.match(/className="([^"]+)"/g) || []
  const allClasses = classNames.map(m => m.replace(/className="|"/g, '')).join(' ')

  const colorSet = new Set<string>()
  const typographySet = new Set<string>()
  const radiusSet = new Set<string>()

  for (const cls of allClasses.split(/\s+/)) {
    const base = cls.replace(/^(hover:|focus:|active:|md:|lg:|sm:|dark:)+/, '')
    if (
      /^(text|bg|border|ring|from|to|via)-(primary|secondary|muted|destructive|accent|card|popover|foreground|background)/.test(
        base,
      )
    )
      colorSet.add(base)
    else if (
      /^(text|bg|border)-(zinc|gray|slate|emerald|red|blue|green|amber|purple|orange|rose|indigo|cyan|yellow|white|black)/.test(
        base,
      )
    )
      colorSet.add(base)
    if (
      /^(text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)|font-(thin|light|normal|medium|semibold|bold|extrabold)|tracking-|leading-)/.test(
        base,
      )
    )
      typographySet.add(base)
    if (/^rounded/.test(base)) radiusSet.add(base)
  }

  return {
    colors: [...colorSet].sort(),
    typography: [...typographySet].sort(),
    borderRadius: [...radiusSet].sort(),
  }
}

// ── Repeating Patterns ───────────────────────────────────────────

function extractReusablePatterns(code: string) {
  const classMatches = code.match(/className="([^"]{20,})"/g) || []
  const classCounts = new Map<string, number>()
  for (const m of classMatches) {
    const val = m.replace(/className="|"/g, '')
    classCounts.set(val, (classCounts.get(val) || 0) + 1)
  }
  return [...classCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([pattern, count]) => ({ pattern, count, sample: pattern.slice(0, 80) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

function mergeReusablePatternsToStylePatterns(
  patterns: { pattern: string; count: number }[],
  existing: StylePatterns,
): StylePatterns {
  const result = { ...existing }
  for (const p of patterns) {
    if (p.pattern.includes('rounded') && p.pattern.includes('border') && !result.card) {
      result.card = p.pattern
    }
    if (p.pattern.includes('py-') && p.pattern.includes('px-') && !result.section) {
      result.section = p.pattern
    }
  }
  return result
}

// ── Main Command ─────────────────────────────────────────────────

export async function syncCommand(options: SyncOptions = {}) {
  const project = findConfig()
  if (!project) return exitNotCoherent()

  const dryRun = options.dryRun === true
  const runAll = !options.tokens && !options.components && !options.patterns
  const doTokens = runAll || options.tokens === true
  const doComponents = runAll || options.components === true
  const doPatterns = runAll || options.patterns === true

  if (dryRun) console.log(chalk.yellow('  [dry-run] No files will be written\n'))

  const spinner = ora('Scanning project files...').start()

  try {
    const appDir = join(project.root, 'app')
    if (!existsSync(appDir)) {
      spinner.fail('No app/ directory found')
      process.exit(1)
    }

    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    const config = dsm.getConfig() as any

    // ── Discover pages ───────────────────────────────────────
    const discoveredPages = await discoverPages(appDir)
    const allPageCode = discoveredPages.map(p => p.code).join('\n')
    spinner.succeed(`Found ${discoveredPages.length} page(s) on disk`)

    // ── Phase 1: Token Extraction ────────────────────────────
    let extractedTokens: ExtractedTokens | null = null
    if (doTokens) {
      spinner.start('Extracting design tokens...')
      extractedTokens = extractTokensFromProject(project.root)
      if (extractedTokens) {
        const lightCount = Object.keys(extractedTokens.colors.light).length
        const darkCount = Object.keys(extractedTokens.colors.dark).length
        if (!dryRun) {
          // Merge extracted CSS var colors into config tokens
          if (lightCount > 0 && config.tokens?.colors?.light) {
            for (const [key, val] of Object.entries(extractedTokens.colors.light)) {
              const tokenKey = key.replace(/-/g, '')
              if (config.tokens.colors.light[tokenKey] === undefined) {
                config.tokens.colors.light[tokenKey] = val
              }
            }
          }
          if (darkCount > 0 && config.tokens?.colors?.dark) {
            for (const [key, val] of Object.entries(extractedTokens.colors.dark)) {
              const tokenKey = key.replace(/-/g, '')
              if (config.tokens.colors.dark[tokenKey] === undefined) {
                config.tokens.colors.dark[tokenKey] = val
              }
            }
          }
        }
        spinner.succeed(`Extracted ${lightCount} light + ${darkCount} dark CSS variables`)
      } else {
        spinner.succeed('No CSS variables found — skipping token extraction')
      }
    }

    // ── Phase 2: Component Reconciliation ──────────────────────
    let detectedComponents: DetectedComponent[] = []
    let reconcileResult: import('../utils/component-integrity.js').ReconcileResult | null = null
    if (doComponents) {
      spinner.start('Reconciling shared components...')
      const manifest = await loadManifest(project.root)
      const { manifest: reconciledManifest, result: rr } = reconcileComponents(project.root, manifest)
      reconcileResult = rr

      if (!dryRun) {
        await saveManifest(project.root, reconciledManifest)
      }

      detectedComponents = await detectCustomComponents(project.root, allPageCode)
      for (const comp of detectedComponents) {
        const existing = findSharedComponent(reconciledManifest, comp.name)
        if (existing) comp.isNew = false
      }

      const parts: string[] = []
      if (rr.removed.length) parts.push(`${rr.removed.length} orphaned removed`)
      if (rr.added.length) parts.push(`${rr.added.length} new registered`)
      if (rr.updated.length) parts.push(`${rr.updated.length} field(s) updated`)
      if (rr.warnings.length) parts.push(`${rr.warnings.length} warning(s)`)
      spinner.succeed(`Components reconciled: ${parts.join(', ') || 'all clean'}`)
    }

    // ── Phase 3: Style Patterns ──────────────────────────────
    let stylePatterns: StylePatterns = {}
    if (doPatterns) {
      spinner.start('Extracting style patterns...')
      stylePatterns = extractStylePatterns(allPageCode)
      const patternCount = Object.keys(stylePatterns).filter(k => (stylePatterns as any)[k]).length
      if (!dryRun && patternCount > 0) {
        config.stylePatterns = stylePatterns
      }
      spinner.succeed(`Extracted ${patternCount} style pattern(s)`)
    }

    // ── Phase 4: Page Analysis ───────────────────────────────
    spinner.start('Analyzing pages...')
    let updated = 0,
      added = 0
    for (const page of discoveredPages) {
      const analysis = analyzePageCode(page.code)
      const existingIdx = config.pages.findIndex(
        (p: any) => p.route === page.route || (p.id === 'home' && page.route === '/'),
      )
      if (existingIdx !== -1) {
        if (!dryRun) {
          config.pages[existingIdx].pageAnalysis = analysis
          config.pages[existingIdx].name = config.pages[existingIdx].name || page.name
          config.pages[existingIdx].updatedAt = new Date().toISOString()
        }
        updated++
      } else {
        if (!dryRun) {
          const id = page.route === '/' ? 'home' : page.route.replace(/^\//, '').replace(/\//g, '-')
          config.pages.push({
            id,
            name: page.name,
            route: page.route,
            layout: analysis.layoutPattern || 'centered',
            sections: (analysis.sections || []).map((s: any) => ({ name: s.name })),
            generatedWithPageCode: true,
            pageAnalysis: analysis,
            title: page.name,
            description: `${page.name} page`,
            requiresAuth: false,
            noIndex: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
        added++
      }
    }

    // Remove stale pages
    const discoveredRoutes = new Set(discoveredPages.map(p => p.route))
    const beforeCount = config.pages.length
    if (!dryRun) {
      config.pages = config.pages.filter((p: any) => discoveredRoutes.has(p.route || '/'))
    }
    const removed = beforeCount - config.pages.length

    // Update component usedInPages
    if (!dryRun) {
      for (const comp of config.components || []) {
        comp.usedInPages = discoveredPages.filter(p => p.code.includes(`<${comp.name}`)).map(p => p.route)
      }
    }

    spinner.succeed(
      `Analyzed ${discoveredPages.length} page(s): ${updated} updated, ${added} added, ${removed} removed`,
    )

    // ── Phase 5: Save & Regenerate ───────────────────────────
    if (!dryRun) {
      spinner.start('Saving configuration...')
      config.updatedAt = new Date().toISOString()
      dsm.updateConfig(config)
      await dsm.save()
      spinner.succeed('Configuration saved')

      spinner.start('Regenerating Design System viewer...')
      const written = await writeDesignSystemFiles(project.root, config)
      spinner.succeed(`Regenerated ${written.length} Design System file(s)`)

      spinner.start('Updating AI context files...')
      await writeCursorRules(project.root)
      await generateClaudeCodeFiles(project.root)
      spinner.succeed('Updated .cursorrules and CLAUDE.md')
    }

    // ── Summary ──────────────────────────────────────────────
    console.log('')
    console.log(chalk.green(`✅ Design System ${dryRun ? 'analyzed' : 'synced'} with actual code\n`))

    // Pages
    console.log(chalk.blue('📄 Pages:'))
    for (const page of discoveredPages) {
      const a = analyzePageCode(page.code)
      const comps = Object.entries(a.componentUsage || {})
        .filter(([, c]) => c > 0)
        .map(([n]) => n)
      console.log(chalk.gray(`   ${page.route} — ${page.name}`))
      if (comps.length > 0) console.log(chalk.gray(`     Components: ${comps.join(', ')}`))
      if (a.sections?.length) console.log(chalk.gray(`     Sections: ${a.sections.map(s => s.name).join(', ')}`))
    }

    // Tokens
    if (doTokens && extractedTokens) {
      console.log('')
      console.log(chalk.blue('🎨 Design Tokens (from globals.css):'))
      const lc = Object.keys(extractedTokens.colors.light).length
      const dc = Object.keys(extractedTokens.colors.dark).length
      console.log(chalk.gray(`   Light: ${lc} variables | Dark: ${dc} variables`))
      console.log(chalk.gray(`   Default mode: ${extractedTokens.defaultMode}`))
      if (extractedTokens.radius) console.log(chalk.gray(`   Border radius: ${extractedTokens.radius}`))
    }

    // Components reconciliation
    if (doComponents && reconcileResult) {
      console.log('')
      console.log(chalk.blue('🧩 Shared Components:'))
      for (const r of reconcileResult.removed) {
        console.log(chalk.red(`   🗑 Removed ${r.id} (${r.name}) — ${r.reason}`))
      }
      for (const u of reconcileResult.updated) {
        console.log(chalk.cyan(`   📝 Updated ${u.id} ${u.field}: ${u.from} → ${u.to}`))
      }
      for (const a of reconcileResult.added) {
        console.log(chalk.green(`   ✨ Added ${a.id} (${a.name}) — ${a.file} (${a.type})`))
      }
      for (const w of reconcileResult.warnings) {
        console.log(chalk.yellow(`   ⚠ ${w.message}`))
        console.log(chalk.dim(`     ${w.suggestion}`))
      }
      if (
        reconcileResult.removed.length === 0 &&
        reconcileResult.updated.length === 0 &&
        reconcileResult.added.length === 0 &&
        reconcileResult.warnings.length === 0
      ) {
        console.log(chalk.gray('   All components consistent ✓'))
      }
    }

    // Style patterns
    if (doPatterns && Object.keys(stylePatterns).length > 0) {
      console.log('')
      console.log(chalk.blue('📐 Style Patterns:'))
      if (stylePatterns.card) console.log(chalk.gray(`   Cards: ${stylePatterns.card.slice(0, 80)}`))
      if (stylePatterns.section) console.log(chalk.gray(`   Sections: ${stylePatterns.section}`))
      if (stylePatterns.terminal) console.log(chalk.gray(`   Terminal: ${stylePatterns.terminal.slice(0, 80)}`))
      if (stylePatterns.iconContainer) console.log(chalk.gray(`   Icons: ${stylePatterns.iconContainer.slice(0, 80)}`))
      if (stylePatterns.heroHeadline)
        console.log(chalk.gray(`   Hero headline: ${stylePatterns.heroHeadline.slice(0, 80)}`))
      if (stylePatterns.sectionTitle)
        console.log(chalk.gray(`   Section title: ${stylePatterns.sectionTitle.slice(0, 80)}`))
    }

    // Token usage from classNames
    const tokenUsage = extractActualTokenUsage(allPageCode)
    if (tokenUsage.colors.length > 0) {
      console.log('')
      console.log(chalk.blue('🏷️  Actual token usage (from classNames):'))
      console.log(
        chalk.gray(
          `   Colors: ${tokenUsage.colors.slice(0, 12).join(', ')}${tokenUsage.colors.length > 12 ? ` (+${tokenUsage.colors.length - 12})` : ''}`,
        ),
      )
      console.log(
        chalk.gray(
          `   Typography: ${tokenUsage.typography.slice(0, 8).join(', ')}${tokenUsage.typography.length > 8 ? ` (+${tokenUsage.typography.length - 8})` : ''}`,
        ),
      )
      console.log(chalk.gray(`   Radius: ${tokenUsage.borderRadius.join(', ')}`))
    }

    // Reusable patterns
    const reusable = extractReusablePatterns(allPageCode)
    if (reusable.length > 0) {
      if (!dryRun) {
        config.stylePatterns = mergeReusablePatternsToStylePatterns(reusable, config.stylePatterns || {})
      }
      console.log('')
      console.log(chalk.blue(`🔁 Repeating patterns (${reusable.length} — potential reusable components):`))
      for (const p of reusable.slice(0, 5)) {
        console.log(chalk.gray(`   ×${p.count}: ${p.sample}${p.sample.length < p.pattern.length ? '...' : ''}`))
      }
    }

    console.log('')
    if (!dryRun) {
      console.log(chalk.cyan('   Open /design-system in the app to see the updated view.'))
    }
    console.log('')
  } catch (err) {
    spinner.fail('Sync failed')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
