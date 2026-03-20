import type ora from 'ora'
import { ComponentManager, type DesignSystemConfig, type ModificationRequest } from '@getcoherent/core'
import { parseModification } from '../../agents/modifier.js'
import { summarizePageAnalysis } from '../../utils/page-analyzer.js'
import { extractPageNamesFromMessage, inferRelatedPages, impliesFullWebsite } from './request-parser.js'
import { deduplicatePages, readAnchorPageCodeFromDisk } from './utils.js'
import { pMap } from '../../utils/concurrency.js'

function buildExistingPagesContext(config: DesignSystemConfig): string {
  const pages = config.pages || []
  const analyzed = pages.filter((p: any) => p.pageAnalysis)
  if (analyzed.length === 0) return ''

  const lines = analyzed.map((p: any) => {
    return summarizePageAnalysis(p.name || p.id, p.route, p.pageAnalysis)
  })

  let ctx = `EXISTING PAGES CONTEXT:\n${lines.join('\n')}\n\nUse consistent component choices, spacing, and layout patterns across all pages. Match the style and structure of existing pages.`

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

function extractStyleContext(pageCode: string): string {
  const unique = (arr: string[]) => [...new Set(arr)]

  const cardClasses = (pageCode.match(/className="[^"]*(?:rounded|border|shadow|bg-card)[^"]*"/g) || [])
    .map(m => m.replace(/className="|"/g, ''))
    .filter(c => c.includes('rounded') || c.includes('border') || c.includes('card'))
  const sectionSpacing = unique(pageCode.match(/py-\d+(?:\s+md:py-\d+)?/g) || [])
  const headingStyles = unique(pageCode.match(/text-(?:\d*xl|lg)\s+font-(?:bold|semibold|medium)/g) || [])
  const colorPatterns = unique(
    (
      pageCode.match(
        /(?:text|bg|border)-(?:primary|secondary|muted|accent|card|destructive|foreground|background)\S*/g,
      ) || ([] as string[])
    ).concat(
      pageCode.match(
        /(?:text|bg|border)-(?:emerald|blue|violet|rose|amber|zinc|slate|gray|green|red|orange|indigo|purple|teal|cyan)\S*/g,
      ) || [],
    ),
  )
  const iconPatterns = unique(pageCode.match(/(?:rounded-\S+\s+)?p-\d+(?:\.\d+)?\s*(?:bg-\S+)?/g) || []).filter(
    p => p.includes('bg-') || p.includes('rounded'),
  )
  const buttonPatterns = unique(
    (pageCode.match(/className="[^"]*(?:hover:|active:)[^"]*"/g) || [])
      .map(m => m.replace(/className="|"/g, ''))
      .filter(c => c.includes('px-') || c.includes('py-') || c.includes('rounded')),
  )
  const bgPatterns = unique(pageCode.match(/bg-(?:muted|card|background|zinc|slate|gray)\S*/g) || [])
  const gapPatterns = unique(pageCode.match(/gap-\d+/g) || [])
  const gridPatterns = unique(pageCode.match(/grid-cols-\d+|md:grid-cols-\d+|lg:grid-cols-\d+/g) || [])
  const containerPatterns = unique(pageCode.match(/container\s+max-w-\S+|max-w-\d+xl\s+mx-auto/g) || [])

  const lines: string[] = []
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

  return `STYLE CONTEXT (match these patterns exactly for visual consistency with the anchor page):
${lines.map(l => `  - ${l}`).join('\n')}`
}

const VALID_NAV_TYPES = new Set(['header', 'sidebar', 'both'])

export function parseNavTypeFromPlan(planResult: Record<string, unknown>): 'header' | 'sidebar' | 'both' {
  const nav = planResult.navigation as Record<string, unknown> | undefined | null
  if (nav && typeof nav.type === 'string' && VALID_NAV_TYPES.has(nav.type)) {
    return nav.type as 'header' | 'sidebar' | 'both'
  }
  return 'header'
}

export { buildExistingPagesContext, extractStyleContext }

export type SplitGenerateParseOpts = {
  sharedComponentsSummary?: string
  /** When set and the root/anchor page exists on disk, skip Phase 2 AI and reuse file for style context */
  projectRoot?: string
}

export async function splitGeneratePages(
  spinner: ReturnType<typeof ora>,
  message: string,
  modCtx: { config: DesignSystemConfig; componentManager: InstanceType<typeof ComponentManager> },
  provider: Parameters<typeof parseModification>[2],
  parseOpts: SplitGenerateParseOpts,
): Promise<ModificationRequest[]> {
  let pageNames: Array<{ name: string; id: string; route: string }> = []

  spinner.start('Phase 1/4 — Planning pages...')
  try {
    const planResult = await parseModification(message, modCtx, provider, { ...parseOpts, planOnly: true })
    const pageReqs = planResult.requests.filter((r: ModificationRequest) => r.type === 'add-page')
    pageNames = pageReqs.map((r: ModificationRequest) => {
      const c = r.changes as Record<string, unknown>
      const name = (c.name as string) || (c.id as string) || 'page'
      const id = (c.id as string) || name.toLowerCase().replace(/\s+/g, '-')
      const route = (c.route as string) || `/${id}`
      return { name, id, route }
    })

    const detectedNavType = parseNavTypeFromPlan(planResult as unknown as Record<string, unknown>)
    if (detectedNavType !== 'header' && modCtx.config.navigation) {
      modCtx.config.navigation.type = detectedNavType
    }

    const planRaw = planResult as unknown as Record<string, unknown>
    if (typeof planRaw.appName === 'string' && planRaw.appName && modCtx.config.name === 'My App') {
      modCtx.config.name = planRaw.appName
    }
  } catch {
    spinner.text = 'AI plan failed — extracting pages from your request...'
  }

  if (modCtx.config.name === 'My App') {
    const nameFromPrompt = extractAppNameFromPrompt(message)
    if (nameFromPrompt) modCtx.config.name = nameFromPrompt
  }

  if (pageNames.length === 0) {
    pageNames = extractPageNamesFromMessage(message)
  }
  if (pageNames.length === 0) {
    spinner.fail('Could not determine pages to create')
    return []
  }

  pageNames = deduplicatePages(pageNames)

  const hasHomePage = pageNames.some(p => p.route === '/')
  if (!hasHomePage) {
    const userPages = (modCtx.config.pages || []).filter(
      (p: any) => p.id !== 'home' && p.id !== 'new' && p.route !== '/',
    )
    const isFreshProject = userPages.length === 0
    if (isFreshProject || impliesFullWebsite(message)) {
      pageNames.unshift({ name: 'Home', id: 'home', route: '/' })
    }
  }

  const existingRoutes = new Set((modCtx.config.pages || []).map((p: any) => p.route).filter(Boolean))
  const inferred = inferRelatedPages(pageNames).filter(p => !existingRoutes.has(p.route))
  if (inferred.length > 0) {
    pageNames.push(...inferred)
    pageNames = deduplicatePages(pageNames)
  }

  const allRoutes = pageNames.map(p => p.route).join(', ')
  const allPagesList = pageNames.map(p => `${p.name} (${p.route})`).join(', ')
  const inferredNote = inferred.length > 0 ? ` (${inferred.length} auto-inferred)` : ''
  spinner.succeed(`Phase 1/4 — Found ${pageNames.length} pages${inferredNote}: ${allPagesList}`)

  const homeIdx = pageNames.findIndex(p => p.route === '/')
  const homePage = homeIdx !== -1 ? pageNames[homeIdx] : pageNames[0]
  const remainingPages = pageNames.filter((_, i) => i !== (homeIdx !== -1 ? homeIdx : 0))

  const projectRoot = parseOpts.projectRoot
  let homeRequest: ModificationRequest | null = null
  let homePageCode = ''
  let reusedExistingAnchor = false

  if (projectRoot && remainingPages.length > 0) {
    const existingCode = readAnchorPageCodeFromDisk(projectRoot, homePage.route)
    if (existingCode) {
      reusedExistingAnchor = true
      homePageCode = existingCode
      spinner.start(`Phase 2/4 — Loading ${homePage.name} from disk (style anchor)...`)
      spinner.succeed(`Phase 2/4 — Reused existing ${homePage.name} page (skipped AI regeneration)`)
    }
  }

  if (!reusedExistingAnchor) {
    spinner.start(`Phase 2/4 — Generating ${homePage.name} page (sets design direction)...`)
    try {
      const homeResult = await parseModification(
        `Create ONE page called "${homePage.name}" at route "${homePage.route}". Context: ${message}. This REPLACES the default placeholder page — generate a complete, content-rich landing page for the project described above. Generate complete pageCode. Include a branded site-wide <header> with navigation links to ALL these pages: ${allPagesList}. Use these EXACT routes in navigation: ${allRoutes}. Include a <footer> at the bottom. Make it visually polished — this page sets the design direction for the entire site. Do not generate other pages.`,
        modCtx,
        provider,
        parseOpts,
      )
      const codePage = homeResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
      if (codePage) {
        homeRequest = codePage
        homePageCode = ((codePage.changes as Record<string, unknown>)?.pageCode as string) || ''
      }
    } catch {
      /* handled below */
    }

    if (!homeRequest) {
      homeRequest = {
        type: 'add-page',
        target: 'new',
        changes: { id: homePage.id, name: homePage.name, route: homePage.route },
      }
    }
    spinner.succeed(`Phase 2/4 — ${homePage.name} page generated`)
  }

  spinner.start('Phase 3/4 — Extracting design patterns...')
  const styleContext = homePageCode ? extractStyleContext(homePageCode) : ''
  if (styleContext) {
    const lineCount = styleContext.split('\n').length - 1
    const source = reusedExistingAnchor ? `${homePage.name} (existing file)` : homePage.name
    spinner.succeed(`Phase 3/4 — Extracted ${lineCount} style patterns from ${source}`)
  } else {
    spinner.succeed('Phase 3/4 — No style patterns extracted (anchor page had no code)')
  }

  if (remainingPages.length === 0) {
    return homeRequest ? [homeRequest] : []
  }

  spinner.start(`Phase 4/4 — Generating ${remainingPages.length} pages in parallel...`)

  const sharedNote =
    'Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page. Start with the main content directly.'
  const routeNote = `EXISTING ROUTES in this project: ${allRoutes}. All internal links MUST point to one of these routes. If a target doesn't exist, use href="#".`
  const alignmentNote =
    'CRITICAL LAYOUT RULE: Every <section> must wrap its content in a container div matching the header width. Use the EXACT same container classes as shown in the style context (e.g. className="container max-w-6xl px-4" or className="max-w-6xl mx-auto px-4"). Inner content can use narrower max-w for text centering, but the outer section container MUST match.'

  const existingPagesContext = buildExistingPagesContext(modCtx.config)

  const AI_CONCURRENCY = 3
  let phase4Done = 0

  const remainingRequests = await pMap(
    remainingPages,
    async ({ name, id, route }) => {
      const prompt = [
        `Create ONE page called "${name}" at route "${route}".`,
        `Context: ${message}.`,
        `Generate complete pageCode for this single page only. Do not generate other pages.`,
        sharedNote,
        routeNote,
        alignmentNote,
        existingPagesContext,
        styleContext,
      ]
        .filter(Boolean)
        .join('\n\n')

      try {
        const result = await parseModification(prompt, modCtx, provider, parseOpts)
        phase4Done++
        spinner.text = `Phase 4/4 — ${phase4Done}/${remainingPages.length} pages generated...`
        const codePage = result.requests.find((r: ModificationRequest) => r.type === 'add-page')
        return codePage || { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      } catch {
        phase4Done++
        spinner.text = `Phase 4/4 — ${phase4Done}/${remainingPages.length} pages generated...`
        return { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      }
    },
    AI_CONCURRENCY,
  )

  const allRequests: ModificationRequest[] = reusedExistingAnchor
    ? [...remainingRequests]
    : homeRequest
      ? [homeRequest, ...remainingRequests]
      : [...remainingRequests]

  const emptyPages = allRequests.filter(r => r.type === 'add-page' && !(r.changes as Record<string, unknown>)?.pageCode)
  if (emptyPages.length > 0 && emptyPages.length <= 5) {
    spinner.text = `Retrying ${emptyPages.length} page(s) without code...`
    for (const req of emptyPages) {
      const page = req.changes as Record<string, unknown>
      const pageName = (page.name as string) || (page.id as string) || 'page'
      const pageRoute = (page.route as string) || `/${pageName.toLowerCase()}`
      try {
        const retryResult = await parseModification(
          `Create ONE page called "${pageName}" at route "${pageRoute}". Context: ${message}. Generate complete pageCode for this single page only.`,
          modCtx,
          provider,
          parseOpts,
        )
        const codePage = retryResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
        if (codePage && (codePage.changes as Record<string, unknown>)?.pageCode) {
          const idx = allRequests.indexOf(req)
          if (idx !== -1) allRequests[idx] = codePage
        }
      } catch {
        // keep the empty version — user will see the warning
      }
    }
  }

  const withCode = allRequests.filter(r => (r.changes as Record<string, unknown>)?.pageCode).length
  spinner.succeed(`Phase 4/4 — Generated ${allRequests.length} pages (${withCode} with full code)`)
  return allRequests
}

export function extractAppNameFromPrompt(prompt: string): string | null {
  const patterns = [
    /(?:called|named|app\s+name)\s+["']([^"']+)["']/i,
    /(?:called|named|app\s+name)\s+(\S+)/i,
    /\b(?:build|create|make)\s+(?:a\s+)?(\S+)\s+(?:app|platform|tool|dashboard|website|saas)/i,
  ]
  for (const re of patterns) {
    const m = prompt.match(re)
    if (m && m[1] && m[1].length >= 2 && m[1].length <= 30) {
      const name = m[1].replace(/[.,;:!?]$/, '')
      const skip = new Set([
        'a',
        'an',
        'the',
        'my',
        'our',
        'new',
        'full',
        'complete',
        'simple',
        'modern',
        'beautiful',
        'responsive',
        'fast',
        'cool',
        'great',
        'basic',
        'quick',
        'small',
        'large',
        'custom',
        'nice',
      ])
      if (skip.has(name.toLowerCase())) continue
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
  }
  return null
}
