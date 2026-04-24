import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import type ora from 'ora'
import { z } from 'zod'
import {
  ComponentManager,
  type DesignSystemConfig,
  type ModificationRequest,
  type SharedComponentsManifest,
  SharedComponentTypeSchema,
  loadManifest,
  saveManifest,
  generateSharedComponent,
} from '@getcoherent/core'
import type { GenerateSharedComponentResult } from '@getcoherent/core'
import { parseModification, buildLightweightPagePrompt } from '../../agents/modifier.js'
import { summarizePageAnalysis } from '../../utils/page-analyzer.js'
import {
  extractPageNamesFromMessage,
  inferRelatedPages,
  impliesFullWebsite,
  detectExplicitRootPage,
  isAppOnlyRequest,
} from './request-parser.js'
import {
  deduplicatePages,
  readAnchorPageCodeFromDisk,
  startSpinnerHeartbeat,
  withRequestTimeout,
  withAbortableTimeout,
  startPhaseTimer,
} from './utils.js'
import { pMap } from '../../utils/concurrency.js'
import { createAIProvider, type AIProvider } from '../../utils/ai-provider.js'
import { getComponentProvider } from '../../providers/index.js'
import { autoFixCode } from '../../utils/quality-validator.js'
import { isAuthRoute, detectPageType } from '../../agents/page-templates.js'
import chalk from 'chalk'
import { getDesignQualityForType, inferPageTypeFromRoute } from '../../agents/design-constraints.js'
import type { ArchitecturePlan, Atmosphere } from './plan-generator.js'
import {
  generateArchitecturePlan,
  updateArchitecturePlan,
  loadPlan,
  getPageType,
  renderAtmosphereDirective,
  renderAtmosphereStyleHint,
  extractAtmosphereFromMessage,
} from './plan-generator.js'
import { buildReusePlan, buildReusePlanDirective, verifyReusePlan } from '../../utils/reuse-planner.js'
import { resolveColorPreset } from '../../utils/color-presets.js'
import {
  readDesignMemory,
  extractDecisionsFromCode,
  appendDecisions,
  formatMemoryForPrompt,
  truncateMemory,
} from '../../utils/design-memory.js'
import { validateLayoutIntegrity } from '../../utils/layout-integrity.js'
import { extractStyleContext } from '../../phase-engine/phases/extract-style.js'

const MAX_EXISTING_PAGES_CONTEXT = 3

/**
 * Context Engineering: filter shared components manifest to only those
 * the plan says are used on this specific page. Falls back to full
 * manifest if no plan components match (e.g., layout components).
 */
function filterManifestForPage(
  manifest: SharedComponentsManifest,
  plan: ArchitecturePlan,
  route: string,
): SharedComponentsManifest {
  const plannedForPage = plan.sharedComponents.filter(c => c.usedBy.includes(route)).map(c => c.name.toLowerCase())
  if (plannedForPage.length === 0) return manifest

  const filtered = manifest.shared.filter(e => plannedForPage.includes(e.name.toLowerCase()) || e.type === 'layout')
  // Always include at least layout components; fall back to full if filter is too aggressive
  if (filtered.length === 0) return manifest

  // Overlay plan's props interface onto manifest entries (plan is source of truth)
  const enriched = filtered.map(entry => {
    const planned = plan.sharedComponents.find(c => c.name.toLowerCase() === entry.name.toLowerCase())
    if (planned?.props && planned.props !== '{}') {
      return { ...entry, propsInterface: planned.props }
    }
    return entry
  })

  return { ...manifest, shared: enriched }
}

