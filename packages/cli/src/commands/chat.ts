/**
 * Chat Command
 * 
 * Conversational interface for modifying design system.
 * Parses natural language, applies modifications, and regenerates files.
 */

import chalk from 'chalk'
import ora from 'ora'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import {
  DesignSystemManager,
  ComponentManager,
  PageManager,
  ComponentGenerator,
  PageGenerator,
  TailwindConfigGenerator,
  CLI_VERSION,
  getTemplateForPageType,
  loadManifest,
  saveManifest,
  updateUsedIn,
  findSharedComponentByIdOrName,
  generateSharedComponent,
  integrateSharedLayoutIntoRootLayout,
  type DesignSystemConfig,
  type ModificationRequest,
  type ComponentDefinition,
  type PageDefinition,
  type TemplateOptions,
} from '@coherent/core'
import { parseModification } from '../agents/modifier.js'
import { isAuthRoute } from '../agents/page-templates.js'
import { ensureAuthRouteGroup } from '../utils/auth-route-group.js'
import { setDefaultDarkTheme, ensureThemeToggle } from '../utils/dark-mode.js'
import { createAIProvider } from '../utils/ai-provider.js'
import { readFile, writeFile, acquireProjectLock } from '../utils/files.js'
import { CORE_CONSTRAINTS, DESIGN_QUALITY, selectContextualRules } from '../agents/design-constraints.js'
import { appendFile } from 'fs/promises'
import { appendRecentChanges, type RecentChange } from '../utils/recent-changes.js'
import { needsGlobalsFix, fixGlobalsCss } from '../utils/fix-globals-css.js'
import { isShadcnComponent, installShadcnComponent } from '../utils/shadcn-installer.js'
import { validatePageQuality, formatIssues, autoFixCode } from '../utils/quality-validator.js'
import { writeCursorRules } from '../utils/cursor-rules.js'
import {
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
  fixEscapedClosingQuotes,
  fixUnescapedLtInJsx,
  findMissingPackagesInCode,
  installPackages,
  getInstalledPackages,
  extractNpmPackagesFromCode,
  COHERENT_REQUIRED_PACKAGES,
} from '../utils/self-heal.js'
import { analyzePageCode, summarizePageAnalysis } from '../utils/page-analyzer.js'

const DEBUG = process.env.COHERENT_DEBUG === '1'

// Note: getInstalledPackages is imported from self-heal.js (line 51).
// Do NOT redefine it locally — the imported version has nullish coalescing safety.

/**
 * Extract internal links from page code (href="/...", Link href="/...").
 * Returns unique route paths (e.g. ['/signup', '/forgot-password']).
 */
function extractInternalLinks(code: string): string[] {
  const links = new Set<string>()
  const hrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(code)) !== null) {
    const route = m[1]
    if (route === '/' || route.startsWith('/design-system') || route.startsWith('/#') || route.startsWith('/api')) continue
    links.add(route)
  }
  return [...links]
}

/**
 * Known auth-flow page patterns: when one of these is created, the others are related.
 */
const AUTH_FLOW_PATTERNS: Record<string, string[]> = {
  '/login': ['/signup', '/forgot-password'],
  '/signin': ['/signup', '/forgot-password'],
  '/signup': ['/login'],
  '/register': ['/login'],
  '/forgot-password': ['/login', '/reset-password'],
  '/reset-password': ['/login'],
}

/** Convert a page route to the filesystem path for its page.tsx */
function routeToFsPath(projectRoot: string, route: string, isAuth: boolean): string {
  const slug = route.replace(/^\//, '')
  if (isAuth) {
    return resolve(projectRoot, 'app', '(auth)', slug || 'login', 'page.tsx')
  }
  if (!slug) {
    return resolve(projectRoot, 'app', 'page.tsx')
  }
  return resolve(projectRoot, 'app', slug, 'page.tsx')
}

/** Convert a page route to a relative display path */
function routeToRelPath(route: string, isAuth: boolean): string {
  const slug = route.replace(/^\//, '')
  if (isAuth) {
    return `app/(auth)/${slug || 'login'}/page.tsx`
  }
  if (!slug) {
    return 'app/page.tsx'
  }
  return `app/${slug}/page.tsx`
}

/**
 * Deduplicate pages with similar routes.
 * Keeps the first occurrence, removes near-duplicates like /catalog vs /catalogue, /contact vs /contacts.
 */
function deduplicatePages(pages: Array<{ name: string; id: string; route: string }>): Array<{ name: string; id: string; route: string }> {
  const normalize = (route: string) => route.replace(/\/$/, '').replace(/s$/, '').replace(/ue$/, '')
  const seen = new Map<string, number>()
  return pages.filter((page, idx) => {
    const norm = normalize(page.route)
    if (seen.has(norm)) return false
    seen.set(norm, idx)
    return true
  })
}

/**
 * Detect whether the user's request implies a full website/app (needs a landing page).
 */
function impliesFullWebsite(message: string): boolean {
  return /\b(create|build|make|design)\b.{0,30}\b(website|web\s*site|web\s*app|application|app|platform|portal|site)\b/i.test(message)
}

/**
 * Extract page names from user message as a last-resort fallback when AI plan fails.
 */
function extractPageNamesFromMessage(message: string): Array<{ name: string; id: string; route: string }> {
  const pages: Array<{ name: string; id: string; route: string }> = []
  const known: Record<string, string> = {
    home: '/', landing: '/', dashboard: '/dashboard', about: '/about',
    'about us': '/about', contact: '/contact', contacts: '/contacts',
    pricing: '/pricing', settings: '/settings', account: '/account',
    'personal account': '/account', registration: '/registration',
    signup: '/signup', 'sign up': '/signup', login: '/login',
    'sign in': '/login', catalogue: '/catalogue', catalog: '/catalog',
    blog: '/blog', portfolio: '/portfolio', features: '/features',
    services: '/services', faq: '/faq', team: '/team',
  }
  const lower = message.toLowerCase()
  for (const [key, route] of Object.entries(known)) {
    if (lower.includes(key)) {
      const name = key.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
      const id = route.slice(1) || 'home'
      if (!pages.some(p => p.route === route)) {
        pages.push({ name, id, route })
      }
    }
  }
  return pages
}

/**
 * Build a concise context block describing existing pages for AI prompts.
 * Uses pageAnalysis data to give AI concrete knowledge of what exists.
 */
function buildExistingPagesContext(config: DesignSystemConfig): string {
  const pages = config.pages || []
  const analyzed = pages.filter((p: any) => p.pageAnalysis)
  if (analyzed.length === 0) return ''

  const lines = analyzed.map((p: any) => {
    return summarizePageAnalysis(p.name || p.id, p.route, p.pageAnalysis)
  })

  let ctx = `EXISTING PAGES CONTEXT:\n${lines.join('\n')}\n\nUse consistent component choices, spacing, and layout patterns across all pages. Match the style and structure of existing pages.`

  // Inject saved style patterns from `coherent sync` if available
  const sp = (config as any).stylePatterns
  if (sp && typeof sp === 'object') {
    const parts: string[] = []
    if (sp.card) parts.push(`Cards: ${sp.card}`)
    if (sp.section) parts.push(`Sections: ${sp.section}`)
    if (sp.terminal) parts.push(`Terminal blocks: ${sp.terminal}`)
    if (sp.iconContainer) parts.push(`Icon containers: ${sp.iconContainer}`)
    if (sp.heroHeadline) parts.push(`Hero headline: ${sp.heroHeadline}`)
    if (sp.sectionTitle) parts.push(`Section title: ${sp.sectionTitle}`)
    if (parts.length > 0) {
      ctx += `\n\nPROJECT STYLE PATTERNS (from sync — match these exactly):\n${parts.join('\n')}`
    }
  }

  return ctx
}

/**
 * Extract style patterns from generated Home page code.
 * Pure local processing — no AI call. ~200-400 tokens of context.
 */
function extractStyleContext(pageCode: string): string {
  const unique = (arr: string[]) => [...new Set(arr)]

  // Card styling patterns
  const cardClasses = (pageCode.match(/className="[^"]*(?:rounded|border|shadow|bg-card)[^"]*"/g) || [])
    .map(m => m.replace(/className="|"/g, ''))
    .filter(c => c.includes('rounded') || c.includes('border') || c.includes('card'))
  // Section spacing
  const sectionSpacing = unique(pageCode.match(/py-\d+(?:\s+md:py-\d+)?/g) || [])
  // Heading typography
  const headingStyles = unique(pageCode.match(/text-(?:\d*xl|lg)\s+font-(?:bold|semibold|medium)/g) || [])
  // Color usage (semantic + raw)
  const colorPatterns = unique(
    (pageCode.match(/(?:text|bg|border)-(?:primary|secondary|muted|accent|card|destructive|foreground|background)\S*/g) || [])
      .concat(pageCode.match(/(?:text|bg|border)-(?:emerald|blue|violet|rose|amber|zinc|slate|gray|green|red|orange|indigo|purple|teal|cyan)\S*/g) || [])
  )
  // Icon container patterns
  const iconPatterns = unique(pageCode.match(/(?:rounded-\S+\s+)?p-\d+(?:\.\d+)?\s*(?:bg-\S+)?/g) || [])
    .filter(p => p.includes('bg-') || p.includes('rounded'))
  // Button patterns
  const buttonPatterns = unique(
    (pageCode.match(/className="[^"]*(?:hover:|active:)[^"]*"/g) || [])
      .map(m => m.replace(/className="|"/g, ''))
      .filter(c => c.includes('px-') || c.includes('py-') || c.includes('rounded'))
  )
  // Background patterns for sections
  const bgPatterns = unique(pageCode.match(/bg-(?:muted|card|background|zinc|slate|gray)\S*/g) || [])
  // Gap / spacing inside containers
  const gapPatterns = unique(pageCode.match(/gap-\d+/g) || [])
  // Grid patterns
  const gridPatterns = unique(pageCode.match(/grid-cols-\d+|md:grid-cols-\d+|lg:grid-cols-\d+/g) || [])

  // Container / layout width pattern (critical for alignment with header)
  const containerPatterns = unique(pageCode.match(/container\s+max-w-\S+|max-w-\d+xl\s+mx-auto/g) || [])

  const lines: string[] = []
  // Container pattern is FIRST — most important for alignment
  if (containerPatterns.length > 0) {
    lines.push(`Container (MUST match for alignment with header/footer): ${containerPatterns[0]} px-4`)
  }
  if (cardClasses.length > 0) lines.push(`Cards: ${unique(cardClasses).slice(0, 4).join(' | ')}`)
  if (sectionSpacing.length > 0) lines.push(`Section spacing: ${sectionSpacing.join(', ')}`)
  if (headingStyles.length > 0) lines.push(`Headings: ${headingStyles.join(', ')}`)
  if (colorPatterns.length > 0) lines.push(`Colors: ${colorPatterns.slice(0, 15).join(', ')}`)
  if (iconPatterns.length > 0) lines.push(`Icon containers: ${iconPatterns.slice(0, 4).join(' | ')}`)
  if (buttonPatterns.length > 0) lines.push(`Buttons: ${buttonPatterns.slice(0, 3).join(' | ')}`)
  if (bgPatterns.length > 0) lines.push(`Section backgrounds: ${bgPatterns.slice(0, 6).join(', ')}`)
  if (gapPatterns.length > 0) lines.push(`Gaps: ${gapPatterns.join(', ')}`)
  if (gridPatterns.length > 0) lines.push(`Grids: ${gridPatterns.join(', ')}`)

  if (lines.length === 0) return ''

  return `STYLE CONTEXT (match these patterns exactly for visual consistency with the Home page):
${lines.map(l => `  - ${l}`).join('\n')}`
}

/**
 * Split strategy — 4 phases preserving design coherence:
 *   Phase 1: Plan all pages (AI, ~500 tokens)
 *   Phase 2: Generate Home page with header/footer (AI, full pageCode)
 *   Phase 3: Extract style context + shared components (local, no AI)
 *   Phase 4: Generate remaining pages with style context (AI, parallel)
 */
async function splitGeneratePages(
  spinner: ReturnType<typeof ora>,
  message: string,
  modCtx: { config: DesignSystemConfig; componentManager: InstanceType<typeof ComponentManager> },
  provider: Parameters<typeof parseModification>[2],
  parseOpts: { sharedComponentsSummary?: string },
): Promise<ModificationRequest[]> {
  // ── Phase 1: Plan ──────────────────────────────────────────────────
  let pageNames: Array<{ name: string; id: string; route: string }> = []

  spinner.start('Phase 1/4 — Planning pages...')
  try {
    const planResult = await parseModification(
      message,
      modCtx, provider, { ...parseOpts, planOnly: true }
    )
    const pageReqs = planResult.requests.filter((r: ModificationRequest) => r.type === 'add-page')
    pageNames = pageReqs.map((r: ModificationRequest) => {
      const c = r.changes as Record<string, unknown>
      const name = (c.name as string) || (c.id as string) || 'page'
      const id = (c.id as string) || name.toLowerCase().replace(/\s+/g, '-')
      const route = (c.route as string) || `/${id}`
      return { name, id, route }
    })
  } catch {
    spinner.text = 'AI plan failed — extracting pages from your request...'
  }

  if (pageNames.length === 0) {
    pageNames = extractPageNamesFromMessage(message)
  }
  if (pageNames.length === 0) {
    spinner.fail('Could not determine pages to create')
    return []
  }

  // Deduplicate routes: keep first occurrence, remove near-duplicates like /catalog vs /catalogue
  pageNames = deduplicatePages(pageNames)

  const hasHomePage = pageNames.some(p => p.route === '/')
  if (!hasHomePage && impliesFullWebsite(message)) {
    pageNames.unshift({ name: 'Home', id: 'home', route: '/' })
  }

  const allRoutes = pageNames.map(p => p.route).join(', ')
  const allPagesList = pageNames.map(p => `${p.name} (${p.route})`).join(', ')
  spinner.succeed(`Phase 1/4 — Found ${pageNames.length} pages: ${allPagesList}`)

  // ── Phase 2: Generate Home page ────────────────────────────────────
  const homeIdx = pageNames.findIndex(p => p.route === '/')
  const homePage = homeIdx !== -1 ? pageNames[homeIdx] : pageNames[0]
  const remainingPages = pageNames.filter((_, i) => i !== (homeIdx !== -1 ? homeIdx : 0))

  spinner.start(`Phase 2/4 — Generating ${homePage.name} page (sets design direction)...`)
  let homeRequest: ModificationRequest | null = null
  let homePageCode = ''
  try {
    const homeResult = await parseModification(
      `Create ONE page called "${homePage.name}" at route "${homePage.route}". Context: ${message}. This is the MAIN landing page of the website. Generate complete pageCode. Include a branded site-wide <header> with navigation links to ALL these pages: ${allPagesList}. Use these EXACT routes in navigation: ${allRoutes}. Include a <footer> at the bottom. Make it visually polished — this page sets the design direction for the entire site. Do not generate other pages.`,
      modCtx, provider, parseOpts
    )
    const codePage = homeResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
    if (codePage) {
      homeRequest = codePage
      homePageCode = ((codePage.changes as Record<string, unknown>)?.pageCode as string) || ''
    }
  } catch { /* handled below */ }

  if (!homeRequest) {
    homeRequest = { type: 'add-page', target: 'new', changes: { id: homePage.id, name: homePage.name, route: homePage.route } }
  }
  spinner.succeed(`Phase 2/4 — ${homePage.name} page generated`)

  // ── Phase 3: Extract style context (local, no AI) ─────────────────
  spinner.start('Phase 3/4 — Extracting design patterns...')
  const styleContext = homePageCode ? extractStyleContext(homePageCode) : ''
  if (styleContext) {
    const lineCount = styleContext.split('\n').length - 1
    spinner.succeed(`Phase 3/4 — Extracted ${lineCount} style patterns from ${homePage.name}`)
  } else {
    spinner.succeed('Phase 3/4 — No style patterns extracted (Home page had no code)')
  }

  if (remainingPages.length === 0) {
    return [homeRequest]
  }

  // ── Phase 4: Generate remaining pages (parallel) ───────────────────
  spinner.start(`Phase 4/4 — Generating ${remainingPages.length} pages in parallel...`)

  const sharedNote = 'Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page. Start with the main content directly.'
  const routeNote = `EXISTING ROUTES in this project: ${allRoutes}. All internal links MUST point to one of these routes. If a target doesn't exist, use href="#".`
  const alignmentNote = 'CRITICAL LAYOUT RULE: Every <section> must wrap its content in a container div matching the header width. Use the EXACT same container classes as shown in the style context (e.g. className="container max-w-6xl px-4" or className="max-w-6xl mx-auto px-4"). Inner content can use narrower max-w for text centering, but the outer section container MUST match.'

  // Build existing pages context from pageAnalysis
  const existingPagesContext = buildExistingPagesContext(dsm.getConfig())

  let phase4Done = 0
  const pagePromises = remainingPages.map(({ name, id, route }) => {
    const prompt = [
      `Create ONE page called "${name}" at route "${route}".`,
      `Context: ${message}.`,
      `Generate complete pageCode for this single page only. Do not generate other pages.`,
      sharedNote,
      routeNote,
      alignmentNote,
      existingPagesContext,
      styleContext,
    ].filter(Boolean).join('\n\n')

    return parseModification(prompt, modCtx, provider, parseOpts)
      .then(result => {
        phase4Done++
        spinner.text = `Phase 4/4 — ${phase4Done}/${remainingPages.length} pages generated...`
        const codePage = result.requests.find((r: ModificationRequest) => r.type === 'add-page')
        return codePage || { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      })
      .catch(() => {
        phase4Done++
        spinner.text = `Phase 4/4 — ${phase4Done}/${remainingPages.length} pages generated...`
        return { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      })
  })

  const settled = await Promise.allSettled(pagePromises)
  const remainingRequests: ModificationRequest[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return { type: 'add-page', target: 'new', changes: { id: remainingPages[i].id, name: remainingPages[i].name, route: remainingPages[i].route } }
  })

  const allRequests = [homeRequest, ...remainingRequests]
  const withCode = allRequests.filter(r => (r.changes as Record<string, unknown>)?.pageCode).length
  spinner.succeed(`Phase 4/4 — Generated ${allRequests.length} pages (${withCode} with full code)`)
  return allRequests
}

/**
 * Post-processing: extract inline header/footer from generated pages into shared components.
 * Only runs when no shared layout components exist yet (first generation).
 */
/**
 * Extract balanced JSX block by tag name. Handles nested same-name tags correctly.
 */
function extractBalancedTag(source: string, tagName: string): string | null {
  const openRe = new RegExp(`<${tagName}\\b`, 'gi')
  const match = openRe.exec(source)
  if (!match) return null

  const startIdx = match.index
  let depth = 0
  let i = startIdx
  const selfCloseRe = new RegExp(`^<${tagName}\\b[^>]*/>`, 'i')
  const openTagRe = new RegExp(`<${tagName}\\b`, 'gi')
  const closeTagRe = new RegExp(`</${tagName}>`, 'gi')

  // Count open and close tags to find balanced end
  openTagRe.lastIndex = startIdx
  closeTagRe.lastIndex = startIdx
  depth = 0
  let lastCloseEnd = startIdx

  // Walk through all opens and closes in order
  const events: Array<{ pos: number; type: 'open' | 'close'; end: number }> = []
  let m: RegExpExecArray | null
  openTagRe.lastIndex = startIdx
  while ((m = openTagRe.exec(source)) !== null) {
    events.push({ pos: m.index, type: 'open', end: m.index + m[0].length })
  }
  closeTagRe.lastIndex = startIdx
  while ((m = closeTagRe.exec(source)) !== null) {
    events.push({ pos: m.index, type: 'close', end: m.index + m[0].length })
  }
  events.sort((a, b) => a.pos - b.pos)

  depth = 0
  for (const ev of events) {
    if (ev.pos < startIdx) continue
    if (ev.type === 'open') depth++
    else {
      depth--
      if (depth === 0) return source.slice(startIdx, ev.end)
    }
  }
  return null
}

/**
 * Extract imports used inside a JSX block from the source file.
 */
function extractRelevantImports(fullSource: string, jsxBlock: string): string[] {
  const importLines: string[] = []
  const importRe = /^import\s+.*from\s+['"][^'"]+['"];?\s*$/gm
  let m: RegExpExecArray | null
  while ((m = importRe.exec(fullSource)) !== null) {
    const line = m[0]
    // Check if any imported name is referenced in the JSX block
    const namesMatch = line.match(/import\s*\{([^}]+)\}/)
    if (namesMatch) {
      const names = namesMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim())
      if (names.some(name => jsxBlock.includes(name))) {
        importLines.push(line)
      }
    }
    const defaultMatch = line.match(/import\s+(\w+)\s+from/)
    if (defaultMatch && jsxBlock.includes(defaultMatch[1])) {
      importLines.push(line)
    }
  }
  return [...new Set(importLines)]
}

/**
 * Detect useState hooks from source that are referenced in a JSX block.
 * Returns the hook declaration lines (e.g. "const [open, setOpen] = useState(false)").
 */
function extractStateHooks(fullSource: string, jsxBlock: string): string[] {
  const hooks: string[] = []
  const stateRe = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\b[^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = stateRe.exec(fullSource)) !== null) {
    const [fullMatch, getter, setter] = m
    if (jsxBlock.includes(getter) || jsxBlock.includes(setter)) {
      hooks.push(fullMatch)
    }
  }
  return hooks
}

