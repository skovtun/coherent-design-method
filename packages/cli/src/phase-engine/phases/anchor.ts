/**
 * Anchor phase (AI).
 *
 * Generates the home/anchor page that establishes the design direction for
 * the rest of the project. Subsequent page generations match this page's
 * style via the extract-style phase, which reads the same `anchor.json`
 * artifact this phase writes.
 *
 * Wraps the existing Phase 3 logic from split-generator.ts so chat and skill
 * rails share the same prompt + parse code. The "reuse existing anchor from
 * disk" + "fall back to placeholder when AI fails" branches stay in the
 * caller — this phase only owns the prompt cycle.
 */

import type { ModificationRequest } from '@getcoherent/core'
import type { AiPhase, PhaseContext } from '../phase.js'
import { isAuthRoute, detectPageType } from '../../agents/page-templates.js'
import type { ArchitecturePlan } from '../../commands/chat/plan-generator.js'
import { renderAtmosphereDirective } from '../../commands/chat/plan-generator.js'
import { parsePlanResponse } from './plan.js'

/**
 * Build the anchor-page prompt. Pure. Routes branch on auth / sidebar /
 * default treatment; each branch has its own design direction baked in.
 */
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

/** Input artifact for the anchor phase. Written by `coherent session start`. */
export interface AnchorInput {
  homePage: { name: string; route: string; id?: string }
  message: string
  allPagesList: string
  allRoutes: string
  plan: ArchitecturePlan | null
}

/**
 * Output artifact. `pageCode` is what extract-style consumes; `request` is
 * the full ModificationRequest for downstream phases that need to apply it
 * to the project (page-list, modification-handler).
 *
 * `request` is optional so existing extract-style tests that construct
 * `{ pageCode }` literals stay valid.
 */
export interface AnchorArtifact {
  pageCode: string
  request?: ModificationRequest | null
}

export interface AnchorPhaseOptions {
  /** Artifact to read AnchorInput from. Default `anchor-input.json`. */
  inputArtifact?: string
  /** Artifact to write AnchorArtifact to. Default `anchor.json`. */
  anchorArtifact?: string
}

/**
 * Pull the first add-page request out of a parsed plan response. Returns
 * null when none present. Pure.
 */
export function pickAddPageRequest(parsed: Record<string, unknown>): ModificationRequest | null {
  const requests = (parsed.requests as ModificationRequest[] | undefined) ?? []
  return requests.find(r => r?.type === 'add-page') ?? null
}

export function createAnchorPhase(options: AnchorPhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'anchor-input.json'
  const anchorFile = options.anchorArtifact ?? 'anchor.json'

  async function loadInput(ctx: PhaseContext): Promise<AnchorInput> {
    const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
    if (raw === null) {
      throw new Error(`anchor: missing required artifact ${JSON.stringify(inputFile)}`)
    }
    const parsed = JSON.parse(raw) as Partial<AnchorInput>
    if (
      !parsed.homePage ||
      typeof parsed.homePage.name !== 'string' ||
      typeof parsed.homePage.route !== 'string' ||
      typeof parsed.message !== 'string' ||
      typeof parsed.allPagesList !== 'string' ||
      typeof parsed.allRoutes !== 'string'
    ) {
      throw new Error(
        `anchor: artifact ${JSON.stringify(inputFile)} must have homePage{name,route}, message, allPagesList, allRoutes`,
      )
    }
    return {
      homePage: parsed.homePage,
      message: parsed.message,
      allPagesList: parsed.allPagesList,
      allRoutes: parsed.allRoutes,
      plan: (parsed.plan as ArchitecturePlan | null | undefined) ?? null,
    }
  }

  return {
    kind: 'ai',
    name: 'anchor',

    async prep(ctx: PhaseContext): Promise<string> {
      const input = await loadInput(ctx)
      return buildAnchorPagePrompt(input.homePage, input.message, input.allPagesList, input.allRoutes, input.plan)
    },

    async ingest(rawResponse: string, ctx: PhaseContext): Promise<void> {
      const parsed = parsePlanResponse(rawResponse)
      const request = pickAddPageRequest(parsed)
      const pageCode =
        request && typeof (request.changes as Record<string, unknown>)?.pageCode === 'string'
          ? ((request.changes as Record<string, unknown>).pageCode as string)
          : ''

      const out: AnchorArtifact = { pageCode, request }
      await ctx.session.writeArtifact(ctx.sessionId, anchorFile, JSON.stringify(out, null, 2))
    },
  }
}