function buildExistingPagesContext(config: DesignSystemConfig, forPageType?: string): string {
  const pages = config.pages || []
  const analyzed = pages.filter((p: any) => p.pageAnalysis)
  if (analyzed.length === 0) return ''

  // Context Engineering: prefer pages of the same type for better consistency
  let relevant = analyzed
  if (forPageType) {
    const sameType = analyzed.filter((p: any) => inferPageTypeFromRoute(p.route) === forPageType)
    relevant = sameType.length > 0 ? sameType : analyzed
  }
  const capped = relevant.slice(0, MAX_EXISTING_PAGES_CONTEXT)
  const lines = capped.map((p: any) => {
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

const VALID_NAV_TYPES = new Set(['header', 'sidebar', 'both', 'none'])

export function parseNavTypeFromPlan(planResult: Record<string, unknown>): 'header' | 'sidebar' | 'both' | 'none' {
  const nav = planResult.navigation as Record<string, unknown> | undefined | null
  if (nav && typeof nav.type === 'string' && VALID_NAV_TYPES.has(nav.type)) {
    return nav.type as 'header' | 'sidebar' | 'both' | 'none'
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

const RELEVANT_TYPES: Record<string, string[]> = {
  app: ['data-display', 'form', 'navigation', 'feedback'],
  auth: ['form', 'feedback'],
  marketing: ['section', 'layout'],
}

export function buildTieredComponentsPrompt(
  manifest: SharedComponentsManifest,
  pageType: 'marketing' | 'app' | 'auth',
): string | undefined {
  if (manifest.shared.length === 0) return undefined

  const relevantTypes = new Set(RELEVANT_TYPES[pageType] || RELEVANT_TYPES.app)

  const level1Lines = manifest.shared.slice(0, 20).map(e => {
    const desc = e.description ? ` — ${e.description}` : ''
    return `- ${e.id} ${e.name} (${e.type})${desc}`
  })
  if (manifest.shared.length > 20) {
    level1Lines.push(`- ... and ${manifest.shared.length - 20} more (import by name)`)
  }

  const relevantComponents = manifest.shared.filter(e => relevantTypes.has(e.type))
  const level2Blocks = relevantComponents
    .filter(e => e.propsInterface || e.usageExample)
    .slice(0, 8)
    .map(e => {
      const importPath = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
      const lines = [`### ${e.name} (${e.id})`]
      if (e.propsInterface) lines.push(`Props: ${e.propsInterface}`)
      if (e.usageExample) lines.push(`Usage: ${e.usageExample}`)
      lines.push(`Import: import { ${e.name} } from '@/components/shared/${importPath}'`)
      return lines.join('\n')
    })

  const sections = [
    `SHARED COMPONENTS — MANDATORY REUSE:`,
    `Before implementing any section, check this list. Import and use matching components. Do NOT re-implement these patterns inline.`,
    ``,
    `Available components:`,
    ...level1Lines,
  ]

  if (level2Blocks.length > 0) {
    sections.push(``, `Components to use on this page (detailed API):`, ...level2Blocks)
  }

  sections.push(
    ``,
    `If you need a component from the list above that isn't detailed below, import it by path — the system will validate usage post-generation.`,
  )

  return sections.join('\n')
}

export function formatPlanSummary(plan: ArchitecturePlan, forRoute?: string): string {
  if (plan.groups.length === 0) return ''

  if (forRoute) {
    const group = plan.groups.find(g => g.pages.includes(forRoute))
    if (!group) return ''
    const groupLine = `  Group "${group.id}" (layout: ${group.layout}): ${group.pages.join(', ')}`
    const relevantComps = plan.sharedComponents.filter(c => c.usedBy.includes(forRoute))
    const parts = [`ARCHITECTURE PLAN:\nYour group:\n${groupLine}`]
    if (relevantComps.length > 0) {
      parts.push(
        `Shared Components for this page:\n${relevantComps.map(c => `  ${c.name} (${c.type}) — ${c.description}`).join('\n')}`,
      )
    }
    const routeKey = forRoute.replace(/^\//, '')
    const note = plan.pageNotes?.[routeKey]
    if (note?.sections && note.sections.length > 0) {
      parts.push(`Page Sections: ${note.sections.join(', ')}`)
    }
    return parts.join('\n')
  }

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
        try {
          if (existsSync(filePath)) {
            const code = readFileSync(filePath, 'utf-8')
            const lines = code.split('\n')
            return lines.slice(0, 60).join('\n')
          }
        } catch {
          continue
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
          return lines.slice(0, 60).join('\n')
        }
      }
    }
  } catch {
    return null
  }

  return null
}

export function buildLayoutNote(layoutType?: string): string {
  switch (layoutType) {
    case 'sidebar':
      return 'This page uses a SIDEBAR layout. The sidebar navigation is already rendered by the group layout. Do NOT create your own sidebar or side navigation. Start with the main content area directly. The page content appears to the right of the sidebar.'
    case 'both':
      return 'This page has both a sidebar and a header rendered by the group layout. Do NOT include any site-wide header, nav, sidebar, or footer in this page. Start with the main content directly.'
    case 'none':
      return 'This page has no shared navigation from the layout. Include any needed navigation within the page itself.'
    default:
      return 'Header and Footer are shared components rendered by the root layout. Do NOT include any site-wide <header>, <nav>, or <footer> in this page. Start with the main content directly.'
  }
}

/**
 * Resolve the final Atmosphere for a chat run. If `override` is set (user passed
 * `--atmosphere <preset>`), it wins verbatim with no merge. Otherwise merges the
 * AI-plan-supplied atmosphere with the deterministic extractor, giving deterministic
 * the edge when the AI looks like it defaulted to "minimal-paper / monochrome".
 *
 * Extracted from splitGeneratePages so the override and merge branches are
 * testable in isolation.
 */
export function mergeAtmosphere(input: {
  override: Atmosphere | undefined
  aiAtmosphere: Atmosphere | undefined
  message: string
}): Atmosphere {
  if (input.override) return input.override

  const deterministic = extractAtmosphereFromMessage(input.message)
  const aiAtmosphere = input.aiAtmosphere || ({} as Partial<Atmosphere>)
  const aiLooksDefault =
    (!aiAtmosphere.background || aiAtmosphere.background === 'minimal-paper') &&
    (!aiAtmosphere.accents || aiAtmosphere.accents === 'monochrome')

  return {
    moodPhrase: aiAtmosphere.moodPhrase || deterministic.moodPhrase || '',
    background:
      (aiLooksDefault && deterministic.background) ||
      aiAtmosphere.background ||
      deterministic.background ||
      'minimal-paper',
    heroLayout:
      (aiLooksDefault && deterministic.heroLayout) ||
      aiAtmosphere.heroLayout ||
      deterministic.heroLayout ||
      'split-text-image',
    spacing: (aiLooksDefault && deterministic.spacing) || aiAtmosphere.spacing || deterministic.spacing || 'medium',
    accents: (aiLooksDefault && deterministic.accents) || aiAtmosphere.accents || deterministic.accents || 'monochrome',
    fontStyle:
      (aiLooksDefault && deterministic.fontStyle) || aiAtmosphere.fontStyle || deterministic.fontStyle || 'sans',
    primaryHint: aiAtmosphere.primaryHint || deterministic.primaryHint || '',
  }
}

export function buildAnchorPagePrompt(
  homePage: { name: string; route: string },
  message: string,
  allPagesList: string,
  allRoutes: string,
  plan: ArchitecturePlan | null,
): string {
  const pageType = detectPageType(homePage.name) || detectPageType(homePage.route)
  const authPageTypes = new Set(['login', 'register', 'reset-password'])
  const isAuth = isAuthRoute(homePage.route) || isAuthRoute(homePage.name) || authPageTypes.has(pageType || '')
  const atmosphere = renderAtmosphereDirective(plan?.atmosphere)

  if (isAuth) {
    return `Create ONE page called "${homePage.name}" at route "${homePage.route}".
${atmosphere}
Context: ${message}. This is the application's entry point — a clean, centered authentication form. Generate complete pageCode. Do NOT include site-wide <header>, <nav>, or <footer> — this page has its own minimal layout. Make it visually polished with proper form validation UI — this page sets the design direction for the entire site. Do not generate other pages.`
  }

  const groupLayout = plan?.groups.find(g => g.pages.includes(homePage.route))?.layout

  if (groupLayout === 'sidebar' || pageType === 'dashboard') {
    return `Create ONE page called "${homePage.name}" at route "${homePage.route}".
${atmosphere}
Context: ${message}. This REPLACES the default placeholder page — generate a complete application page. Generate complete pageCode. Do NOT include a sidebar or top navigation — these are handled by the layout. Focus on the main content area.

DESIGN DIRECTION — this page sets the visual tone for the entire app:
- Stats: do NOT use 4 identical stat cards — use 2 large + 2 small, or inline metrics with dividers
- Layout: use asymmetric 2/3 + 1/3 split, not uniform sections
- Data: show real-feeling content with diverse names and specific numbers
- Make each section visually distinct — vary density and treatment
Do not generate other pages.`
  }

  return `Create ONE page called "${homePage.name}" at route "${homePage.route}".
${atmosphere}
Context: ${message}. This REPLACES the default placeholder page — generate a complete, content-rich landing page for the project described above. Generate complete pageCode. Include a branded site-wide <header> with navigation links to ALL these pages: ${allPagesList}. Use these EXACT routes in navigation: ${allRoutes}. Include a <footer> at the bottom.

DESIGN DIRECTION — this page sets the visual tone for the entire site:
- Hero: choose split layout (text left, visual right) OR centered — not always centered
- Make it feel designed, not templated. Vary section density, alternate backgrounds
- Feature section: NOT identical 3-column icon+heading+text cards — vary the treatment
- Pricing: highlighted tier must stand out clearly (ring-2 ring-primary, scale slightly larger)
- Testimonials: asymmetric layout, not 3 identical cards
- Use real-feeling content: diverse names, specific metrics, concrete descriptions
Do not generate other pages.`
}

function getGroupLayoutForRoute(route: string, plan: ArchitecturePlan | null): string | undefined {
  if (!plan) return undefined
  const group = plan.groups.find(g => g.pages.includes(route))
  return group?.layout
}

export { buildExistingPagesContext, extractStyleContext, filterManifestForPage }

let manifestLock = Promise.resolve()

async function updateManifestSafe(
  projectRoot: string,
  fn: (m: SharedComponentsManifest) => SharedComponentsManifest,
): Promise<void> {
  const timeoutMs = 5000
  const update = manifestLock.then(async () => {
    const m = await loadManifest(projectRoot)
    const updated = fn(m)
    await saveManifest(projectRoot, updated)
  })
  manifestLock = update.catch(() => {})
  await Promise.race([
    update,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('manifest sync timeout')), timeoutMs)),
  ]).catch(() => {})
}