/**
 * Post-process extracted header: add usePathname for active nav state,
 * ensure usePathname import, and fix indentation.
 */
function addActiveNavToHeader(code: string): string {
  let result = code

  // Add usePathname import if not present
  if (!result.includes('usePathname')) {
    if (result.includes("from 'next/navigation'")) {
      result = result.replace(
        /import\s*\{([^}]+)\}\s*from\s*'next\/navigation'/,
        (_, names) => `import { ${names.trim()}, usePathname } from 'next/navigation'`
      )
    } else {
      result = result.replace(
        "export function Header()",
        "import { usePathname } from 'next/navigation'\n\nexport function Header()"
      )
    }
  }

  // Add pathname declaration inside the component
  if (!result.includes('const pathname')) {
    result = result.replace(
      /export function Header\(\)\s*\{/,
      'export function Header() {\n  const pathname = usePathname()'
    )
  }

  // Replace static nav link classes with pathname-based ones.
  // Pattern: <Link href="/route" className="...text-foreground..."   or  ...text-muted-foreground...">
  // Replace with dynamic: className={`... ${pathname === '/route' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'} ...`}
  result = result.replace(
    /<Link\s+href="(\/[^"]*?)"\s+className="([^"]*?)(?:text-foreground|text-muted-foreground(?:\s+hover:text-foreground)?(?:\s+transition-colors)?)([^"]*?)">/g,
    (_, href, before, after) => {
      const base = before.trim()
      const trail = after.trim()
      const staticParts = [base, trail].filter(Boolean).join(' ')
      const space = staticParts ? ' ' : ''
      return `<Link href="${href}" className={\`${staticParts}${space}\${pathname === '${href}' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground transition-colors'}\`}>`
    }
  )

  return result
}

async function extractAndShareLayoutComponents(projectRoot: string, generatedPageFiles: string[]): Promise<boolean> {
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
    } catch { continue }
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

  // Strip the first inline header (or nav) and last footer from generated pages
  for (const file of generatedPageFiles) {
    try {
      let code = await readFile(file)
      const original = code
      // Remove first <header> block (the site-wide header)
      const headerBlock = extractBalancedTag(code, 'header')
      if (headerBlock) {
        code = code.replace(headerBlock, '')
      } else {
        // If no <header>, try removing the first <nav> (often used as site nav)
        const navBlock = extractBalancedTag(code, 'nav')
        if (navBlock) code = code.replace(navBlock, '')
      }
      // Remove last <footer> block
      const footerBlock = extractBalancedTag(code, 'footer')
      if (footerBlock) code = code.replace(footerBlock, '')
      code = code.replace(/\n{3,}/g, '\n\n')
      if (code !== original) await writeFile(file, code)
    } catch { continue }
  }

  console.log(chalk.cyan('  🔗 Extracted Header and Footer as shared components (all pages via layout)'))
  return true
}

/**
 * Resilience layer: normalize AI-generated requests before execution.
 * Fixes wrong action types, missing fields, and target mismatches.
 * Returns corrected request or { error } for unrecoverable issues.
 */
