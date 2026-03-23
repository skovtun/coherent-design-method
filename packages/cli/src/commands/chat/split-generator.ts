import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'
import type ora from 'ora'
import { z } from 'zod'
import {
  ComponentManager,
  type DesignSystemConfig,
  type ModificationRequest,
  type SharedComponentsManifest,
  loadManifest,
  generateSharedComponent,
} from '@getcoherent/core'
import type { GenerateSharedComponentResult } from '@getcoherent/core'
import { parseModification, buildLightweightPagePrompt } from '../../agents/modifier.js'
import { summarizePageAnalysis } from '../../utils/page-analyzer.js'
import { extractPageNamesFromMessage, inferRelatedPages, impliesFullWebsite } from './request-parser.js'
import { deduplicatePages, readAnchorPageCodeFromDisk } from './utils.js'
import { pMap } from '../../utils/concurrency.js'
import { createAIProvider, type AIProvider } from '../../utils/ai-provider.js'
import { getComponentProvider } from '../../providers/index.js'
import { autoFixCode } from '../../utils/quality-validator.js'
import { isAuthRoute } from '../../agents/page-templates.js'
import chalk from 'chalk'
import { getDesignQualityForType, inferPageTypeFromRoute } from '../../agents/design-constraints.js'
import type { ArchitecturePlan } from './plan-generator.js'
import { generateArchitecturePlan, getPageType } from './plan-generator.js'

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

export function buildSharedComponentsSummary(manifest: SharedComponentsManifest): string | undefined {
  if (manifest.shared.length === 0) return undefined
  return manifest.shared
    .map(e => {
      const importPath = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
      const desc = e.description ? ` — ${e.description}` : ''
      const propsLine = e.propsInterface ? `\n    Props: ${e.propsInterface}` : ''
      return `  ${e.id} ${e.name} (${e.type})${desc}\n    Import: @/components/shared/${importPath}${propsLine}`
    })
    .join('\n')
}

export function buildSharedComponentsNote(sharedComponentsSummary: string | undefined): string | undefined {
  if (!sharedComponentsSummary) return undefined
  return `SHARED COMPONENTS — MANDATORY REUSE:
Before implementing any section, check this list. Import and use matching components from @/components/shared/. Do NOT re-implement these patterns inline.

${sharedComponentsSummary}`
}

export function formatPlanSummary(plan: ArchitecturePlan): string {
  if (plan.groups.length === 0) return ''

  const groupLines = plan.groups.map(g => `  Group "${g.id}" (layout: ${g.layout}): ${g.pages.join(', ')}`)
  const compLines = plan.sharedComponents.map(
    c => `  ${c.name} (${c.type}) — ${c.description}; usedBy: ${c.usedBy.join(', ')}`,
  )

  const parts = [`ARCHITECTURE PLAN:\nGroups:\n${groupLines.join('\n')}`]
  if (compLines.length > 0) {
    parts.push(`Shared Components:\n${compLines.join('\n')}`)
  }

  const noteEntries = Object.entries(plan.pageNotes || {}).filter(
    ([, note]) => note.sections && note.sections.length > 0,
  )
  if (noteEntries.length > 0) {
    const noteLines = noteEntries.map(([key, note]) => `  ${key}: ${note.sections.join(', ')}`)
    parts.push(`Page Sections:\n${noteLines.join('\n')}`)
  }

  return parts.join('\n')
}

export function readExistingAppPageForReference(
  projectRoot: string | null,
  plan: ArchitecturePlan | null,
): string | null {
  if (!projectRoot) return null

  if (plan?.pageNotes) {
    for (const [key, note] of Object.entries(plan.pageNotes)) {
      if (note.type !== 'app') continue
      for (const group of ['(app)', '(admin)', '(dashboard)']) {
        const filePath = resolve(projectRoot, 'app', group, key, 'page.tsx')
        if (existsSync(filePath)) {
          const code = readFileSync(filePath, 'utf-8')
          const lines = code.split('\n')
          return lines.slice(0, 200).join('\n')
        }
      }
    }
  }

  const appDir = resolve(projectRoot, 'app')
  if (!existsSync(appDir)) return null
  try {
    const entries = readdirSync(appDir)
    for (const entry of entries) {
      if (!entry.startsWith('(') || entry === '(auth)') continue
      const groupDir = resolve(appDir, entry)
      if (!statSync(groupDir).isDirectory()) continue
      const subDirs = readdirSync(groupDir)
      for (const sub of subDirs) {
        const pagePath = resolve(groupDir, sub, 'page.tsx')
        if (existsSync(pagePath)) {
          const code = readFileSync(pagePath, 'utf-8')
          const lines = code.split('\n')
          return lines.slice(0, 200).join('\n')
        }
      }
    }
  } catch {
    return null
  }

  return null
}