export type SplitGenerateParseOpts = {
  sharedComponentsSummary?: string
  /** When set and the root/anchor page exists on disk, skip Phase 2 AI and reuse file for style context */
  projectRoot?: string
  /**
   * Hard override for plan.atmosphere — wins over AI plan + deterministic message extraction.
   * Set by `coherent chat --atmosphere <preset-name>` via {@link getAtmospherePreset}.
   */
  atmosphereOverride?: Atmosphere
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
  const endPhase1Timer = startPhaseTimer('Phase 1 plan pages')
  try {
    const planResult = await withAbortableTimeout(
      signal => parseModification(message, modCtx, provider, { ...parseOpts, planOnly: true, signal }),
      'Phase 1 plan pages',
    )
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
    const explicitNameFromPrompt = extractAppNameFromPrompt(message)
    if (explicitNameFromPrompt) {
      modCtx.config.name = explicitNameFromPrompt
    } else if (typeof planRaw.appName === 'string' && planRaw.appName && modCtx.config.name === 'My App') {
      modCtx.config.name = planRaw.appName
    }
  } catch {
    spinner.text = 'AI plan failed — extracting pages from your request...'
  } finally {
    endPhase1Timer()
  }

  const promptName = extractAppNameFromPrompt(message)
  if (promptName) {
    modCtx.config.name = promptName
  } else if (modCtx.config.name === 'My App') {
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

    const explicitRootId = detectExplicitRootPage(message, pageNames)
    if (explicitRootId) {
      const rootPage = pageNames.find(p => p.id === explicitRootId)
      if (rootPage) rootPage.route = '/'
    } else if (!isAppOnlyRequest(pageNames) && (isFreshProject || impliesFullWebsite(message))) {
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
    const stopPhase2Heartbeat = startSpinnerHeartbeat(spinner, [
      { after: 8, text: 'Phase 2/6 — Grouping pages by layout...' },
      { after: 18, text: 'Phase 2/6 — Planning shared components...' },
      { after: 35, text: 'Phase 2/6 — Still thinking (complex app layouts)...' },
    ])
    const endPhase2Timer = startPhaseTimer('Phase 2 architecture plan')
    try {
      const ai = await createAIProvider(provider ?? 'auto')
      const cachedPlan = loadPlan(parseOpts.projectRoot)
      let planWarnings: string[] = []

      try {
        if (cachedPlan) {
          plan = await withRequestTimeout(
            updateArchitecturePlan(cachedPlan, pageNames, message, ai),
            'Phase 2 architecture plan update',
          )
        } else {
          const layoutHint = modCtx.config.navigation?.type || null
          const result = await withRequestTimeout(
            generateArchitecturePlan(pageNames, message, ai, layoutHint),
            'Phase 2 architecture plan generation',
          )
          plan = result.plan
          planWarnings = result.warnings
        }
      } finally {
        stopPhase2Heartbeat()
        endPhase2Timer()
      }
      if (plan) {
        const merged = mergeAtmosphere({
          override: parseOpts.atmosphereOverride,
          aiAtmosphere: plan.atmosphere,
          message,
        })
        plan.atmosphere = merged

        // Token regeneration: apply primaryHint to actual design tokens
        const colorOverride = resolveColorPreset(merged.primaryHint)
        if (colorOverride && modCtx.config.tokens?.colors) {
          modCtx.config.tokens.colors.light.primary = colorOverride.light
          modCtx.config.tokens.colors.dark.primary = colorOverride.dark
        }

        const groupsSummary = plan.groups.map(g => `${g.id} (${g.layout}, ${g.pages.length} pages)`).join(', ')
        const sharedSummary =
          plan.sharedComponents.length > 0
            ? plan.sharedComponents.map(c => `${c.name} → ${c.usedBy.join(', ')}`).join(' | ')
            : ''
        const totalPages = plan.groups.reduce((sum, g) => sum + g.pages.length, 0)
        spinner.succeed(`Phase 2/6 — Architecture plan created`)
        console.log(chalk.dim(`  Groups: ${groupsSummary}`))
        if (sharedSummary) console.log(chalk.dim(`  Shared: ${sharedSummary}`))
        console.log(
          chalk.dim(
            `  Atmosphere: ${merged.background} / ${merged.heroLayout} / ${merged.spacing} / ${merged.accents}${merged.primaryHint ? ` / primary=${merged.primaryHint}` : ''}`,
          ),
        )
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

      // Generate sidebar immediately if plan requires it (don't wait for `coherent fix`)
      if (plan && parseOpts.projectRoot) {
        const hasSidebar = plan.groups.some(g => g.layout === 'sidebar' || g.layout === 'both')
        const sidebarPath = resolve(parseOpts.projectRoot, 'components', 'shared', 'sidebar.tsx')
        if (hasSidebar) {
          // Sync nav config with plan: type → 'sidebar' + pre-populate items from plan pages
          // so generateSharedSidebarCode emits real menu items on first render (not empty <SidebarContent/>).
          if (modCtx.config.navigation) {
            modCtx.config.navigation.type = 'sidebar'
            const sidebarGroup = plan.groups.find(g => g.layout === 'sidebar' || g.layout === 'both')
            if (sidebarGroup && Array.isArray(sidebarGroup.pages)) {
              const existingRoutes = new Set((modCtx.config.navigation.items || []).map(i => i.route))
              const labelize = (route: string) =>
                route === '/'
                  ? 'Home'
                  : route
                      .replace(/^\//, '')
                      .replace(/\[.+?\]/g, '')
                      .replace(/[-/]+/g, ' ')
                      .trim()
                      .split(' ')
                      .filter(Boolean)
                      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')
              const items = modCtx.config.navigation.items || []
              for (const route of sidebarGroup.pages) {
                if (!existingRoutes.has(route) && !route.includes('[')) {
                  items.push({
                    label: labelize(route),
                    route,
                    requiresAuth: true,
                    order: items.length + 1,
                  })
                }
              }
              modCtx.config.navigation.items = items
            }
          }
        }
        if (hasSidebar && !existsSync(sidebarPath)) {
          try {
            const sidebarUiPath = resolve(parseOpts.projectRoot, 'components', 'ui', 'sidebar.tsx')
            const componentProvider = getComponentProvider()
            if (!existsSync(sidebarUiPath) && componentProvider.has('sidebar')) {
              await componentProvider.installComponent('sidebar', parseOpts.projectRoot)
            }
            const { PageGenerator } = await import('@getcoherent/core')
            const generator = new PageGenerator(modCtx.config)
            const sidebarCode = generator.generateSharedSidebarCode()
            mkdirSync(resolve(parseOpts.projectRoot, 'components', 'shared'), { recursive: true })
            writeFileSync(sidebarPath, sidebarCode, 'utf-8')
            console.log(chalk.dim('  ✔ Generated AppSidebar component'))

            const appLayoutPath = resolve(parseOpts.projectRoot, 'app', '(app)', 'layout.tsx')
            if (existsSync(appLayoutPath)) {
              const current = readFileSync(appLayoutPath, 'utf-8')
              const hasSidebarWiring = /SidebarProvider|AppSidebar/.test(current)
              if (!hasSidebarWiring) {
                const { buildAppLayoutCode } = await import('./code-generator.js')
                const newLayout = buildAppLayoutCode('sidebar', modCtx.config.name)
                writeFileSync(appLayoutPath, newLayout, 'utf-8')
                console.log(chalk.dim('  ✔ Rewired (app)/layout.tsx to use SidebarProvider + AppSidebar'))
              }
            }
          } catch (err) {
            console.warn(
              chalk.yellow(`  ⚠ AppSidebar integration failed: ${err instanceof Error ? err.message : String(err)}`),
            )
            console.warn(chalk.dim('    Run `coherent fix` to retry'))
          }
        }
      }
    } catch (err) {
      spinner.warn(`Phase 2/6 — Plan generation failed: ${err instanceof Error ? err.message : String(err)}`)
      console.warn(chalk.dim('  Continuing without architecture plan — pages may not be grouped correctly'))
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

  // Experimental: launch Phase 5 (shared components) concurrently with Phase 3
  // (home page) when `COHERENT_EXPERIMENTAL_PARALLEL_PHASES=1`. Phase 5 falls
  // back to atmosphere-derived style hint instead of the home-page styleContext
  // (which doesn't exist yet). Saves ~20-30s on runs where both phases would be
  // sequential LLM calls. Default OFF until we have a visual regression
  // benchmark that confirms no quality drop.
  const parallelPhasesEnabled =
    process.env.COHERENT_EXPERIMENTAL_PARALLEL_PHASES === '1' &&
    !reusedExistingAnchor &&
    !!plan &&
    plan.sharedComponents.length > 0 &&
    !!projectRoot
  let phase5ParallelPromise: Promise<
    Awaited<ReturnType<(typeof import('./plan-generator.js'))['generateSharedComponentsFromPlan']>>
  > | null = null
  let endPhase5ParallelTimer: (() => void) | null = null
  if (parallelPhasesEnabled && plan && projectRoot) {
    const sharedCount = plan.sharedComponents.length
    const atmosphereHint = renderAtmosphereStyleHint(plan.atmosphere) || 'default'
    console.log(
      chalk.dim(
        `  [experimental] Phase 5 running parallel with Phase 3 — using atmosphere hint (${atmosphereHint}) as style fallback.`,
      ),
    )
    endPhase5ParallelTimer = startPhaseTimer(`Phase 5 shared components (${sharedCount}) [parallel]`)
    phase5ParallelPromise = (async () => {
      const { generateSharedComponentsFromPlan } = await import('./plan-generator.js')
      const ai = await createAIProvider(provider ?? 'auto')
      try {
        return await withRequestTimeout(
          generateSharedComponentsFromPlan(plan, atmosphereHint, projectRoot, ai),
          'Phase 5 shared components (parallel)',
        )
      } catch {
        return []
      }
    })()
  }

  if (!reusedExistingAnchor) {
    spinner.start(`Phase 3/6 — Generating ${homePage.name} page (sets design direction)...`)
    const stopPhase3Heartbeat = startSpinnerHeartbeat(spinner, [
      { after: 10, text: `Phase 3/6 — Drafting ${homePage.name} layout...` },
      { after: 25, text: `Phase 3/6 — Filling sections and components...` },
      { after: 50, text: `Phase 3/6 — Polishing ${homePage.name} (this sets the whole app's style)...` },
    ])
    const endPhase3Timer = startPhaseTimer(`Phase 3 ${homePage.name} page`)
    try {
      const anchorPrompt = buildAnchorPagePrompt(homePage, message, allPagesList, allRoutes, plan)
      const homeResult = await withAbortableTimeout(
        signal => parseModification(anchorPrompt, modCtx, provider, { ...parseOpts, signal }),
        `Phase 3 ${homePage.name} page generation`,
      )
      const codePage = homeResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
      if (codePage) {
        homeRequest = codePage
        homePageCode = ((codePage.changes as Record<string, unknown>)?.pageCode as string) || ''
      }
    } catch {
      /* handled below */
    } finally {
      stopPhase3Heartbeat()
      endPhase3Timer()
    }

    if (!homeRequest) {
      homeRequest = {
        type: 'add-page',
        target: 'new',
        changes: { id: homePage.id, name: homePage.name, route: homePage.route },
      }
    }
    if (homePageCode) {
      spinner.succeed(`Phase 3/6 — ${homePage.name} page generated`)
    } else {
      spinner.warn(`Phase 3/6 — ${homePage.name} page generated (no code — AI may have failed)`)
    }
  }

  if (projectRoot && homePageCode) {
    try {
      const anchorDecisions = extractDecisionsFromCode(homePageCode)
      if (anchorDecisions.length > 0) {
        appendDecisions(projectRoot, homePage.name, homePage.route, anchorDecisions)
      }
    } catch {
      /* memory is best-effort */
    }
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
      const sharedCount = plan.sharedComponents.length
      if (phase5ParallelPromise) {
        spinner.start(`Phase 5/6 — Awaiting parallel shared-component generation (${sharedCount})...`)
        try {
          const generated = await phase5ParallelPromise
          if (generated.length > 0) {
            const updatedManifest = await loadManifest(projectRoot)
            parseOpts.sharedComponentsSummary = buildSharedComponentsSummary(updatedManifest)
            const names = generated.map(c => c.name).join(', ')
            spinner.succeed(`Phase 5/6 — Generated ${generated.length} shared components in parallel (${names})`)
          } else {
            spinner.succeed('Phase 5/6 — No shared components generated (parallel)')
          }
        } catch {
          spinner.warn('Phase 5/6 — Parallel shared-component generation failed (continuing without)')
        } finally {
          endPhase5ParallelTimer?.()
        }
      } else {
        spinner.start(`Phase 5/6 — Generating ${sharedCount} shared components from plan...`)
        const stopPhase5Heartbeat = startSpinnerHeartbeat(spinner, [
          { after: 10, text: `Phase 5/6 — Building ${sharedCount} shared components...` },
          { after: 25, text: `Phase 5/6 — Writing component code (${sharedCount} components)...` },
          { after: 50, text: `Phase 5/6 — Finalizing shared components...` },
        ])
        const endPhase5Timer = startPhaseTimer(`Phase 5 shared components (${sharedCount})`)
        try {
          const { generateSharedComponentsFromPlan } = await import('./plan-generator.js')
          const generated = await withRequestTimeout(
            generateSharedComponentsFromPlan(
              plan,
              styleContext,
              projectRoot,
              await createAIProvider(provider ?? 'auto'),
            ),
            `Phase 5 shared components generation`,
          )
          if (generated.length > 0) {
            const updatedManifest = await loadManifest(projectRoot)
            parseOpts.sharedComponentsSummary = buildSharedComponentsSummary(updatedManifest)
            const names = generated.map(c => c.name).join(', ')
            spinner.succeed(`Phase 5/6 — Generated ${generated.length} shared components (${names})`)
          } else {
            spinner.succeed('Phase 5/6 — No shared components generated')
          }
        } catch {
          spinner.warn('Phase 5/6 — Could not generate shared components (continuing without)')
        } finally {
          stopPhase5Heartbeat()
          endPhase5Timer()
        }
      }
    } else if (homePageCode) {
      const manifest = await loadManifest(projectRoot)
      const shouldSkip = reusedExistingAnchor && manifest.shared.some(e => e.type !== 'layout')

      if (!shouldSkip) {
        spinner.start('Phase 5/6 — Extracting shared components (legacy)...')
        try {
          const extraction = await extractSharedComponents(homePageCode, projectRoot, provider ?? 'auto')
          parseOpts.sharedComponentsSummary = extraction.summary
          if (extraction.components.length > 0) {
            const names = extraction.components.map(c => c.name).join(', ')
            spinner.succeed(`Phase 5/6 — Extracted ${extraction.components.length} shared components (${names})`)
          } else {
            spinner.succeed('Phase 5/6 — No shared components extracted')
          }
        } catch {
          spinner.warn('Phase 5/6 — Could not extract shared components (continuing without)')
        }
      }
    }
  }

  if (remainingPages.length === 0) {
    return { requests: homeRequest ? [homeRequest] : [], plan }
  }

  spinner.start(`Phase 6/6 — Generating ${remainingPages.length} pages in parallel...`)
  const endPhase6Timer = startPhaseTimer(`Phase 6 ${remainingPages.length} pages`)

  const designMemoryBlock = projectRoot ? formatMemoryForPrompt(readDesignMemory(projectRoot)) : ''

  const sharedComponentsNote = buildSharedComponentsNote(parseOpts.sharedComponentsSummary)
  // Loaded AFTER Phase 5 awaited completion — sees post-Phase-5 manifest state.
  // Phase 6 never mutates manifest.shared (only usedIn per-entry via updateManifestSafe),
  // so a single load is sufficient for buildReusePlan/filterManifestForPage below.
  const currentManifest = projectRoot ? await loadManifest(projectRoot) : null
  const routeNote = `EXISTING ROUTES in this project: ${allRoutes}. All internal links MUST point to one of these routes. If a target doesn't exist, use href="#".`
  const alignmentNote =
    'CRITICAL LAYOUT RULE: Every <section> must wrap its content in a container div matching the header width. Use the EXACT same container classes as shown in the style context (e.g. className="container max-w-6xl px-4" or className="max-w-6xl mx-auto px-4"). Inner content can use narrower max-w for text centering, but the outer section container MUST match.'
  const existingAppPageCode = readExistingAppPageForReference(parseOpts?.projectRoot ?? null, plan)
  const existingAppPageNote = existingAppPageCode
    ? `\nEXISTING APP PAGE (match these UI patterns for consistency):\n\`\`\`\n${existingAppPageCode}\n\`\`\`\n`
    : ''

  // existingPagesContext is built per-page inside the loop (filtered by page type)

  const existingPageCode: Record<string, string> = {}
  if (projectRoot) {
    const appDir = resolve(projectRoot, 'app')
    if (existsSync(appDir)) {
      const pageFiles = readdirSync(appDir, { recursive: true }).filter(
        (f): f is string => typeof f === 'string' && f.endsWith('page.tsx'),
      )
      for (const pf of pageFiles) {
        try {
          const code = readFileSync(resolve(appDir, pf), 'utf-8')
          const route = '/' + pf.replace(/\/page\.tsx$/, '').replace(/\(.*?\)\//g, '')
          existingPageCode[route === '/' ? '/' : route] = code
        } catch {
          /* skip unreadable */
        }
      }
    }
  }

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

      // Context Engineering: only include existing pages of the same type
      const existingPagesContext = buildExistingPagesContext(modCtx.config, pageType)

      const layoutForPage = getGroupLayoutForRoute(route, plan)
      const layoutNote = buildLayoutNote(layoutForPage)
      // Context Engineering: filter manifest to only components relevant to this page
      const filteredManifest =
        currentManifest && plan ? filterManifestForPage(currentManifest, plan, route) : currentManifest
      const tieredNote = filteredManifest
        ? buildTieredComponentsPrompt(filteredManifest, pageType as 'marketing' | 'app' | 'auth')
        : undefined

      const pageKey = route.replace(/^\//, '') || 'home'
      const pageSections = plan?.pageNotes?.[pageKey]?.sections || []
      let reusePlanDirective = ''
      let currentReusePlan: ReturnType<typeof buildReusePlan> | null = null

      if (currentManifest && currentManifest.shared.length > 0) {
        try {
          currentReusePlan = buildReusePlan({
            pageName: name,
            pageType: pageType as 'marketing' | 'app' | 'auth',
            sections: pageSections,
            manifest: currentManifest,
            existingPageCode,
            userRequest: message,
          })
          reusePlanDirective = buildReusePlanDirective(currentReusePlan)

          if (currentReusePlan.reuse.length > 0 || currentReusePlan.createNew.length > 0) {
            const parts = []
            if (currentReusePlan.reuse.length > 0)
              parts.push(`REUSE: ${currentReusePlan.reuse.map(r => r.component).join(', ')}`)
            if (currentReusePlan.createNew.length > 0)
              parts.push(`CREATE: ${currentReusePlan.createNew.map(c => c.name).join(', ')}`)
            if (currentReusePlan.reusePatterns.length > 0)
              parts.push(`${currentReusePlan.reusePatterns.length} pattern(s)`)
            console.log(chalk.dim(`  🔄 Reuse Plan for "${name}": ${parts.join(' | ')}`))
          }
        } catch {
          /* graceful degradation: fall back to tiered prompt */
        }
      }

      const atmosphereDirective = renderAtmosphereDirective(plan?.atmosphere)

      const prompt = [
        `Create ONE page called "${name}" at route "${route}".`,
        atmosphereDirective,
        `Context: ${message}.`,
        `Generate complete pageCode for this single page only. Do not generate other pages.`,
        `FORBIDDEN in pageCode: <header>, <nav>, <footer>, site-wide navigation, copyright footers. The layout provides all of these.`,
        `PAGE TYPE: ${pageType}`,
        designConstraints,
        layoutNote,
        reusePlanDirective || tieredNote || sharedComponentsNote,
        routeNote,
        alignmentNote,
        authNote,
        plan ? formatPlanSummary(plan, route) : '',
        pageType !== 'auth' ? existingAppPageNote : undefined,
        existingPagesContext,
        styleContext,
        designMemoryBlock,
      ]
        .filter(Boolean)
        .join('\n\n')

      try {
        const result = await withAbortableTimeout(
          signal => parseModification(prompt, modCtx, provider, { ...parseOpts, pageSections, signal }),
          `Phase 6 page ${name}`,
        )
        phase5Done++
        spinner.text = `Phase 6/6 — ${phase5Done}/${remainingPages.length} pages generated...`
        const codePage = result.requests.find((r: ModificationRequest) => r.type === 'add-page')

        if (currentReusePlan && currentReusePlan.reuse.length > 0 && codePage) {
          const pageCode = (codePage.changes as Record<string, unknown>)?.pageCode as string
          if (pageCode) {
            const verification = verifyReusePlan(pageCode, currentReusePlan)

            if (verification.passed.length > 0) {
              console.log(
                chalk.dim(`  ✓ Reuse verified for "${name}": ${verification.passed.map(p => p.component).join(', ')}`),
              )
            }

            if (verification.missed.length > 0) {
              const missedNames = verification.missed.map(m => m.component)
              console.log(chalk.yellow(`  ⚠ Missed reuse in "${name}": ${missedNames.join(', ')} — patching...`))
              try {
                const ai = await createAIProvider(provider)
                if (ai.editPageCode) {
                  const patchLines = verification.missed.map(m => {
                    const importPath =
                      m.importPath ||
                      `@/components/shared/${m.component.replace(/([A-Z])/g, (_, c, i) => (i ? '-' : '') + c.toLowerCase()).replace(/^-/, '')}`
                    return `- Add: import { ${m.component} } from '${importPath}'\n  Then find any inline implementation of ${m.component} and replace with <${m.component} />`
                  })
                  const patchInstruction = `Add these shared components to this page:\n${patchLines.join('\n')}\n\nKeep all existing functionality. Only add imports and replace inline duplicates.`
                  const patched = await ai.editPageCode(pageCode, patchInstruction, name)
                  if (patched && patched.length > 100 && /export\s+(default\s+)?function/.test(patched)) {
                    ;(codePage.changes as Record<string, unknown>).pageCode = patched
                    console.log(chalk.dim(`  ✓ Patched ${missedNames.join(', ')} into "${name}"`))
                  }
                }
              } catch {
                /* patch failed, keep original */
              }
            }
          }
        }

        if (projectRoot && codePage && currentManifest) {
          const finalPageCode = (codePage.changes as Record<string, unknown>)?.pageCode as string
          if (finalPageCode) {
            await updateManifestSafe(projectRoot, m => {
              const updatedShared = m.shared.map(entry => {
                const isUsed = finalPageCode.includes(`{ ${entry.name} }`) || finalPageCode.includes(`{ ${entry.name},`)
                if (isUsed && !entry.usedIn.includes(route)) {
                  return { ...entry, usedIn: [...entry.usedIn, route] }
                }
                return entry
              })
              return { ...m, shared: updatedShared }
            })
          }
        }

        if (projectRoot && codePage) {
          const finalPageCode = (codePage.changes as Record<string, unknown>)?.pageCode as string
          if (finalPageCode) {
            try {
              const decisions = extractDecisionsFromCode(finalPageCode)
              if (decisions.length > 0) appendDecisions(projectRoot, name, route, decisions)
            } catch {
              /* memory is best-effort */
            }
          }
        }

        return codePage || { type: 'add-page' as const, target: 'new', changes: { id, name, route } }
      } catch (err) {
        phase5Done++
        spinner.text = `Phase 6/6 — ${phase5Done}/${remainingPages.length} pages generated...`
        // Surface the failure so partial-success runs don't silently degrade. The
        // empty add-page request still flows through so retry + templates can
        // salvage the page, but the user knows which page failed and why.
        const reason = err instanceof Error ? err.message : String(err)
        console.log(chalk.yellow(`\n  ⚠  "${name}" (${route}) generation failed: ${reason}`))
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
        const retryTieredNote = currentManifest
          ? buildTieredComponentsPrompt(currentManifest, retryPageType as 'marketing' | 'app' | 'auth')
          : undefined
        const lightweightPrompt = buildLightweightPagePrompt(
          pageName,
          pageRoute,
          styleContext || '',
          parseOpts.sharedComponentsSummary,
          retryPageType,
          retryTieredNote,
        )
        const retryResult = await parseModification(lightweightPrompt, modCtx, provider, {
          ...parseOpts,
          lightweight: true,
        })
        const codePage = retryResult.requests.find((r: ModificationRequest) => r.type === 'add-page')
        if (codePage && (codePage.changes as Record<string, unknown>)?.pageCode) {
          const idx = allRequests.indexOf(req)
          if (idx !== -1) allRequests[idx] = codePage
        } else {
          // Retry returned without usable code — make this visible, don't swallow.
          console.log(chalk.yellow(`  ⚠  Retry for "${pageName}" (${pageRoute}) returned no pageCode`))
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.log(chalk.yellow(`  ⚠  Retry for "${pageName}" (${pageRoute}) threw: ${reason}`))
      }
    }
  }

  endPhase6Timer()

  const withCode = allRequests.filter(r => (r.changes as Record<string, unknown>)?.pageCode).length
  const emptyCount = allRequests.length - withCode
  if (withCode === 0) {
    spinner.warn(`Phase 6/6 — Generated ${allRequests.length} pages (0 with full code — AI may have failed)`)
  } else if (emptyCount > 0) {
    // Partial success — use .warn not .succeed so user sees the shortfall.
    spinner.warn(
      `Phase 6/6 — Generated ${allRequests.length} pages (${withCode} with full code, ${emptyCount} empty / template fallback)`,
    )
  } else {
    spinner.succeed(`Phase 6/6 — Generated ${allRequests.length} pages (${withCode} with full code)`)
  }

  if (projectRoot) {
    try {
      truncateMemory(projectRoot)
    } catch {
      /* memory is best-effort */
    }
  }

  if (projectRoot && plan) {
    const integrityIssues = validateLayoutIntegrity(projectRoot, plan)
    if (integrityIssues.length > 0) {
      console.log('')
      console.log(chalk.yellow('⚠ Layout integrity issues detected:'))
      for (const issue of integrityIssues) {
        const icon = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠')
        console.log(`  ${icon} ${issue.message}`)
      }
      console.log(chalk.cyan('\n  👉 Run `coherent fix` to repair automatically.\n'))
    }
  }

  return { requests: allRequests, plan }
}

const SharedExtractionItemSchema = z.object({
  name: z.string().min(2).max(50),
  type: SharedComponentTypeSchema,
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
      let { code: fixedCode } = await autoFixCode(item.code)
      fixedCode = fixedCode.replace(/export default function (\w+)/g, 'export function $1')

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