function normalizeRequest(
  request: ModificationRequest,
  config: DesignSystemConfig,
): ModificationRequest | { error: string } {
  const changes = request.changes as Record<string, unknown> | undefined
  const VALID_TYPES: ModificationRequest['type'][] = [
    'update-token', 'add-component', 'modify-component', 'add-layout-block',
    'modify-layout-block', 'add-page', 'update-page', 'update-navigation',
    'link-shared', 'promote-and-link',
  ]
  if (!VALID_TYPES.includes(request.type)) {
    return { error: `Unknown action "${request.type}". Valid: ${VALID_TYPES.join(', ')}` }
  }

  const findPage = (target: string) =>
    config.pages.find(
      (p) =>
        p.id === target ||
        p.route === target ||
        p.name?.toLowerCase() === String(target).toLowerCase()
    )

  switch (request.type) {
    case 'update-page': {
      const page = findPage(request.target)
      if (!page && changes?.pageCode) {
        const targetStr = String(request.target)
        const id = targetStr.replace(/^\//, '') || 'home'
        return {
          ...request,
          type: 'add-page',
          target: 'new',
          changes: {
            id,
            name: (changes.name as string) || id.charAt(0).toUpperCase() + id.slice(1) || 'Home',
            route: targetStr.startsWith('/') ? targetStr : `/${targetStr}`,
            ...changes,
          },
        }
      }
      if (!page) {
        const available = config.pages.map((p) => `${p.name} (${p.route})`).join(', ')
        return { error: `Page "${request.target}" not found. Available: ${available || 'none'}` }
      }
      if (page.id !== request.target) {
        return { ...request, target: page.id }
      }
      break
    }

    case 'add-page': {
      if (!changes) break
      let route = (changes.route as string) || ''
      if (route && !route.startsWith('/')) route = `/${route}`
      if (route) changes.route = route

      const existingByRoute = config.pages.find((p) => p.route === route)
      if (existingByRoute && route) {
        return {
          ...request,
          type: 'update-page',
          target: existingByRoute.id,
        }
      }

      if (!changes.id && changes.name) {
        changes.id = String(changes.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      }
      if (!changes.id && route) {
        changes.id = route.replace(/^\//, '') || 'home'
      }
      break
    }

    case 'modify-component': {
      const componentId = request.target
      const existingComp = config.components.find((c) => c.id === componentId)

      if (!existingComp) {
        return {
          ...request,
          type: 'add-component',
          target: 'new',
        }
      }

      if (changes) {
        if (typeof changes.id === 'string' && changes.id !== componentId) {
          const targetExists = config.components.some((c) => c.id === changes.id)
          if (!targetExists) {
            return { ...request, type: 'add-component', target: 'new' }
          }
          return { error: `Cannot change component "${componentId}" to "${changes.id}" — "${changes.id}" already exists.` }
        }

        if (typeof changes.name === 'string') {
          const newName = changes.name.toLowerCase()
          const curName = existingComp.name.toLowerCase()
          const curId = componentId.toLowerCase()
          const nameOk = newName === curName || newName === curId ||
            newName.includes(curId) || curId.includes(newName)
          if (!nameOk) {
            delete changes.name
          }
        }
      }
      break
    }

    case 'add-component': {
      if (changes) {
        const shadcn = changes.shadcnComponent as string | undefined
        const id = changes.id as string | undefined
        if (shadcn && id && id !== shadcn) {
          changes.id = shadcn
        }
      }
      break
    }

    case 'link-shared': {
      if (changes) {
        const page = findPage(request.target)
        if (!page) {
          const available = config.pages.map((p) => `${p.name} (${p.route})`).join(', ')
          return { error: `Page "${request.target}" not found for link-shared. Available: ${available || 'none'}` }
        }
        if (page.id !== request.target) {
          return { ...request, target: page.id }
        }
      }
      break
    }

    case 'promote-and-link': {
      const sourcePage = findPage(request.target)
      if (!sourcePage) {
        const available = config.pages.map((p) => `${p.name} (${p.route})`).join(', ')
        return { error: `Source page "${request.target}" not found for promote-and-link. Available: ${available || 'none'}` }
      }
      if (sourcePage.id !== request.target) {
        return { ...request, target: sourcePage.id }
      }
      break
    }
  }

  return request
}

/**
 * Apply defaults to modification request so AI-generated partial data passes validation.
 * Returns a new request object (no mutation).
 */
function applyDefaults(request: ModificationRequest): ModificationRequest {
  if (request.type === 'add-page' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const now = new Date().toISOString()
    const name = (changes.name as string) || 'New Page'
    let id = (changes.id as string) || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!/^[a-z]/.test(id)) id = `page-${id}`
    const route = (changes.route as string) || `/${id}`
    const hasPageCode = typeof changes.pageCode === 'string' && changes.pageCode.trim() !== ''

    const base = {
      id,
      name,
      route: route.startsWith('/') ? route : `/${route}`,
      layout: (changes.layout as string) || 'centered',
      title: (changes.title as string) || name,
      description: (changes.description as string) || `${name} page`,
      createdAt: (changes.createdAt as string) || now,
      updatedAt: (changes.updatedAt as string) || now,
      requiresAuth: (changes.requiresAuth as boolean) ?? false,
      noIndex: (changes.noIndex as boolean) ?? false,
    }
    const sections = Array.isArray(changes.sections)
      ? (changes.sections as Record<string, unknown>[]).map((section, idx) => ({
          id: (section.id as string) || `section-${idx}`,
          name: (section.name as string) || `Section ${idx + 1}`,
          componentId: (section.componentId as string) || 'button',
          order: typeof section.order === 'number' ? section.order : idx,
          props: (section.props as Record<string, unknown>) || {},
        }))
      : []
    return {
      ...request,
      changes: {
        ...base,
        sections,
        ...(hasPageCode ? { pageCode: changes.pageCode as string, generatedWithPageCode: true } : {}),
        ...(changes.pageType ? { pageType: changes.pageType } : {}),
        ...(changes.structuredContent ? { structuredContent: changes.structuredContent } : {}),
      } as PageDefinition & { pageCode?: string; pageType?: string; structuredContent?: Record<string, unknown> },
    }
  }

  if (request.type === 'add-component' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const now = new Date().toISOString()
    const validSizeNames = ['xs', 'sm', 'md', 'lg', 'xl'] as const

    let normalizedVariants: Array<{ name: string; className: string }> = []
    if (Array.isArray(changes.variants)) {
      normalizedVariants = (changes.variants as unknown[]).map((v: unknown) => {
        if (typeof v === 'string') return { name: v, className: '' }
        if (v && typeof v === 'object' && 'name' in v) {
          return {
            name: (v as { name: string }).name,
            className: (v as { className?: string }).className ?? '',
          }
        }
        return { name: 'default', className: '' }
      })
    }

    let normalizedSizes: Array<{ name: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className: string }> = []
    if (Array.isArray(changes.sizes)) {
      normalizedSizes = (changes.sizes as unknown[]).map((s: unknown) => {
        if (typeof s === 'string') {
          const name = validSizeNames.includes(s as (typeof validSizeNames)[number])
            ? (s as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: '' }
        }
        if (s && typeof s === 'object' && 'name' in s) {
          const raw = (s as { name: string; className?: string }).name
          const name = validSizeNames.includes(raw as (typeof validSizeNames)[number])
            ? (raw as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: (s as { className?: string }).className ?? '' }
        }
        return { name: 'md', className: '' }
      })
    }

    return {
      ...request,
      changes: {
        ...changes,
        variants: normalizedVariants,
        sizes: normalizedSizes,
        createdAt: now,
        updatedAt: now,
      } as ComponentDefinition,
    }
  }

  if (request.type === 'modify-component' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const validSizeNames = ['xs', 'sm', 'md', 'lg', 'xl'] as const

    let normalizedVariants: Array<{ name: string; className: string }> | undefined
    if (Array.isArray(changes.variants)) {
      normalizedVariants = (changes.variants as unknown[]).map((v: unknown) => {
        if (typeof v === 'string') return { name: v, className: '' }
        if (v && typeof v === 'object' && 'name' in v) {
          return {
            name: (v as { name: string }).name,
            className: (v as { className?: string }).className ?? '',
          }
        }
        return { name: 'default', className: '' }
      })
    }

    let normalizedSizes: Array<{ name: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className: string }> | undefined
    if (Array.isArray(changes.sizes)) {
      normalizedSizes = (changes.sizes as unknown[]).map((s: unknown) => {
        if (typeof s === 'string') {
          const name = validSizeNames.includes(s as (typeof validSizeNames)[number])
            ? (s as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: '' }
        }
        if (s && typeof s === 'object' && 'name' in s) {
          const raw = (s as { name: string; className?: string }).name
          const name = validSizeNames.includes(raw as (typeof validSizeNames)[number])
            ? (raw as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: (s as { className?: string }).className ?? '' }
        }
        return { name: 'md', className: '' }
      })
    }

    return {
      ...request,
      changes: {
        ...changes,
        ...(normalizedVariants !== undefined && { variants: normalizedVariants }),
        ...(normalizedSizes !== undefined && { sizes: normalizedSizes }),
      },
    }
  }

  return request
}

/**
 * Load config from file
 */
async function loadConfig(configPath: string): Promise<DesignSystemConfig> {
  if (!existsSync(configPath)) {
    throw new Error(
      `Design system config not found at ${configPath}\n` +
      'Run "coherent init" first to create a project.'
    )
  }

  const manager = new DesignSystemManager(configPath)
  await manager.load()
  return manager.getConfig()
}

/**
 * Find project and show helpful error if not found
 */
function requireProject(): { root: string; configPath: string } {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }
  return project
}

/** Client hooks that require "use client" in Next.js App Router */
/**
 * Validate and fix AI-generated code before write: sanitize metadata, ensure "use client", install missing deps.
 * Returns fixed code and list of fix descriptions for logging.
 */
async function validateAndFixGeneratedCode(
  projectRoot: string,
  code: string,
  options: { isPage?: boolean } = {}
): Promise<{ fixedCode: string; fixes: string[] }> {
  const fixes: string[] = []
  let fixed = fixEscapedClosingQuotes(code)
  fixed = fixUnescapedLtInJsx(fixed)
  if (fixed !== code) fixes.push('Fixed syntax issues')
  const beforeMeta = fixed
  fixed = options.isPage !== false ? sanitizeMetadataStrings(ensureUseClientIfNeeded(fixed)) : ensureUseClientIfNeeded(fixed)
  if (fixed !== beforeMeta) fixes.push('Fixed metadata / use client')
  const missing = findMissingPackagesInCode(fixed, projectRoot)
  if (missing.length > 0) {
    const ok = await installPackages(projectRoot, missing)
    if (ok) fixes.push(`Installed: ${missing.join(', ')}`)
  }
  return { fixedCode: fixed, fixes }
}

/**
 * Extract component ids from page code imports.
 * Handles @/components/ui/button, @/components/button, and excludes shared/.
 */
function extractComponentIdsFromCode(code: string): Set<string> {
  const ids = new Set<string>()
  const allMatches = code.matchAll(/@\/components\/((?:ui\/)?[a-z0-9-]+)/g)
  for (const m of allMatches) {
    if (!m[1]) continue
    let id = m[1]
    if (id.startsWith('ui/')) id = id.slice(3)
    if (id === 'shared' || id.startsWith('shared/')) continue
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Story 2.11 Part A: Warn if generated page contains inline code that duplicates an existing shared (section/widget) component.
 * Checks: page does not import the shared component, but contains JSX with the same component name (suggesting copy-paste).
 */
async function warnInlineDuplicates(
  projectRoot: string,
  pageName: string,
  pageCode: string,
  manifest: { shared: Array<{ id: string; name: string; type: string; file: string }> }
): Promise<void> {
  const sectionOrWidget = manifest.shared.filter((e) => e.type === 'section' || e.type === 'widget')
  if (sectionOrWidget.length === 0) return

  for (const e of sectionOrWidget) {
    const kebab = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const hasImport = pageCode.includes(`@/components/shared/${kebab}`)
    if (hasImport) continue
    // Page uses same PascalCase name as JSX tag but not from shared → possible inline duplicate
    const sameNameAsTag = new RegExp(`<\\/?${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s>]`).test(pageCode)
    if (sameNameAsTag) {
      console.log(
        chalk.yellow(
          `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`
        )
      )
      continue
    }
    // Lightweight token overlap: read shared file snippet, if page has many of the same tokens, warn
    try {
      const fullPath = resolve(projectRoot, e.file)
      const sharedSnippet = (await readFile(fullPath)).slice(0, 600)
      const sharedTokens = new Set(sharedSnippet.match(/\b[a-zA-Z0-9-]{4,}\b/g) ?? [])
      const pageTokens = pageCode.match(/\b[a-zA-Z0-9-]+\b/g) ?? []
      let overlap = 0
      for (const t of sharedTokens) {
        if (pageTokens.includes(t)) overlap++
      }
      if (overlap >= 12 && sharedTokens.size >= 10) {
        console.log(
          chalk.yellow(
            `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`
          )
        )
      }
    } catch {
      // ignore read errors
    }
  }
}

/** Extract imported names from code for a given module path (e.g. '@/components/ui', 'lucide-react'). Path can be prefix (e.g. @/components/shared matches @/components/shared/header). */
function extractImportsFrom(code: string, fromPath: string): string[] {
  const escaped = fromPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*['"\`]${escaped}[^'"\`]*['"\`]`,
    'g'
  )
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(code)) !== null) {
    const names = match[1]
      .split(',')
      .map((s) => s.trim().replace(/\s+as\s+.*$/, '').trim())
      .filter(Boolean)
    results.push(...names)
  }
  return [...new Set(results)]
}

interface PostGenerationReportOpts {
  action: 'created' | 'updated'
  pageTitle: string
  filePath: string
  code: string
  projectRoot: string
  route?: string
  postFixes?: string[]
  layoutShared?: Array<{ id: string; name: string; type: string }>
  allShared?: Array<{ id: string; name: string; type: string }>
}

function printPostGenerationReport(opts: PostGenerationReportOpts): void {
  const { action, pageTitle, filePath, code, route, postFixes = [], layoutShared = [], allShared = [] } = opts
  const uiComponents = extractImportsFrom(code, '@/components/ui')
  const sharedImportNames = extractImportsFrom(code, '@/components/shared/')
  const inCodeShared = allShared.filter((s) => sharedImportNames.some((n) => n === s.name))
  const iconCount = extractImportsFrom(code, 'lucide-react').length
  const hasInstalled = postFixes.some((f) => f.startsWith('Installed:'))
  const syntaxStatus = postFixes.length > 0
    ? (postFixes.some((f) => f.includes('metadata')) ? 'fixed (escaped metadata quotes) ✔' : 'fixed ✔')
    : 'valid ✔'

  console.log(chalk.green(`\n✅ Page "${pageTitle}" ${action} at ${filePath}\n`))
  if (uiComponents.length > 0) {
    console.log(chalk.dim(`  Components:  ${uiComponents.join(', ')} (from @/components/ui)`))
  }
  if (inCodeShared.length > 0) {
    console.log(chalk.dim(`  Shared:      ${inCodeShared.map((s) => `${s.id} (${s.name})`).join(', ')}`))
  }
  if (layoutShared.length > 0) {
    console.log(
      chalk.dim(`  Layout:      ${layoutShared.map((l) => `${l.id} (${l.name})`).join(', ')} via layout.tsx`)
    )
  }
  if (iconCount > 0) {
    console.log(chalk.dim(`  Icons:       ${iconCount} from lucide-react`))
  }
  if (hasInstalled) {
    console.log(chalk.dim('  Dependencies: installed ✔'))
  }
  console.log(chalk.dim(`  Syntax:      ${syntaxStatus}`))
  if (route) {
    console.log(chalk.cyan(`\n  Preview: http://localhost:3000${route}`))
  }
  console.log('')
}

function printSharedComponentReport(opts: {
  id: string
  name: string
  file: string
  instruction?: string
  postFixes?: string[]
}): void {
  const { id, name, file, instruction, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Updated ${id} (${name}) at ${file}\n`))
  if (instruction) {
    const snippet = instruction.length > 60 ? instruction.slice(0, 57) + '...' : instruction
    console.log(chalk.dim(`  Changed:     ${snippet}`))
  }
  console.log(chalk.dim('  Affects:    all pages via layout.tsx'))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log('')
}

function printLinkSharedReport(opts: {
  sharedId: string
  sharedName: string
  pageTarget: string
  route: string
  postFixes?: string[]
}): void {
  const { sharedId, sharedName, pageTarget, route, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Linked ${sharedId} (${sharedName}) to page "${pageTarget}"\n`))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log(chalk.cyan(`  Preview: http://localhost:3000${route}`))
  console.log('')
}