export { buildExistingPagesContext, extractStyleContext }

export type SplitGenerateParseOpts = {
  sharedComponentsSummary?: string
  /** When set and the root/anchor page exists on disk, skip Phase 2 AI and reuse file for style context */
  projectRoot?: string
}

export type SplitGenerateResult = {
  requests: ModificationRequest[]
  plan: ArchitecturePlan | null
}

export async function splitGeneratePages(
  spinner: ReturnType<typeof ora>,
  message: string,
  modCtx: { config: DesignSystemConfig; componentManager: InstanceType<typeof ComponentManager> },
  provider: Parameters<typeof parseModification>[2],
  parseOpts: SplitGenerateParseOpts,
): Promise<SplitGenerateResult> {
  let pageNames: Array<{ name: string; id: string; route: string }> = []

  spinner.start('Phase 1/6 — Planning pages...')
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
    return { requests: [], plan: null }
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
  spinner.succeed(`Phase 1/6 — Found ${pageNames.length} pages${inferredNote}: ${allPagesList}`)

  let plan: ArchitecturePlan | null = null
  if (parseOpts.projectRoot) {
    spinner.start('Phase 2/6 — Generating architecture plan...')
    try {
      const ai = await createAIProvider(provider ?? 'auto')
      const layoutHint = modCtx.config.navigation?.type || null
      const { plan: generatedPlan, warnings: planWarnings } = await generateArchitecturePlan(
        pageNames,
        message,
        ai,
        layoutHint,
      )
      plan = generatedPlan
      if (plan) {
        const groupsSummary = plan.groups.map(g => `${g.id} (${g.layout}, ${g.pages.length} pages)`).join(', ')
        const sharedSummary =
          plan.sharedComponents.length > 0
            ? plan.sharedComponents.map(c => `${c.name} → ${c.usedBy.join(', ')}`).join(' | ')
            : ''
        const totalPages = plan.groups.reduce((sum, g) => sum + g.pages.length, 0)
        spinner.succeed(`Phase 2/6 — Architecture plan created`)
        console.log(chalk.dim(`  Groups: ${groupsSummary}`))
        if (sharedSummary) console.log(chalk.dim(`  Shared: ${sharedSummary}`))
        console.log(chalk.dim(`  Total: ${totalPages} pages, ${plan.sharedComponents.length} shared components`))

        if (plan.sharedComponents.length > 0 && parseOpts.projectRoot) {
          const allDeps = new Set(plan.sharedComponents.flatMap(c => c.shadcnDeps))
          if (allDeps.size > 0) {
            const componentProvider = getComponentProvider()
            for (const dep of allDeps) {
              try {
                await componentProvider.installComponent(dep, parseOpts.projectRoot)
              } catch {
                /* best-effort */
              }
            }
          }
        }
      } else {
        spinner.warn('Phase 2/6 — Plan generation failed (continuing without plan)')
      }
      for (const w of planWarnings) {
        console.log(chalk.dim(`  ${w}`))
      }
    } catch {
      spinner.warn('Phase 2/6 — Plan generation failed (continuing without plan)')
    }
  }

  const homeIdx = pageNames.findIndex(p => p.route === '/')
  const homePage = homeIdx !== -1 ? pageNames[homeIdx] : pageNames[0]
  const remainingPages = pageNames.filter((_, i) => i !== (homeIdx !== -1 ? homeIdx : 0))

  const projectRoot = parseOpts.projectRoot
  let homeRequest: ModificationRequest | null = null
  let homePageCode = ''
  let reusedExistingAnchor = false

  const isPlaceholder = modCtx.config?.settings?.homePagePlaceholder === true
  if (projectRoot && remainingPages.length > 0 && !isPlaceholder) {
    const existingCode = readAnchorPageCodeFromDisk(projectRoot, homePage.route)
    if (existingCode) {
      reusedExistingAnchor = true
      homePageCode = existingCode
      spinner.start(`Phase 3/6 — Loading ${homePage.name} from disk (style anchor)...`)
      spinner.succeed(`Phase 3/6 — Reused existing ${homePage.name} page (skipped AI regeneration)`)
    }
  }

  if (!reusedExistingAnchor) {
    spinner.start(`Phase 3/6 — Generating ${homePage.name} page (sets design direction)...`)
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
    spinner.succeed(`Phase 3/6 — ${homePage.name} page generated`)
  }

  spinner.start('Phase 4/6 — Extracting design patterns...')
  const styleContext = homePageCode ? extractStyleContext(homePageCode) : ''
  if (styleContext) {
    const lineCount = styleContext.split('\n').length - 1
    const source = reusedExistingAnchor ? `${homePage.name} (existing file)` : homePage.name
    spinner.succeed(`Phase 4/6 — Extracted ${lineCount} style patterns from ${source}`)
  } else {
    spinner.succeed('Phase 4/6 — No style patterns extracted (anchor page had no code)')
  }

  // Phase 4.5: Extract shared components — plan-based or legacy extraction
  if (remainingPages.length >= 2 && projectRoot) {
    if (plan && plan.sharedComponents.length > 0) {
      spinner.start(`Phase 4.5/6 — Generating ${plan.sharedComponents.length} shared components from plan...`)
      try {
        const { generateSharedComponentsFromPlan } = await import('./plan-generator.js')
        const generated = await generateSharedComponentsFromPlan(
          plan,
          styleContext,
          projectRoot,
          await createAIProvider(provider ?? 'auto'),
        )
        if (generated.length > 0) {
          const updatedManifest = await loadManifest(projectRoot)
          parseOpts.sharedComponentsSummary = buildSharedComponentsSummary(updatedManifest)
          const names = generated.map(c => c.name).join(', ')
          spinner.succeed(`Phase 4.5/6 — Generated ${generated.length} shared components (${names})`)
        } else {
          spinner.succeed('Phase 4.5/6 — No shared components generated')
        }
      } catch {
        spinner.warn('Phase 4.5/6 — Could not generate shared components (continuing without)')
      }
    } else if (homePageCode) {
      const manifest = await loadManifest(projectRoot)
      const shouldSkip = reusedExistingAnchor && manifest.shared.some(e => e.type !== 'layout')

      if (!shouldSkip) {
        spinner.start('Phase 4.5/6 — Extracting shared components (legacy)...')
        try {
          const extraction = await extractSharedComponents(homePageCode, projectRoot, provider ?? 'auto')
          parseOpts.sharedComponentsSummary = extraction.summary
          if (extraction.components.length > 0) {
            const names = extraction.components.map(c => c.name).join(', ')
            spinner.succeed(`Phase 4.5/6 — Extracted ${extraction.components.length} shared components (${names})`)
          } else {
            spinner.succeed('Phase 4.5/6 — No shared components extracted')
          }
        } catch {
          spinner.warn('Phase 4.5/6 — Could not extract shared components (continuing without)')
        }
      }
    }
  }

  if (remainingPages.length === 0) {
    return { requests: homeRequest ? [homeRequest] : [], plan }
  }

  spinner.start(`Phase 5/6 — Generating ${remainingPages.length} pages in parallel...`)

  const sharedLayoutNote =
    'Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page. Start with the main content directly.'
  const sharedComponentsNote = buildSharedComponentsNote(parseOpts.sharedComponentsSummary)
  const routeNote = `EXISTING ROUTES in this project: ${allRoutes}. All internal links MUST point to one of these routes. If a target doesn't exist, use href="#".`
  const alignmentNote =
    'CRITICAL LAYOUT RULE: Every <section> must wrap its content in a container div matching the header width. Use the EXACT same container classes as shown in the style context (e.g. className="container max-w-6xl px-4" or className="max-w-6xl mx-auto px-4"). Inner content can use narrower max-w for text centering, but the outer section container MUST match.'
  const planSummaryNote = plan ? formatPlanSummary(plan) : ''

  const existingAppPageCode = readExistingAppPageForReference(parseOpts?.projectRoot ?? null, plan)
  const existingAppPageNote = existingAppPageCode
    ? `\nEXISTING APP PAGE (match these UI patterns for consistency):\n\`\`\`\n${existingAppPageCode}\n\`\`\`\n`
    : ''

  const existingPagesContext = buildExistingPagesContext(modCtx.config)

  const AI_CONCURRENCY = 3
  let phase5Done = 0

  const remainingRequests = await pMap(
    remainingPages,
    async ({ name, id, route }) => {
      const isAuth = isAuthRoute(route) || isAuthRoute(name)
      const pageType = plan ? getPageType(route, plan) : inferPageTypeFromRoute(route)
      const designConstraints = getDesignQualityForType(pageType)
      const authNote = isAuth
        ? 'For this auth page: the auth layout already provides centering (flex items-center justify-center min-h-svh). Do NOT add your own centering wrapper or min-h-svh. Just output a div with className="w-full max-w-md" containing the Card. Do NOT use section containers or full-width wrappers.'
        : undefined

      const prompt = [
        `Create ONE page called "${name}" at route "${route}".`,
        `Context: ${message}.`,
        `Generate complete pageCode for this single page only. Do not generate other pages.`,
        `PAGE TYPE: ${pageType}`,
        designConstraints,
        sharedLayoutNote,
        sharedComponentsNote,
        routeNote,
        alignmentNote,
        authNote,
        planSummaryNote,
        existingAppPageNote,
        existingPagesContext,
        styleContext,
      ]
        .filter(Boolean)
        .join('\n\n')

      try {
        const result = await parseModification(prompt, modCtx, provider, parseOpts)
        phase5Done++
        spinner.text = `Phase 5/6 — ${phase5Done}/${remainingPages.length} pages generated...`
        const codePage = result.requests.find((r: ModificationRequest) => r.type === 'add-page')
        return codePage || { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      } catch {
        phase5Done++
        spinner.text = `Phase 5/6 — ${phase5Done}/${remainingPages.length} pages generated...`
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
  if (emptyPages.length > 0) {
    spinner.text = `Retrying ${emptyPages.length} page(s) without code...`
    for (const req of emptyPages) {
      const page = req.changes as Record<string, unknown>
      const pageName = (page.name as string) || (page.id as string) || 'page'
      const pageRoute = (page.route as string) || `/${pageName.toLowerCase()}`
      try {
        const retryPageType = plan ? getPageType(pageRoute, plan) : inferPageTypeFromRoute(pageRoute)
        const lightweightPrompt = buildLightweightPagePrompt(
          pageName,
          pageRoute,
          styleContext || '',
          parseOpts.sharedComponentsSummary,
          retryPageType,
        )
        const retryResult = await parseModification(lightweightPrompt, modCtx, provider, {
          ...parseOpts,
          lightweight: true,
        })
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
  spinner.succeed(`Phase 5/6 — Generated ${allRequests.length} pages (${withCode} with full code)`)
  return { requests: allRequests, plan }
}

const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: z.enum(['section', 'widget']),
  description: z.string().max(200).default(''),
  propsInterface: z.string().default('{}'),
  code: z.string(),
})

const SharedExtractionResponseSchema = z.object({
  components: z.array(SharedExtractionItemSchema).max(5).default([]),
})

export type SharedExtractionItem = z.infer<typeof SharedExtractionItemSchema>

export async function extractSharedComponents(
  homePageCode: string,
  projectRoot: string,
  aiProvider: AIProvider,
): Promise<{ components: GenerateSharedComponentResult[]; summary: string | undefined }> {
  const manifest = await loadManifest(projectRoot)
  let ai
  try {
    ai = await createAIProvider(aiProvider)
  } catch {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  if (!ai.extractSharedComponents) {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  let rawItems: SharedExtractionItem[]
  try {
    const reservedNames = getComponentProvider().listNames()
    const existingNames = manifest.shared.map(e => e.name)
    const result = await ai.extractSharedComponents(homePageCode, reservedNames, existingNames)
    const parsed = SharedExtractionResponseSchema.safeParse(result)
    rawItems = parsed.success ? parsed.data.components : []
  } catch {
    return { components: [], summary: buildSharedComponentsSummary(manifest) }
  }

  const reservedSet = new Set(
    getComponentProvider()
      .listNames()
      .map(n => n.toLowerCase()),
  )
  const existingSet = new Set(manifest.shared.map(e => e.name.toLowerCase()))
  const seenNames = new Set<string>()
  const filtered = rawItems.filter(item => {
    if (item.code.split('\n').length < 10) return false
    if (reservedSet.has(item.name.toLowerCase())) return false
    if (existingSet.has(item.name.toLowerCase())) return false
    if (seenNames.has(item.name.toLowerCase())) return false
    seenNames.add(item.name.toLowerCase())
    return true
  })

  const results: GenerateSharedComponentResult[] = []
  const provider = getComponentProvider()

  for (const item of filtered) {
    try {
      const { code: fixedCode } = await autoFixCode(item.code)

      const shadcnImports = [...fixedCode.matchAll(/from\s+["']@\/components\/ui\/(.+?)["']/g)]
      for (const match of shadcnImports) {
        await provider.installComponent(match[1], projectRoot)
      }

      const result = await generateSharedComponent(projectRoot, {
        name: item.name,
        type: item.type,
        code: fixedCode,
        description: item.description,
        propsInterface: item.propsInterface,
        usedIn: [],
      })
      results.push(result)
    } catch {
      // skip failed component
    }
  }

  const updatedManifest = await loadManifest(projectRoot)
  return { components: results, summary: buildSharedComponentsSummary(updatedManifest) }
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