function printPromoteAndLinkReport(opts: {
  id: string
  name: string
  file: string
  usedInFiles: string[]
  postFixes?: string[]
}): void {
  const { id, name, file, usedInFiles, postFixes = [] } = opts
  const syntaxStatus = postFixes.length > 0 ? 'fixed ✔' : 'valid ✔'
  console.log(chalk.green(`\n✅ Created ${id} (${name}) at ${file}\n`))
  console.log(chalk.dim(`  Linked to:  ${usedInFiles.length} page(s)`))
  console.log(chalk.dim(`  Syntax:     ${syntaxStatus}`))
  console.log('')
}

/**
 * Ensure all listed components exist: install missing shadcn components and register them.
 * Updates dsm, cm, pm in place. Call before writing pageCode so the file never references missing modules.
 * Returns ids that were installed so caller can regenerate their files and add to modified list.
 */
async function ensureComponentsInstalled(
  componentIds: Set<string> | string[],
  cm: ComponentManager,
  dsm: DesignSystemManager,
  pm: PageManager,
  projectRoot: string
): Promise<{ installed: string[] }> {
  const installed: string[] = []
  const ids = Array.from(componentIds)
  for (const componentId of ids) {
    const isRegistered = !!cm.read(componentId)
    const fileName = componentId.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.tsx'
    const filePath = resolve(projectRoot, 'components', 'ui', fileName)
    const fileExists = existsSync(filePath)

    if (isRegistered && fileExists) continue
    if (!isShadcnComponent(componentId)) continue
    try {
      const shadcnDef = await installShadcnComponent(componentId, projectRoot)
      if (shadcnDef) {
        if (!isRegistered) {
          const result = await cm.register(shadcnDef)
          if (result.success) {
            dsm.updateConfig(result.config)
            cm.updateConfig(result.config)
            pm.updateConfig(result.config)
          }
        }
        installed.push(shadcnDef.id)
      }
    } catch {
      // ignore single failure; page write will still happen, user may see build error
    }
  }
  return { installed }
}

/**
 * Apply modification request
 */
async function applyModification(
  request: ModificationRequest,
  dsm: DesignSystemManager,
  cm: ComponentManager,
  pm: PageManager,
  projectRoot: string,
  aiProvider?: 'claude' | 'openai' | 'auto',
  originalMessage?: string
): Promise<{ success: boolean; message: string; modified: string[] }> {
  switch (request.type) {
    case 'modify-layout-block': {
      const target = request.target
      const instruction = (request.changes as { instruction?: string })?.instruction
      const resolved = await findSharedComponentByIdOrName(projectRoot, target)
      if (!resolved) {
        return {
          success: false,
          message: `Shared component "${target}" not found. Run \`coherent components shared\` to list.`,
          modified: [],
        }
      }
      if (!instruction || typeof instruction !== 'string') {
        return {
          success: false,
          message: 'modify-layout-block requires changes.instruction',
          modified: [],
        }
      }
      const { resolve } = await import('path')
      const fullPath = resolve(projectRoot, resolved.file)
      let currentCode: string
      try {
        currentCode = await readFile(fullPath)
      } catch {
        return { success: false, message: `Could not read ${resolved.file}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.editSharedComponentCode) {
        return {
          success: false,
          message: 'AI provider does not support editing shared component code',
          modified: [],
        }
      }
      const newCode = await ai.editSharedComponentCode(
        currentCode,
        instruction,
        resolved.name
      )
      const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newCode, { isPage: false })
      if (fixes.length > 0) {
        console.log(chalk.dim('  🔧 Post-generation fixes:'))
        fixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
      }
      await writeFile(fullPath, fixedCode)
      printSharedComponentReport({
        id: resolved.id,
        name: resolved.name,
        file: resolved.file,
        instruction: (request.changes as { instruction?: string })?.instruction,
        postFixes: fixes,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Updated ${resolved.id} (${resolved.name}). Change is visible on all pages using it.`,
        modified: [resolved.file],
      }
    }

    case 'link-shared': {
      const pageTarget = request.target
      const changes = request.changes as { sharedIdOrName?: string; blockHint?: string }
      const sharedIdOrName = changes?.sharedIdOrName
      if (!sharedIdOrName) {
        return {
          success: false,
          message: 'link-shared requires changes.sharedIdOrName (e.g. CID-003 or HeroSection)',
          modified: [],
        }
      }
      const resolved = await findSharedComponentByIdOrName(projectRoot, sharedIdOrName)
      if (!resolved) {
        return {
          success: false,
          message: `Shared component "${sharedIdOrName}" not found. Run \`coherent components shared\` to list.`,
          modified: [],
        }
      }
      const config = dsm.getConfig()
      const route =
        pageTarget.startsWith('/')
          ? pageTarget
          : config.pages.find(
              (p) => p.name?.toLowerCase() === pageTarget.toLowerCase() || p.id === pageTarget
            )?.route
      if (!route) {
        return {
          success: false,
          message: `Page "${pageTarget}" not found. Use page name (e.g. About) or route (e.g. /about).`,
          modified: [],
        }
      }
      const pageFilePath = routeToFsPath(projectRoot, route, false)
      let pageCode: string
      try {
        pageCode = await readFile(pageFilePath)
      } catch {
        return { success: false, message: `Could not read ${pageFilePath}`, modified: [] }
      }
      const sharedPath = resolve(projectRoot, resolved.file)
      let sharedCode: string
      try {
        sharedCode = await readFile(sharedPath)
      } catch {
        return { success: false, message: `Could not read ${resolved.file}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.replaceInlineWithShared) {
        return {
          success: false,
          message: 'AI provider does not support replaceInlineWithShared',
          modified: [],
        }
      }
      const newPageCode = await ai.replaceInlineWithShared(
        pageCode,
        sharedCode,
        resolved.name,
        changes?.blockHint
      )
      const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newPageCode, { isPage: true })
      if (fixes.length > 0) {
        console.log(chalk.dim('  🔧 Post-generation fixes:'))
        fixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
      }
      await writeFile(pageFilePath, fixedCode)
      const manifest = await loadManifest(projectRoot)
      const usedIn = manifest.shared.find((e) => e.id === resolved.id)?.usedIn ?? []
      const filePathRel = routePath ? `app/${routePath}/page.tsx` : 'app/page.tsx'
      if (!usedIn.includes(filePathRel)) {
        const nextManifest = updateUsedIn(manifest, resolved.id, [...usedIn, filePathRel])
        await saveManifest(projectRoot, nextManifest)
      }
      printLinkSharedReport({
        sharedId: resolved.id,
        sharedName: resolved.name,
        pageTarget,
        route: route ?? `/${routePath}`,
        postFixes: fixes,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Linked ${resolved.id} (${resolved.name}) to page "${pageTarget}". Inline code replaced.`,
        modified: [filePathRel],
      }
    }

    case 'promote-and-link': {
      const sourcePageName = request.target
      const ch = request.changes as {
        blockHint?: string
        componentName?: string
        targetPages?: string[]
      }
      const blockHint = ch?.blockHint ?? 'section'
      const componentName =
        ch?.componentName ??
        blockHint.replace(/\s+/g, '').replace(/^./, (s) => s.toUpperCase()) + 'Section'
      const targetPages = Array.isArray(ch?.targetPages) ? ch.targetPages : []
      const config = dsm.getConfig()
      const sourcePage = config.pages.find(
        (p) => p.name?.toLowerCase() === sourcePageName.toLowerCase() || p.id === sourcePageName
      )
      if (!sourcePage) {
        return {
          success: false,
          message: `Source page "${sourcePageName}" not found.`,
          modified: [],
        }
      }
      const allPagesToLink = [sourcePageName, ...targetPages]
      const routeToPath = (nameOrRoute: string): string | null => {
        if (nameOrRoute.startsWith('/')) {
          return routeToRelPath(nameOrRoute, false)
        }
        const p = config.pages.find(
          (x) => x.name?.toLowerCase() === nameOrRoute.toLowerCase() || x.id === nameOrRoute
        )
        if (!p?.route) return null
        return routeToRelPath(p.route, false)
      }
      const sourcePath = routeToPath(sourcePageName)
      if (!sourcePath) {
        return { success: false, message: `Could not resolve path for page "${sourcePageName}"`, modified: [] }
      }
      let sourceCode: string
      try {
        sourceCode = await readFile(resolve(projectRoot, sourcePath))
      } catch {
        return { success: false, message: `Could not read ${sourcePath}`, modified: [] }
      }
      const ai = await createAIProvider(aiProvider ?? 'auto')
      if (!ai.extractBlockAsComponent) {
        return {
          success: false,
          message: 'AI provider does not support extractBlockAsComponent',
          modified: [],
        }
      }
      const extractedCode = await ai.extractBlockAsComponent(sourceCode, blockHint, componentName)
      const created = await generateSharedComponent(projectRoot, {
        name: componentName,
        type: 'section',
        code: extractedCode,
        description: `Extracted from ${sourcePageName}: ${blockHint}`,
        usedIn: [],
      })
      const sharedPath = resolve(projectRoot, created.file)
      let sharedCode: string
      try {
        sharedCode = await readFile(sharedPath)
      } catch {
        return { success: false, message: `Could not read created ${created.file}`, modified: [] }
      }
      const usedInFiles: string[] = []
      for (const pageName of allPagesToLink) {
        const relPath = routeToPath(pageName)
        if (!relPath) continue
        const fullPath = resolve(projectRoot, relPath)
        let pageCode: string
        try {
          pageCode = await readFile(fullPath)
        } catch {
          continue
        }
        if (!ai.replaceInlineWithShared) continue
        const newCode = await ai.replaceInlineWithShared(
          pageCode,
          sharedCode,
          created.name,
          blockHint
        )
        const { fixedCode, fixes } = await validateAndFixGeneratedCode(projectRoot, newCode, { isPage: true })
        if (fixes.length > 0) {
          console.log(chalk.dim('  🔧 Post-generation fixes:'))
          fixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
        }
        await writeFile(fullPath, fixedCode)
        usedInFiles.push(relPath)
      }
      const manifest = await loadManifest(projectRoot)
      const nextManifest = updateUsedIn(manifest, created.id, usedInFiles)
      await saveManifest(projectRoot, nextManifest)
      printPromoteAndLinkReport({
        id: created.id,
        name: created.name,
        file: created.file,
        usedInFiles,
      })
      try {
        await writeCursorRules(projectRoot)
      } catch {
        // ignore
      }
      return {
        success: true,
        message: `Created ${created.id} (${created.name}). Linked to ${usedInFiles.length} page(s): ${allPagesToLink.slice(0, 5).join(', ')}${allPagesToLink.length > 5 ? '...' : ''}.`,
        modified: [created.file, ...usedInFiles],
      }
    }

    case 'update-token': {
      const path = request.target
      const value = request.changes.value
      const result = await dsm.updateToken(path, value)
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'add-component': {
      const componentData = request.changes as ComponentDefinition

      if (componentData.source === 'shadcn' && isShadcnComponent(componentData.id)) {
        try {
          const shadcnDef = await installShadcnComponent(componentData.id, projectRoot)
          if (shadcnDef) {
            const mergedData: ComponentDefinition = {
              ...shadcnDef,
              variants:
                componentData.variants && componentData.variants.length > 0
                  ? componentData.variants
                  : shadcnDef.variants,
              sizes:
                componentData.sizes && componentData.sizes.length > 0
                  ? componentData.sizes
                  : shadcnDef.sizes,
            }
            const result = await cm.register(mergedData)
            if (result.success) {
              dsm.updateConfig(result.config)
              cm.updateConfig(result.config)
              pm.updateConfig(result.config)
            }
            return {
              success: result.success,
              message: result.success
                ? `✨ Auto-installed ${componentData.name}`
                : result.message,
              modified: result.modified,
            }
          }
        } catch (error) {
          console.error(`Failed to auto-install ${componentData.name}:`, error)
        }
      }

      const result = await cm.register(componentData)
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'modify-component': {
      const componentId = request.target
      const changes = request.changes as Record<string, unknown> | undefined

      const result = await cm.update(componentId, changes)
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'add-page': {
      const page = request.changes as PageDefinition & {
        pageCode?: string
        pageType?: string
        structuredContent?: Record<string, unknown>
      }

      // Resolve final page code: AI pageCode takes priority over template
      let finalPageCode: string | undefined
      const aiPageCode = typeof page.pageCode === 'string' && page.pageCode.trim() !== '' ? page.pageCode : undefined

      if (aiPageCode) {
        finalPageCode = aiPageCode
        if (DEBUG) console.log(chalk.dim(`  [pageCode] Using AI-generated pageCode (user content priority)`))
      } else if (page.pageType && page.structuredContent) {
        const templateFn = getTemplateForPageType(page.pageType)
        if (templateFn) {
          try {
            const pageName = (page.name || 'Page').replace(/\s+/g, '')
            const opts: TemplateOptions = {
              route: page.route || `/${page.id || 'page'}`,
              pageName,
            }
            finalPageCode = templateFn(page.structuredContent, opts)
            if (DEBUG) console.log(chalk.dim(`  [template] Used "${page.pageType}" template (no pageCode provided)`))
          } catch (err) {
            if (DEBUG) console.log(chalk.dim(`  [template] Failed for "${page.pageType}"`))
          }
        }
      }

      const pageForConfig: PageDefinition = {
        ...page,
        sections: page.sections ?? [],
        ...(finalPageCode ? { generatedWithPageCode: true, sections: [] } : {}),
      }
      delete (pageForConfig as Record<string, unknown>).pageCode
      delete (pageForConfig as Record<string, unknown>).pageType
      delete (pageForConfig as Record<string, unknown>).structuredContent
      let result = await pm.create(pageForConfig)
      // If page route already exists (e.g. home "/"), update instead
      if (!result.success && result.message?.includes('already exists') && pageForConfig.id) {
        result = await pm.update(pageForConfig.id, pageForConfig)
      }
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
        if (finalPageCode) {
          const neededIds = extractComponentIdsFromCode(finalPageCode)
          const { installed } = await ensureComponentsInstalled(neededIds, cm, dsm, pm, projectRoot)
          const config = dsm.getConfig()
          for (const id of installed) {
            await regenerateComponent(id, config, projectRoot)
          }
          if (installed.length > 0) {
            result.modified = [...result.modified, ...installed.map(id => `component:${id}`)]
          }
          const route = page.route || `/${page.id || 'page'}`
          const isAuth = isAuthRoute(route) || isAuthRoute(page.name || page.id || '')
          if (isAuth) {
            await ensureAuthRouteGroup(projectRoot)
          }
          const filePath = routeToFsPath(projectRoot, route, isAuth)
          const { mkdir } = await import('fs/promises')
          const { dirname } = await import('path')
          await mkdir(dirname(filePath), { recursive: true })
          let { fixedCode: codeToWrite, fixes: postFixes } = await validateAndFixGeneratedCode(
            projectRoot,
            finalPageCode,
            { isPage: true }
          )
          const { code: autoFixed, fixes: autoFixes } = autoFixCode(codeToWrite)
          codeToWrite = autoFixed
          const allFixes = [...postFixes, ...autoFixes]
          if (allFixes.length > 0) {
            console.log(chalk.dim('  🔧 Post-generation fixes:'))
            allFixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
          }
          await writeFile(filePath, codeToWrite)

          // Extract structured metadata from generated code
          const pageIdx = dsm.getConfig().pages.findIndex(p => p.id === page.id)
          if (pageIdx !== -1) {
            const cfg = dsm.getConfig()
            ;(cfg.pages[pageIdx] as any).pageAnalysis = analyzePageCode(codeToWrite)
            dsm.updateConfig(cfg)
            cm.updateConfig(cfg)
            pm.updateConfig(cfg)
          }

          // Story 2.11 Part A: warn if page has inline duplicate of a shared section/widget
          const manifestForAudit = await loadManifest(projectRoot)
          await warnInlineDuplicates(
            projectRoot,
            page.name || page.id || route.slice(1),
            codeToWrite,
            manifestForAudit
          )

          const relFilePath = routeToRelPath(route, isAuth)
          printPostGenerationReport({
            action: 'created',
            pageTitle: page.name || page.id || 'Page',
            filePath: relFilePath,
            code: codeToWrite,
            projectRoot,
            route,
            postFixes: postFixes,
            layoutShared: manifestForAudit.shared.filter((c) => c.type === 'layout'),
            allShared: manifestForAudit.shared,
          })

          // Quality validation
          const validRoutes = dsm.getConfig().pages.map((p: any) => p.route)
          const issues = validatePageQuality(codeToWrite, validRoutes)
          const errors = issues.filter(i => i.severity === 'error')

          // One-shot AI retry for pages with 5+ quality errors
          if (errors.length >= 5 && aiProvider) {
            console.log(chalk.yellow(`\n🔄 ${errors.length} quality errors — attempting AI fix for ${page.name || page.id}...`))
            try {
              const ai = await createAIProvider(aiProvider)
              if (ai.editPageCode) {
                const errorList = errors.map(e => `Line ${e.line}: [${e.type}] ${e.message}`).join('\n')
                const instruction = `Fix these quality issues:\n${errorList}\n\nRules:\n- Replace raw Tailwind colors (bg-emerald-500, text-zinc-400, etc.) with semantic tokens (bg-primary, text-muted-foreground, bg-muted, etc.)\n- Ensure heading hierarchy (h1 → h2 → h3, no skipping)\n- Add Label components for form inputs\n- Keep all existing functionality and layout intact`
                const fixedCode = await ai.editPageCode(
                  codeToWrite,
                  instruction,
                  page.name || page.id || 'Page'
                )
                if (fixedCode && fixedCode.length > 100 && /export\s+default/.test(fixedCode)) {
                  const recheck = validatePageQuality(fixedCode, validRoutes)
                  const recheckErrors = recheck.filter(i => i.severity === 'error')
                  if (recheckErrors.length < errors.length) {
                    codeToWrite = fixedCode
                    await writeFile(filePath, codeToWrite)
                    console.log(chalk.green(`   ✔ Quality fix: ${errors.length} → ${recheckErrors.length} errors`))
                  }
                }
              }
            } catch { /* retry failed, keep original */ }
          }

          const report = formatIssues(issues)
          if (report) {
            console.log(chalk.yellow(`\n🔍 Quality check for ${page.name || page.id}:`))
            console.log(chalk.dim(report))
          }
        }
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'update-page': {
      const pageId = request.target
      const changes = request.changes as Record<string, unknown> | undefined
      const instruction = originalMessage || (typeof changes?.instruction === 'string' ? changes.instruction as string : undefined)
      let resolvedPageCode = typeof changes?.pageCode === 'string' && (changes.pageCode as string).trim() !== '' ? changes.pageCode as string : undefined

      if (DEBUG && instruction) console.log(chalk.dim(`  [update-page] instruction: ${instruction.slice(0, 120)}...`))
      if (DEBUG && resolvedPageCode) console.log(chalk.dim(`  [update-page] has pageCode (${resolvedPageCode.length} chars)`))

      const configChanges = { ...changes } as Record<string, unknown>
      delete configChanges.pageCode
      delete configChanges.pageType
      delete configChanges.structuredContent
      delete configChanges.instruction

      const result = await pm.update(pageId, configChanges as Partial<PageDefinition>)
      if (result.success) {
        dsm.updateConfig(result.config)
        cm.updateConfig(result.config)
        pm.updateConfig(result.config)
        const config = dsm.getConfig()
        const pageDef = config.pages.find(
          (p) => p.id === pageId || p.name?.toLowerCase() === String(pageId).toLowerCase()
        )
        if (pageDef?.route) {
          const route = pageDef.route
          const isAuth = isAuthRoute(route) || isAuthRoute(pageDef.name || pageDef.id || '')
          const absPath = routeToFsPath(projectRoot, route, isAuth)

          // If no pageCode but we have an instruction, read current file and apply via AI
          if (!resolvedPageCode && instruction) {
            let currentCode: string | undefined
            try {
              currentCode = await readFile(absPath)
            } catch {
              if (DEBUG) console.log(chalk.dim(`  [update-page] Could not read current file at ${absPath}`))
            }
            if (currentCode) {
              const ai = await createAIProvider(aiProvider ?? 'auto')
              if (ai.editPageCode) {
                console.log(chalk.dim('  ✏️  Applying changes to existing page...'))
                const coreRules = CORE_CONSTRAINTS
                const qualityRules = DESIGN_QUALITY
                const contextualRules = selectContextualRules(instruction)
                const existingRoutes = dsm.getConfig().pages.map((p: any) => p.route).join(', ')
                const routeRules = `\nEXISTING ROUTES: ${existingRoutes}\nAll internal links MUST point to existing routes. Never link to routes not in this list. Use href="#" for missing targets.\n`
                const pagesCtx = buildExistingPagesContext(dsm.getConfig())
                resolvedPageCode = await ai.editPageCode(
                  currentCode,
                  instruction,
                  pageDef.name || pageDef.id || 'Page',
                  `${coreRules}\n${qualityRules}\n${contextualRules}\n${routeRules}\n${pagesCtx}`
                )
                if (DEBUG) console.log(chalk.dim(`  [update-page] AI returned ${resolvedPageCode.length} chars`))
              } else {
                console.log(chalk.yellow('  ⚠ AI provider does not support editPageCode'))
              }
            }
          }

          if (resolvedPageCode) {
            // Mark as pageCode-generated so regenerateFiles won't overwrite
            const pageIdx = dsm.getConfig().pages.findIndex(p => p.id === pageDef.id)
            if (pageIdx !== -1) {
              const updatedConfig = dsm.getConfig()
              ;(updatedConfig.pages[pageIdx] as PageDefinition & { generatedWithPageCode?: boolean }).generatedWithPageCode = true
              updatedConfig.pages[pageIdx].sections = []
              dsm.updateConfig(updatedConfig)
              cm.updateConfig(updatedConfig)
              pm.updateConfig(updatedConfig)
            }

            const neededIds = extractComponentIdsFromCode(resolvedPageCode)
            const { installed } = await ensureComponentsInstalled(neededIds, cm, dsm, pm, projectRoot)
            const latestConfig = dsm.getConfig()
            for (const id of installed) {
              await regenerateComponent(id, latestConfig, projectRoot)
            }
            if (installed.length > 0) {
              result.modified = [...result.modified, ...installed.map(id => `component:${id}`)]
            }
            const { mkdir } = await import('fs/promises')
            const { dirname } = await import('path')
            await mkdir(dirname(absPath), { recursive: true })
            let { fixedCode: codeToWrite, fixes: postFixes } = await validateAndFixGeneratedCode(
              projectRoot,
              resolvedPageCode,
              { isPage: true }
            )
            const { code: autoFixed, fixes: autoFixes } = autoFixCode(codeToWrite)
            codeToWrite = autoFixed
            const allFixes = [...postFixes, ...autoFixes]
            if (allFixes.length > 0) {
              console.log(chalk.dim('  🔧 Post-generation fixes:'))
              allFixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
            }
            await writeFile(absPath, codeToWrite)

            // Extract structured metadata from generated code
            const updatePageIdx = dsm.getConfig().pages.findIndex(p => p.id === pageDef.id)
            if (updatePageIdx !== -1) {
              const cfg = dsm.getConfig()
              ;(cfg.pages[updatePageIdx] as any).pageAnalysis = analyzePageCode(codeToWrite)
              dsm.updateConfig(cfg)
              cm.updateConfig(cfg)
              pm.updateConfig(cfg)
            }

            const manifestForAudit = await loadManifest(projectRoot)
            await warnInlineDuplicates(
              projectRoot,
              pageDef.name || pageDef.id || route.slice(1),
              codeToWrite,
              manifestForAudit
            )

            const relFilePath = routeToRelPath(route, isAuth)
            printPostGenerationReport({
              action: 'updated',
              pageTitle: pageDef.name || pageDef.id || 'Page',
              filePath: relFilePath,
              code: codeToWrite,
              projectRoot,
              route,
              postFixes,
              allShared: manifestForAudit.shared,
              layoutShared: manifestForAudit.shared.filter((c) => c.type === 'layout'),
            })

            const issues = validatePageQuality(codeToWrite)
            const report = formatIssues(issues)
            if (report) {
              console.log(chalk.yellow(`\n🔍 Quality check for ${pageDef.name || pageDef.id}:`))
              console.log(chalk.dim(report))
            }
          } else {
            try {
              let code = await readFile(absPath)
              const { code: fixed, fixes } = autoFixCode(code)
              if (fixes.length > 0) {
                code = fixed
                await writeFile(absPath, code)
                console.log(chalk.dim('  🔧 Auto-fixes applied:'))
                fixes.forEach((f) => console.log(chalk.dim(`     ${f}`)))
              }
              const relFilePath = routeToRelPath(route, isAuth)
              const manifest = await loadManifest(projectRoot)
              printPostGenerationReport({
                action: 'updated',
                pageTitle: pageDef.name || pageDef.id || 'Page',
                filePath: relFilePath,
                code,
                projectRoot,
                route,
                allShared: manifest.shared,
                layoutShared: manifest.shared.filter((c) => c.type === 'layout'),
              })

              const issues = validatePageQuality(code)
              const report = formatIssues(issues)
              if (report) {
                console.log(chalk.yellow(`\n🔍 Quality check for ${pageDef.name || pageDef.id}:`))
                console.log(chalk.dim(report))
              }
            } catch {
              // file may not exist if update only touched config
            }
          }
        }
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'update-navigation': {
      // Navigation updates are handled automatically by PageManager
      return {
        success: true,
        message: 'Navigation updated',
        modified: ['navigation'],
      }
    }

    default:
      return {
        success: false,
        message: `Unknown modification type: ${(request as any).type}`,
        modified: [],
      }
  }
}

/**
 * Convert PascalCase to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * Regenerate component file
 */
async function regenerateComponent(
  componentId: string,
  config: DesignSystemConfig,
  projectRoot: string
): Promise<void> {
  const component = config.components.find(c => c.id === componentId)
  if (!component) {
    return
  }

  const generator = new ComponentGenerator(config)
  const code = await generator.generate(component)
  const fileName = toKebabCase(component.name) + '.tsx'
  const filePath = resolve(projectRoot, 'components', 'ui', fileName)
  await writeFile(filePath, code)
}

/**
 * Regenerate page file
 */
async function regeneratePage(
  pageId: string,
  config: DesignSystemConfig,
  projectRoot: string
): Promise<void> {
  const page = config.pages.find(p => p.id === pageId)
  if (!page) {
    return
  }
  if ((page as PageDefinition & { generatedWithPageCode?: boolean }).generatedWithPageCode) {
    return
  }

  const generator = new PageGenerator(config)
  const appType = config.settings.appType || 'multi-page'
  const code = await generator.generate(page, appType)

  const route = page.route || '/'
  const isAuth = isAuthRoute(route) || isAuthRoute(page.name || page.id || '')
  const filePath = routeToFsPath(projectRoot, route, isAuth)

  const { mkdir } = await import('fs/promises')
  const { dirname } = await import('path')
  await mkdir(dirname(filePath), { recursive: true })

  await writeFile(filePath, code)
}

/**
 * Regenerate root layout and AppNav (navigation from config.navigation)
 */
async function regenerateLayout(
  config: DesignSystemConfig,
  projectRoot: string
): Promise<void> {
  const layout = config.pages[0]?.layout || 'centered'
  const appType = config.settings.appType || 'multi-page'
  const generator = new PageGenerator(config)
  const code = await generator.generateLayout(layout, appType)
  const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
  await writeFile(layoutPath, code)
  if (config.navigation?.enabled && appType === 'multi-page') {
    const appNavCode = generator.generateAppNav()
    const appNavPath = resolve(projectRoot, 'app', 'AppNav.tsx')
    await writeFile(appNavPath, appNavCode)
  }
  // Re-integrate shared layout components (Header/Footer) that were wiped by template regeneration
  try {
    await integrateSharedLayoutIntoRootLayout(projectRoot)
    await ensureAuthRouteGroup(projectRoot)
  } catch { /* manifest may not exist yet */ }
}

/**
 * Regenerate all affected files
 */
async function regenerateFiles(
  modified: string[],
  config: DesignSystemConfig,
  projectRoot: string
): Promise<void> {
  const componentIds = new Set<string>()
  const pageIds = new Set<string>()

  for (const item of modified) {
    if (item.startsWith('component:')) {
      componentIds.add(item.replace('component:', ''))
    } else if (item.startsWith('page:')) {
      pageIds.add(item.replace('page:', ''))
    }
  }

  // Regenerate layout when navigation may have changed (new pages or any change)
  if (config.navigation?.enabled && modified.length > 0) {
    await regenerateLayout(config, projectRoot)
  }

  // Regenerate Tailwind config when components change (safelist depends on classNames)
  if (componentIds.size > 0) {
    const twGen = new TailwindConfigGenerator(config)
    const twPath = resolve(projectRoot, 'tailwind.config.ts')
    const twCjsPath = resolve(projectRoot, 'tailwind.config.cjs')
    if (existsSync(twPath)) {
      await writeFile(twPath, await twGen.generate())
    } else if (existsSync(twCjsPath)) {
      await writeFile(twCjsPath, await twGen.generateCjs())
    }
  }

  // Regenerate components
  for (const componentId of componentIds) {
    await regenerateComponent(componentId, config, projectRoot)
  }

  // Regenerate pages (skip pages generated with AI pageCode — they are already final)
  const pageCodeIds = new Set(
    config.pages
      .filter(p => (p as PageDefinition & { generatedWithPageCode?: boolean }).generatedWithPageCode)
      .map(p => p.id)
  )
  for (const pageId of pageIds) {
    if (pageCodeIds.has(pageId)) continue
    await regeneratePage(pageId, config, projectRoot)
  }
}

/**
 * Show preview of modifications with better formatting
 */
function showPreview(
  requests: ModificationRequest[],
  results: Array<{ success: boolean; message: string; modified: string[] }>,
  config: DesignSystemConfig,
  preflightInstalledNames?: string[]
): void {
  const pairs = requests.map((req, i) => ({ request: req, result: results[i] }))
  const successfulPairs = pairs.filter(({ result }) => result.success)
  const failedPairs = pairs.filter(({ result }) => !result.success)

  const addedPages = successfulPairs.filter(({ request }) => request.type === 'add-page')
  const addedComponents = successfulPairs.filter(
    ({ request }) =>
      request.type === 'add-component' &&
      (request.changes as Record<string, unknown>)?.source === 'shadcn'
  )
  const customComponents = successfulPairs.filter(
    ({ request }) =>
      request.type === 'add-component' &&
      (request.changes as Record<string, unknown>)?.source !== 'shadcn'
  )
  const modifiedComponents = successfulPairs.filter(
    ({ request }) => request.type === 'modify-component'
  )
  const modifiedSharedComponents = successfulPairs.filter(
    ({ request }) => request.type === 'modify-layout-block'
  )
  const modifiedPages = successfulPairs.filter(
    ({ request }) => request.type === 'update-page'
  )
  const tokenChanges = successfulPairs.filter(
    ({ request }) => request.type === 'update-token'
  )

  console.log(chalk.bold.cyan('\n📋 Changes Applied:\n'))

  if (preflightInstalledNames && preflightInstalledNames.length > 0) {
    console.log(chalk.cyan('🔍 Pre-flight check: Installed missing components:'))
    preflightInstalledNames.forEach(name => {
      console.log(chalk.green(`   ✨ Auto-installed ${name}`))
    })
    console.log('')
  }

  if (addedComponents.length > 0) {
    const names = addedComponents
      .map(({ request }) => (request.changes as ComponentDefinition).name)
      .filter(Boolean)
    console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   ✨ Auto-installed: ${names.join(', ')}`))
  }

  if (customComponents.length > 0) {
    const names = customComponents
      .map(({ request }) => (request.changes as ComponentDefinition).name)
      .filter(Boolean)
    if (addedComponents.length === 0) console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   ✨ Created: ${names.join(', ')}`))
  }

  const usedComponentIds = new Set<string>()
  addedPages.forEach(({ request }) => {
    const page = request.changes as PageDefinition
    page.sections?.forEach((s: { componentId?: string }) => {
      if (s.componentId) usedComponentIds.add(s.componentId)
    })
  })
  const newComponentIds = new Set<string>([
    ...addedComponents.map(
      ({ request }) => (request.changes as ComponentDefinition).id
    ),
    ...customComponents.map(
      ({ request }) => (request.changes as ComponentDefinition).id
    ),
  ])
  const reusedIds = [...usedComponentIds].filter(id => !newComponentIds.has(id))

  if (reusedIds.length > 0) {
    if (addedComponents.length === 0 && customComponents.length === 0)
      console.log(chalk.green('📦 Components:'))
    console.log(chalk.white(`   🔄 Reused: ${reusedIds.join(', ')}`))
  }

  if (
    addedComponents.length > 0 ||
    customComponents.length > 0 ||
    reusedIds.length > 0
  ) {
    console.log('')
  }

  if (addedPages.length > 0) {
    console.log(chalk.green('📄 Pages Created:'))
    addedPages.forEach(({ request }) => {
      const page = request.changes as PageDefinition
      const route = page.route || '/'
      console.log(chalk.white(`   ✨ ${page.name || 'Page'}`))
      console.log(chalk.gray(`      Route: ${route}`))
      console.log(chalk.gray(`      Sections: ${page.sections?.length ?? 0}`))
    })
    console.log('')
  }

  if (
    modifiedComponents.length > 0 ||
    modifiedSharedComponents.length > 0 ||
    modifiedPages.length > 0 ||
    tokenChanges.length > 0
  ) {
    console.log(chalk.yellow('🔧 Modified:'))
    modifiedComponents.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    modifiedSharedComponents.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    modifiedPages.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    tokenChanges.forEach(({ result }) => {
      console.log(chalk.white(`   • ${result.message}`))
    })
    console.log('')
  }

  if (failedPairs.length > 0) {
    console.log(chalk.red('❌ Failed modifications:'))
    failedPairs.forEach(({ result }) => {
      console.log(chalk.gray(`   ✖ ${result.message}`))
    })
    console.log('')
  }

  const successCount = successfulPairs.length
  const totalCount = results.length
  if (successCount === totalCount) {
    console.log(
      chalk.green.bold(`✅ Success! ${successCount} modification(s) applied\n`)
    )
  } else {
    console.log(
      chalk.yellow.bold(
        `⚠️  Partial success: ${successCount}/${totalCount} modification(s) applied\n`
      )
    )
  }

  if (addedPages.length > 0) {
    const firstPage = addedPages[0].request.changes as PageDefinition
    const route = firstPage?.route || '/'
    console.log(chalk.cyan("🚀 What's next:\n"))
    console.log(chalk.white('   📺 View in browser:'))
    console.log(chalk.cyan('      coherent preview'))
    console.log(chalk.gray(`      → Opens http://localhost:3000${route}\n`))
    console.log(chalk.white('   🎨 Customize:'))
    console.log(chalk.cyan('      coherent chat "make buttons rounded"'))
    console.log(
      chalk.cyan(
        `      coherent chat "add hero section to ${firstPage?.name ?? 'page'}"`
      )
    )
    console.log('')
  } else if (successCount > 0) {
    console.log(chalk.cyan("🚀 What's next:\n"))
    console.log(chalk.white('   📺 Preview changes:'))
    console.log(chalk.cyan('      coherent preview\n'))
  }
}

// Helper functions
function getResultIcon(type: string): string {
  const icons: Record<string, string> = {
    'add-page': '✨',
    'add-component': '🎨',
    'update-token': '🔄',
    'update-page': '📝',
    'modify-component': '🔧',
    'modify-layout-block': '🧩',
    'link-shared': '🔗',
    'promote-and-link': '📤',
  }
  return icons[type] || '✓'
}

function getActionName(type: string): string {
  const names: Record<string, string> = {
    'add-page': 'Created new page',
    'add-component': 'Created new component',
    'update-token': 'Updated token',
    'update-page': 'Updated page',
    'modify-component': 'Modified component',
    'modify-layout-block': 'Modified shared component',
    'link-shared': 'Linked page to shared component',
    'promote-and-link': 'Promoted block to shared and linked pages',
  }
  return names[type] || type
}

function getTargetName(request: ModificationRequest, config: DesignSystemConfig): string {
  if (request.type === 'add-page') {
    const page = request.changes as PageDefinition
    return page.name || 'Unknown'
  }
  if (request.type === 'add-component') {
    const comp = request.changes as ComponentDefinition
    return comp.name || 'Unknown'
  }
  if (request.type === 'update-token') {
    return request.target || 'Unknown'
  }
  if (request.type === 'modify-layout-block') {
    return request.target || 'Unknown'
  }
  if (request.type === 'link-shared' || request.type === 'promote-and-link') {
    return request.target || 'Unknown'
  }
  if (request.type === 'modify-component' || request.type === 'update-page') {
    const item = request.type === 'modify-component'
      ? config.components.find(c => c.id === request.target)
      : config.pages.find(p => p.id === request.target)
    return item?.name || request.target || 'Unknown'
  }
  return 'Unknown'
}

function getPagePath(page: PageDefinition): string {
  if (!page) return 'unknown'
  const route = page.route === '/' ? '' : page.route
  return `app${route}/page.tsx`
}

/**
 * Human-readable description for recent changes
 */
function getChangeDescription(request: ModificationRequest, config: DesignSystemConfig): string {
  switch (request.type) {
    case 'add-page': {
      const page = request.changes as PageDefinition
      return `Added ${page.name || 'page'} page`
    }
    case 'add-component': {
      const comp = request.changes as ComponentDefinition
      return `Added ${comp.name || 'component'} component`
    }
    case 'update-token':
      return `Updated ${request.target || 'token'}`
    case 'modify-component': {
      const comp = config.components.find(c => c.id === request.target)
      return `Modified ${comp?.name || request.target} component`
    }
    case 'modify-layout-block':
      return `Modified shared component ${request.target}`
    case 'link-shared': {
      const ch = request.changes as { sharedIdOrName?: string }
      return `Linked ${ch?.sharedIdOrName ?? request.target} to page`
    }
    case 'promote-and-link': {
      const ch = request.changes as { componentName?: string }
      return `Promoted ${ch?.componentName ?? request.target} to shared and linked`
    }
    case 'update-page': {
      const page = config.pages.find(p => p.id === request.target)
      return `Updated ${page?.name || request.target} page`
    }
    case 'update-navigation':
      return 'Updated navigation'
    default:
      return request.type
  }
}

/**
 * Chat command implementation
 */
export async function chatCommand(message: string, options: { provider?: string }) {
  const spinner = ora('Processing your request...').start()
  
  // Find project (searches up directory tree)
  const project = requireProject()
  const projectRoot = project.root
  const configPath = project.configPath

  let releaseLock: (() => void) | undefined
  try {
    releaseLock = await acquireProjectLock(projectRoot)
    // Validate provider option
    const validProviders = ['claude', 'openai', 'auto']
    const provider = (options.provider || 'auto').toLowerCase() as 'claude' | 'openai' | 'auto'
    
    if (!validProviders.includes(provider)) {
      spinner.fail('Invalid provider')
      console.error(chalk.red(`\n❌ Invalid provider: ${options.provider}`))
      console.log(chalk.dim(`Valid options: ${validProviders.join(', ')}`))
      process.exit(1)
    }
    
    // Step 1: Load config
    spinner.text = 'Loading design system configuration...'
    const config = await loadConfig(configPath)
    
    // Check version compatibility
    if (config.coherentVersion && config.coherentVersion !== CLI_VERSION) {
      spinner.stop()
      console.log(chalk.yellow('\n⚠️  Version mismatch detected\n'))
      console.log(chalk.gray('   Project created with: ') + chalk.white(`v${config.coherentVersion}`))
      console.log(chalk.gray('   Current CLI version: ') + chalk.white(`v${CLI_VERSION}`))
      console.log(chalk.cyan('\n   💡 Run `coherent update` to apply latest changes to your project.\n'))
      console.log(chalk.dim('   Continuing anyway...\n'))
      spinner.start('Loading design system configuration...')
    }
    
    // Auto-fix globals.css if needed (old format with @apply)
    if (needsGlobalsFix(projectRoot)) {
      spinner.text = 'Fixing globals.css...'
      try {
        fixGlobalsCss(projectRoot, config)
        spinner.succeed('Fixed globals.css')
      } catch (error) {
        spinner.warn('Could not auto-fix globals.css')
      }
      spinner.text = 'Loading design system configuration...'
    }
    
    const dsm = new DesignSystemManager(configPath)
    await dsm.load()

    const cm = new ComponentManager(config)
    const pm = new PageManager(config, cm)

    spinner.succeed('Configuration loaded')

    // Story 3.5: Dark mode intents (handle without AI)
    if (/switch to dark mode|default to dark|make.*dark.*(default|theme)|dark theme/i.test(message)) {
      spinner.start('Setting default theme to dark...')
      const done = await setDefaultDarkTheme(projectRoot)
      spinner.stop()
      if (done) {
        console.log(chalk.green('\n✅ Default theme set to dark. Reload the app to see changes.\n'))
      } else {
        console.log(chalk.yellow('\n⚠️  Could not update layout (app/layout.tsx not found).\n'))
      }
      return
    }
    if (/switch to light mode|default to light|make.*light.*(default|theme)|light theme/i.test(message)) {
      spinner.start('Setting default theme to light...')
      const layoutPath = resolve(projectRoot, 'app/layout.tsx')
      try {
        let layout = await readFile(layoutPath)
        layout = layout.replace(/className="dark"/, '')
        await writeFile(layoutPath, layout)
        const cfg = dsm.getConfig()
        if (cfg.theme) cfg.theme.defaultMode = 'light'
        dsm.save()
        spinner.stop()
        console.log(chalk.green('\n✅ Default theme set to light. Reload the app to see changes.\n'))
      } catch {
        spinner.stop()
        console.log(chalk.yellow('\n⚠️  Could not update layout (app/layout.tsx not found).\n'))
      }
      return
    }
    if (/add dark mode toggle|dark mode toggle|theme toggle/i.test(message)) {
      spinner.start('Adding theme toggle...')
      try {
        const { created, id } = await ensureThemeToggle(projectRoot)
        spinner.stop()
        console.log(chalk.green(`\n✅ ${created ? `Created ${id} (ThemeToggle) and added to layout` : 'ThemeToggle already present; layout updated'}.\n`))
      } catch (e) {
        spinner.fail('Failed to add theme toggle')
        if (e instanceof Error) console.error(chalk.red('\n❌ ' + e.message + '\n'))
      }
      return
    }

    // Step 2: Parse modification request (include shared components for Epic 2 — Story 2.11: all types, reuse first)
    spinner.start('Parsing your request...')
    let manifest = await loadManifest(project.root)

    // Pre-generation: clean orphaned entries so AI doesn't reference deleted components
    const validShared = manifest.shared.filter(s => {
      const fp = resolve(project.root, s.file)
      return existsSync(fp)
    })
    if (validShared.length !== manifest.shared.length) {
      const cleaned = manifest.shared.length - validShared.length
      manifest = { ...manifest, shared: validShared }
      await saveManifest(project.root, manifest)
      if (process.env.COHERENT_DEBUG === '1') {
        console.log(chalk.dim(`[pre-gen] Cleaned ${cleaned} orphaned component(s) from manifest`))
      }
    }

    const sharedComponentsSummary =
      manifest.shared.length > 0
        ? manifest.shared
            .map((e) => {
              const importPath = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
              const desc = e.description ? ` — ${e.description}` : ''
              return `  ${e.id} ${e.name} (${e.type})${desc}\n    Import: @/components/shared/${importPath}`
            })
            .join('\n')
        : undefined
    if (process.env.COHERENT_DEBUG === '1' && sharedComponentsSummary) {
      console.log(chalk.dim('[add-page] sharedComponentsSummary in prompt:\n' + sharedComponentsSummary))
    }

    let requests: ModificationRequest[]
    let uxRecommendations: string | undefined

    const SPLIT_THRESHOLD = 4
    const parseOpts = { sharedComponentsSummary }
    const modCtx = { config, componentManager: cm }

    // Detect multi-page intent upfront to decide strategy before calling AI
    const multiPageHint = /\b(pages?|sections?)\s*[:]\s*\w/i.test(message) ||
      (message.match(/\b(?:registration|about|catal|account|contact|pricing|dashboard|settings|login|sign.?up|blog|portfolio|features)\b/gi) || []).length >= SPLIT_THRESHOLD

    if (multiPageHint) {
      // Proactive split: Phase 1 (plan) + Phase 2 (per-page code)
      try {
        requests = await splitGeneratePages(spinner, message, modCtx, provider, parseOpts)
        uxRecommendations = undefined
      } catch (splitError: any) {
        spinner.warn('Split generation failed — falling back to single-shot...')
        const result = await parseModification(message, modCtx, provider, parseOpts)
        requests = result.requests
        uxRecommendations = result.uxRecommendations
      }
    } else {
      // Single-shot for small requests, with truncation safety net
      try {
        const result = await parseModification(message, modCtx, provider, parseOpts)
        requests = result.requests
        uxRecommendations = result.uxRecommendations

        // Post-hoc check: if single-shot returned 4+ pages, the quality per page is likely low.
        // Re-generate individual pages that have no pageCode.
        const pagesWithoutCode = requests.filter(
          (r) => r.type === 'add-page' && !((r.changes as Record<string, unknown>)?.pageCode)
        )
        if (pagesWithoutCode.length >= SPLIT_THRESHOLD) {
          spinner.text = 'Generating individual pages for better quality...'
          for (let i = 0; i < pagesWithoutCode.length; i++) {
            const page = pagesWithoutCode[i].changes as Record<string, unknown>
            const pageName = (page.name as string) || (page.id as string) || 'page'
            spinner.text = `Generating page ${i + 1}/${pagesWithoutCode.length}: ${pageName}...`
            try {
              const single = await parseModification(
                `Create a page called "${pageName}" at route "${page.route || '/' + (page.id || pageName.toLowerCase())}". ${message}. Generate complete pageCode for this ONE page only.`,
                modCtx, provider, parseOpts
              )
              const codePage = single.requests.find((r: ModificationRequest) => r.type === 'add-page')
              if (codePage) {
                const idx = requests.indexOf(pagesWithoutCode[i])
                if (idx !== -1) requests[idx] = codePage
              }
            } catch { /* keep plan-only version */ }
          }
        }
      } catch (firstError: any) {
        const isTruncated = firstError?.code === 'RESPONSE_TRUNCATED'
        const isJsonError = firstError?.message?.includes('Unterminated string') ||
          firstError?.message?.includes('Unexpected end of JSON') ||
          firstError?.message?.includes('Unexpected token')
        if (isTruncated || isJsonError) {
          spinner.warn('Response too large — splitting into smaller requests...')
          try {
            requests = await splitGeneratePages(spinner, message, modCtx, provider, parseOpts)
            uxRecommendations = undefined
          } catch {
            throw firstError
          }
        } else {
          throw firstError
        }
      }
    }

    if (requests.length === 0) {
      spinner.fail('No modifications found in your request')
      console.log(chalk.yellow('\n💡 Try being more specific, e.g.:'))
      console.log(chalk.dim('  - "make buttons blue"'))
      console.log(chalk.dim('  - "add a pricing page"'))
      console.log(chalk.dim('  - "change primary color to green"'))
      return
    }

    spinner.succeed(`Parsed ${requests.length} modification(s)`)

    // Step 3: Apply defaults BEFORE any validation (normalize AI output)
    let normalizedRequests = requests.map(req => applyDefaults(req))

    // Step 3.1: Resilience layer — fix wrong action types, target mismatches, missing fields
    normalizedRequests = normalizedRequests
      .map((req) => {
        const result = normalizeRequest(req, dsm.getConfig())
        if ('error' in result) {
          console.log(chalk.yellow(`  ⚠ Skipped: ${result.error}`))
          return null
        }
        if (result.type !== req.type) {
          console.log(chalk.dim(`  ℹ Adjusted: ${req.type} → ${result.type} (target: ${req.target})`))
        }
        return result
      })
      .filter((r): r is ModificationRequest => r !== null)

    if (normalizedRequests.length === 0) {
      spinner.fail('All modifications were unrecoverable')
      return
    }

    // Step 3.5: Pre-flight component check and auto-install for add-page requests
    const pageRequests = normalizedRequests.filter(
      (r): r is ModificationRequest & { type: 'add-page' } => r.type === 'add-page'
    )
    const preflightInstalledIds: string[] = []
    const allNpmImportsFromPages = new Set<string>()

    for (const pageRequest of pageRequests) {
      const page = pageRequest.changes as PageDefinition & {
        sections?: Array<{ componentId?: string; props?: { fields?: Array<{ component?: string }> } }>
        pageCode?: string
      }

      const neededComponentIds = new Set<string>()
      page.sections?.forEach((section: { componentId?: string; props?: { fields?: Array<{ component?: string }> } }) => {
        if (section.componentId) {
          neededComponentIds.add(section.componentId)
        }
        if (section.props?.fields && Array.isArray(section.props.fields)) {
          section.props.fields.forEach((field: { component?: string }) => {
            if (field.component) {
              neededComponentIds.add(field.component)
            }
          })
        }
      })
      // Scan pageCode for component imports (extract component name after ui/ or shared/)
      if (typeof page.pageCode === 'string' && page.pageCode.trim() !== '') {
        const importMatches = page.pageCode.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
        for (const m of importMatches) {
          if (m[1]) neededComponentIds.add(m[1])
        }
        extractNpmPackagesFromCode(page.pageCode).forEach(p => allNpmImportsFromPages.add(p))
      }

      // If AI returned a pageType with template support, pre-generate to extract deps
      const pageAny = page as Record<string, unknown>
      if (pageAny.pageType && pageAny.structuredContent) {
        const tmplFn = getTemplateForPageType(pageAny.pageType as string)
        if (tmplFn) {
          try {
            const preview = tmplFn(pageAny.structuredContent as Record<string, unknown>, {
              route: page.route || '/preview',
              pageName: (page.name || 'Page').replace(/\s+/g, ''),
            })
            const tmplImports = preview.matchAll(/@\/components\/ui\/([a-z0-9-]+)/g)
            for (const m of tmplImports) {
              if (m[1]) neededComponentIds.add(m[1])
            }
            extractNpmPackagesFromCode(preview).forEach(p => allNpmImportsFromPages.add(p))
          } catch { /* template generation failed — will retry in applyModification */ }
        }
      }

      if (DEBUG) {
        console.log(chalk.gray('\n[DEBUG] Pre-flight analysis:'))
        console.log(chalk.gray(`  Needed components: ${Array.from(neededComponentIds).join(', ')}`))
        console.log(chalk.gray(`  Page sections: ${page.sections?.length || 0}`))
        if (page.sections?.[0]?.props?.fields) {
          console.log(chalk.gray(`  First section has ${page.sections[0].props.fields.length} fields`))
          page.sections[0].props.fields.forEach((f: { component?: string }, i: number) => {
            console.log(chalk.gray(`    Field ${i}: component=${f.component}`))
          })
        }
        console.log('')
      }

      // Filter out folder names that aren't actual component IDs
      const INVALID_COMPONENT_IDS = new Set(['ui', 'shared', 'lib', 'utils', 'hooks', 'app', 'components'])
      for (const id of INVALID_COMPONENT_IDS) neededComponentIds.delete(id)

      // Check which components are missing
      const missingComponents: string[] = []
      for (const componentId of neededComponentIds) {
        const exists = cm.read(componentId)
        if (DEBUG) console.log(chalk.gray(`    Checking ${componentId}: ${exists ? 'EXISTS' : 'MISSING'}`))
        if (!exists) {
          missingComponents.push(componentId)
        }
      }

      if (missingComponents.length > 0) {
        spinner.stop()
        console.log(chalk.cyan('\n🔍 Pre-flight check: Installing missing components...\n'))

        for (const componentId of missingComponents) {
          if (DEBUG) {
            console.log(chalk.gray(`    [DEBUG] Trying to install: ${componentId}`))
            console.log(chalk.gray(`    [DEBUG] isShadcnComponent(${componentId}): ${isShadcnComponent(componentId)}`))
          }

          if (isShadcnComponent(componentId)) {
            try {
              const shadcnDef = await installShadcnComponent(componentId, projectRoot)
              if (DEBUG) console.log(chalk.gray(`    [DEBUG] shadcnDef for ${componentId}: ${shadcnDef ? 'OK' : 'NULL'}`))

              if (shadcnDef) {
                if (DEBUG) console.log(chalk.gray(`    [DEBUG] Registering ${shadcnDef.id} (${shadcnDef.name})`))
                const result = await cm.register(shadcnDef)
                if (DEBUG) {
                  console.log(
                    chalk.gray(
                      `    [DEBUG] Register result: ${result.success ? 'SUCCESS' : 'FAILED'}${!result.success && result.message ? ` - ${result.message}` : ''}`
                    )
                  )
                }

                if (result.success) {
                  preflightInstalledIds.push(shadcnDef.id)
                  console.log(chalk.green(`   ✨ Auto-installed ${shadcnDef.name} component`))
                  const updatedConfig = result.config
                  dsm.updateConfig(updatedConfig)
                  cm.updateConfig(updatedConfig)
                  pm.updateConfig(updatedConfig)
                }
              }
            } catch (error) {
              console.log(chalk.red(`   ❌ Failed to install ${componentId}:`))
              console.log(chalk.red(`      ${error instanceof Error ? error.message : error}`))
              if (error instanceof Error && error.stack) {
                console.log(chalk.gray(`      ${error.stack.split('\n')[1]}`))
              }
            }
          } else {
            console.log(chalk.yellow(`   ⚠️  Component ${componentId} not available`))
          }
        }
        console.log('')
        spinner.start('Applying modifications...')
      }
    }

    // Pre-flight npm deps: required packages + any imported in pageCode
    const installedPkgs = getInstalledPackages(projectRoot)
    const neededPkgs = new Set([...COHERENT_REQUIRED_PACKAGES, ...allNpmImportsFromPages])
    const toInstallNpm = [...neededPkgs].filter(p => !installedPkgs.has(p))
    if (toInstallNpm.length > 0) {
      spinner.stop()
      console.log(chalk.cyan(`\n📦 Auto-installing missing dependencies: ${toInstallNpm.join(', ')}\n`))
      const ok = await installPackages(projectRoot, toInstallNpm)
      if (!ok) console.log(chalk.yellow(`   Run manually: npm install ${toInstallNpm.join(' ')}\n`))
      spinner.start('Applying modifications...')
    }

    // Filter out duplicate add-component requests for components installed in pre-flight
    const preflightComponentIds = new Set(preflightInstalledIds)
    normalizedRequests = normalizedRequests.filter(req => {
      if (req.type === 'add-component') {
        const componentId = (req.changes as Record<string, unknown>)?.id as string | undefined
        if (componentId && preflightComponentIds.has(componentId)) {
          if (DEBUG) {
            console.log(
              chalk.gray(
                `[DEBUG] Filtered duplicate add-component: ${componentId} (already installed in pre-flight)`
              )
            )
          }
          return false
        }
      }
      return true
    })

    if (DEBUG && preflightComponentIds.size > 0) {
      console.log(chalk.gray(`[DEBUG] Remaining requests after filtering: ${normalizedRequests.length}`))
    }

    // Step 3.9: Create backup before applying changes
    try {
      const { createBackup } = await import('../utils/backup.js')
      createBackup(projectRoot, message)
      if (DEBUG) console.log(chalk.dim('[backup] Created snapshot'))
    } catch {
      // non-critical
    }

    // Step 4: Apply modifications (validation happens inside managers)
    spinner.start('Applying modifications...')
    const results: Array<{ success: boolean; message: string; modified: string[] }> = []

    for (const request of normalizedRequests) {
      const result = await applyModification(request, dsm, cm, pm, projectRoot, provider, message)
      results.push(result)
    }

    // Epic 2.6: Proactive shared layout — extract header/footer from generated pages into shared components
    const anyPageGenerated = normalizedRequests.some(
      (req, i) => (req.type === 'add-page' || req.type === 'update-page') && results[i]?.success
    )
    if (anyPageGenerated) {
      const generatedPageFiles = normalizedRequests
        .filter((req, i) => (req.type === 'add-page' || req.type === 'update-page') && results[i]?.success)
        .map(req => {
          const page = req.changes as PageDefinition & { route?: string }
          const route = page.route || `/${page.id || 'page'}`
          return routeToFsPath(projectRoot, route, isAuthRoute(route))
        })
        .filter(f => existsSync(f))
      try {
        await extractAndShareLayoutComponents(projectRoot, generatedPageFiles)
      } catch (err) {
        if (DEBUG) console.log(chalk.dim('Shared layout extraction failed:', err))
      }
    }

    // Step 4.5: Auto-scaffold linked pages (if enabled)
    const currentConfig = dsm.getConfig()
    const autoScaffoldEnabled = currentConfig.settings.autoScaffold === true
    const scaffoldedPages: Array<{ route: string; name: string }> = []

    if (autoScaffoldEnabled) {
      const addedPageRequests = normalizedRequests
        .map((req, i) => ({ req, result: results[i] }))
        .filter(({ req, result }) => req.type === 'add-page' && result.success)

      const allLinkedRoutes = new Set<string>()

      for (const { req } of addedPageRequests) {
        const page = req.changes as PageDefinition & { pageCode?: string; route?: string }
        const route = page.route || `/${page.id || 'page'}`
        const pageFilePath = routeToFsPath(projectRoot, route, false)

        let pageCode = ''
        if (existsSync(pageFilePath)) {
          try { pageCode = readFileSync(pageFilePath, 'utf-8') } catch { /* */ }
        }

        const codeLinks = extractInternalLinks(pageCode)
        codeLinks.forEach(l => allLinkedRoutes.add(l))

        const authRelated = AUTH_FLOW_PATTERNS[route]
        if (authRelated) authRelated.forEach(l => allLinkedRoutes.add(l))
      }

      const existingRoutes = new Set(
        currentConfig.pages.map(p => p.route).filter(Boolean)
      )
      const missingRoutes = [...allLinkedRoutes].filter(route => {
        if (existingRoutes.has(route)) return false
        if (existsSync(routeToFsPath(projectRoot, route, false))) return false
        if (existsSync(routeToFsPath(projectRoot, route, true))) return false
        return true
      })

      const SCAFFOLD_AI_LIMIT = 10
      if (missingRoutes.length > 0 && missingRoutes.length <= SCAFFOLD_AI_LIMIT) {
        spinner.stop()
        console.log(chalk.cyan(`\n🔗 Auto-scaffolding ${missingRoutes.length} linked page(s)...`))
        console.log(chalk.dim(`   (${missingRoutes.length} additional AI call(s) — disable with settings.autoScaffold: false in config)\n`))

        for (const linkedRoute of missingRoutes) {
          const pageName = linkedRoute.slice(1)
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')

          try {
            const scaffoldSpinner = ora(`  Creating "${pageName}" (${linkedRoute})...`).start()
            const { requests: linkedRequests } = await parseModification(
              `add ${pageName} page at route ${linkedRoute}`,
              { config: dsm.getConfig(), componentManager: cm },
              provider
            )

            for (const raw of linkedRequests.map(r => applyDefaults(r))) {
              const linkedReq = normalizeRequest(raw, dsm.getConfig())
              if ('error' in linkedReq) {
                console.log(chalk.yellow(`  ⚠ Skipped scaffold: ${linkedReq.error}`))
                continue
              }
              const linkedResult = await applyModification(linkedReq, dsm, cm, pm, projectRoot, provider)
              if (linkedResult.success) {
                results.push(linkedResult)
                normalizedRequests.push(linkedReq)
                scaffoldedPages.push({ route: linkedRoute, name: pageName })
                scaffoldSpinner.succeed(`  Created "${pageName}" at ${linkedRoute}`)
              } else {
                scaffoldSpinner.warn(`  Could not create "${pageName}": ${linkedResult.message}`)
              }
            }
          } catch (err) {
            console.log(chalk.yellow(`  ⚠ Could not scaffold ${linkedRoute}: ${err instanceof Error ? err.message : 'unknown error'}`))
          }
        }
        console.log('')
        spinner.start('Finalizing...')
      } else if (missingRoutes.length > SCAFFOLD_AI_LIMIT) {
        spinner.stop()
        console.log(chalk.yellow(`\n⚠ Found ${missingRoutes.length} linked pages — creating placeholder pages (too many for AI generation).`))
        for (const linkedRoute of missingRoutes) {
          const pageName = linkedRoute.slice(1)
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || 'Page'

          const isAuth = isAuthRoute(linkedRoute)
          const filePath = routeToFsPath(projectRoot, linkedRoute, isAuth)
          if (isAuth) await ensureAuthRouteGroup(projectRoot)
          const dir = resolve(filePath, '..')
          if (!existsSync(dir)) {
            const { mkdirSync } = await import('fs')
            mkdirSync(dir, { recursive: true })
          }
          const placeholderCode = `export default function ${pageName.replace(/\s/g, '')}Page() {\n  return (\n    <div className="flex min-h-[60vh] items-center justify-center">\n      <div className="text-center space-y-4">\n        <h1 className="text-3xl font-bold">${pageName}</h1>\n        <p className="text-muted-foreground">This page is under construction.</p>\n      </div>\n    </div>\n  )\n}\n`
          await writeFile(filePath, placeholderCode)
          scaffoldedPages.push({ route: linkedRoute, name: `${pageName} (placeholder)` })
        }
        console.log(chalk.cyan(`   Created ${missingRoutes.length} placeholder pages. Use \`coherent chat\` to fill them.\n`))
        spinner.start('Finalizing...')
      }
    }

    // Get updated config
    const updatedConfig = dsm.getConfig()

    // Step 4.5: Auto-detect theme mode from user message and update config + layout
    const darkMatch = /\bdark\s*(theme|mode|background)\b/i.test(message)
    const lightMatch = /\blight\s*(theme|mode|background)\b/i.test(message)
    if (darkMatch || lightMatch) {
      const targetMode = darkMatch ? 'dark' : 'light'
      const currentConfig = dsm.getConfig()
      if (currentConfig.theme.defaultMode !== targetMode) {
        currentConfig.theme.defaultMode = targetMode as 'light' | 'dark'
        dsm.updateConfig(currentConfig)
        if (DEBUG) console.log(chalk.dim(`  [theme] Set defaultMode to "${targetMode}"`))
      }
      const layoutPath = resolve(projectRoot, 'app', 'layout.tsx')
      try {
        let layoutCode = await readFile(layoutPath)
        if (targetMode === 'dark' && !layoutCode.includes('className="dark"')) {
          layoutCode = layoutCode.replace(/<html\s+lang="en"/, '<html lang="en" className="dark"')
          await writeFile(layoutPath, layoutCode)
          console.log(chalk.dim(`  🌙 Applied dark theme to layout`))
        } else if (targetMode === 'light' && layoutCode.includes('className="dark"')) {
          layoutCode = layoutCode.replace(' className="dark"', '')
          await writeFile(layoutPath, layoutCode)
          console.log(chalk.dim(`  ☀️ Applied light theme to layout`))
        }
      } catch {
        // layout might not exist yet
      }
    }

    // Step 5: Save config
    spinner.text = 'Saving configuration...'
    await dsm.save()
    spinner.succeed('Configuration saved')

    // Step 6: Regenerate affected files (include pre-flight installed components + scaffolded pages)
    const allModified = new Set<string>()
    results.forEach(r => r.modified.forEach(m => allModified.add(m)))
    preflightInstalledIds.forEach(id => allModified.add(`component:${id}`))
    scaffoldedPages.forEach(({ route }) => {
      allModified.add(`page:${route.slice(1) || 'home'}`)
    })

    if (allModified.size > 0) {
      spinner.start('Regenerating affected files...')
      await regenerateFiles(Array.from(allModified), updatedConfig, projectRoot)
      spinner.succeed('Files regenerated')
    }

    // Step 7: Record recent changes for status command
    const successfulPairs = normalizedRequests
      .map((request, index) => ({ request, result: results[index] }))
      .filter(({ result }) => result.success)
    if (successfulPairs.length > 0) {
      const changes: RecentChange[] = successfulPairs.map(({ request }) => ({
        type: request.type,
        description: getChangeDescription(request, updatedConfig),
        timestamp: new Date().toISOString(),
      }))
      appendRecentChanges(projectRoot, changes)
    }

    // Step 8: Show preview
    spinner.stop()
    const preflightNames = preflightInstalledIds
      .map(id => updatedConfig.components.find(c => c.id === id)?.name)
      .filter(Boolean) as string[]
    showPreview(normalizedRequests, results, updatedConfig, preflightNames)

    if (scaffoldedPages.length > 0) {
      console.log(chalk.cyan('🔗 Auto-scaffolded linked pages:'))
      scaffoldedPages.forEach(({ route, name }) => {
        console.log(chalk.white(`   ✨ ${name} → ${route}`))
      })
      console.log('')
    }

    // Step 9: Write UX recommendations to file and show in console
    if (uxRecommendations) {
      const recPath = resolve(projectRoot, 'recommendations.md')
      const section = `\n\n---\n\n## ${new Date().toISOString().slice(0, 10)}\n\n${uxRecommendations}\n`
      try {
        if (!existsSync(recPath)) {
          await writeFile(recPath, '# UX/UI Recommendations\n\nRecommendations are added here when you use `coherent chat` and the AI suggests improvements.\n')
        }
        await appendFile(recPath, section)
        console.log(chalk.cyan('\n📋 UX Recommendations:'))
        for (const line of uxRecommendations.split('\n').filter(Boolean)) {
          console.log(chalk.dim(`   ${line}`))
        }
        console.log(chalk.dim('   → Saved to /design-system/docs/recommendations'))
      } catch (e) {
        console.log(chalk.yellow('\n⚠️  Could not write recommendations.md: ' + (e instanceof Error ? e.message : String(e))))
        console.log(chalk.dim('Recommendations:\n') + uxRecommendations)
      }
    }

  } catch (error) {
    spinner.fail('Chat command failed')
    console.error(chalk.red('\n✖ Chat command failed'))

    // Zod validation error (AI generated incomplete data) — ZodError has .issues
    const zodError = error as { issues?: Array<{ path: (string | number)[]; message: string }> }
    const issues = zodError.issues || (error as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    if (issues && Array.isArray(issues)) {
      console.log(chalk.yellow('\n⚠️  AI generated incomplete data. Missing or invalid fields:'))
      issues.forEach((err: { path: (string | number)[]; message: string }) => {
        console.log(chalk.gray(`   • ${err.path.join('.')}: ${err.message}`))
      })
      console.log(chalk.cyan('\n💡 Try being more specific, e.g.:'))
      console.log(chalk.white('   coherent chat "add a dashboard page with hero section using Button component"'))
      console.log(chalk.white('   coherent chat "add pricing page"'))
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message))
      // JSON parse error (truncated or invalid AI response) — suggest smaller steps
      if (
        error.message.includes('Unterminated string') ||
        error.message.includes('Unexpected end of JSON') ||
        (error.message.includes('Failed to parse modification') && error.message.includes('JSON'))
      ) {
        console.log(chalk.yellow('\n💡 The AI response was too large or contained invalid JSON. Try splitting your request:'))
        console.log(chalk.white('   coherent chat "add dashboard page with stats and recent activity"'))
        console.log(chalk.white('   coherent chat "add account page"'))
        console.log(chalk.white('   coherent chat "add settings page"'))
      }
      // Provider-specific error messages
      else if (
        error.message.includes('API key not found') ||
        error.message.includes('ANTHROPIC_API_KEY') ||
        error.message.includes('OPENAI_API_KEY')
      ) {
        const isOpenAI = error.message.includes('OpenAI') || (typeof provider !== 'undefined' && provider === 'openai')
        const providerName = isOpenAI ? 'OpenAI' : 'Anthropic Claude'
        const envVar = isOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
        const url = isOpenAI ? 'https://platform.openai.com' : 'https://console.anthropic.com'

        console.log(chalk.yellow('\n💡 Setup Instructions:'))
        console.log(chalk.dim(`  1. Get your ${providerName} API key from: ${url}`))
        console.log(chalk.dim('  2. Create a .env file in the current directory:'))
        console.log(chalk.cyan(`     echo "${envVar}=your_key_here" > .env`))
        console.log(chalk.dim('  3. Or export it in your shell:'))
        console.log(chalk.cyan(`     export ${envVar}=your_key_here`))

        if (isOpenAI) {
          console.log(chalk.dim('\n  Also ensure "openai" package is installed:'))
          console.log(chalk.cyan('     npm install openai'))
        }
      }
    } else {
      console.error(chalk.red('Unknown error occurred'))
    }
    console.log('')
    process.exit(1)
  } finally {
    releaseLock?.()
  }
}
