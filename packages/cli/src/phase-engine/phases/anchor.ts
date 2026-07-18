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

import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'
import { type AiPhase, type PhaseContext, PHASE_SKIP_SENTINEL, isSkipSentinel } from '../phase.js'
import { isAuthRoute, detectPageType } from '../../agents/page-templates.js'
import type { ArchitecturePlan } from '../../commands/chat/plan-generator.js'
import { renderAtmosphereDirective } from '../../commands/chat/plan-generator.js'
import { buildModificationPrompt } from '../prompt-builders/modification.js'
import { parsePlanResponse } from './plan.js'

/**
 * Fenced-TSX output-shape lock for the anchor page (overrides the JSON schema
 * in the wrapping modification prompt).
 *
 * Two problems this solves, both new with Sonnet 5 (vs retired Sonnet 4):
 * 1. Decomposition — Sonnet 5 reads the full modification schema and "helpfully"
 *    splits "build a landing page" into update-token / add-component requests
 *    with an empty add-page, so no page is ever produced.
 * 2. JSON-string fragility — cramming a 15KB TSX file into an escaped JSON
 *    string truncates or malforms often.
 * The fix is the fenced protocol: a tiny JSON header + the page in a real ```tsx
 * fence, parsed by {@link parseFencedTsxResponse}. Same shape skill-mode's
 * anchor phase uses. Parameterized by the page so the export name and header
 * hints match. Pure.
 */
function anchorOutputLock(homePage: { name: string; route: string }): string {
  const className = (homePage.name || 'Anchor').replace(/[^a-zA-Z0-9]/g, '') || 'AnchorPage'
  return `
## Output format (OVERRIDES the "return pageCode as a JSON string" instructions above)

Return TWO sections separated by a blank line. Do NOT return update-token, add-component, or modify-layout-block requests — return exactly this:

1. A JSON header object — page metadata only, NO pageCode field:

\`\`\`
{ "type": "add-page", "target": "new", "changes": { "id": "home", "name": "${homePage.name}", "route": "${homePage.route}", "title": "...", "description": "..." } }
\`\`\`

2. A blank line, then the ENTIRE page as raw TSX in a \`\`\`tsx fenced block (a default-export React component named ${className}), with NO JSON escaping:

\`\`\`tsx
export default function ${className}() {
  return <div>...</div>
}
\`\`\`

The TSX goes in the fenced block ONLY — never inside the JSON.`
}

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
Context: ${message}. This is the application's entry point — a clean, centered authentication form. Generate complete pageCode. Do NOT include site-wide <header>, <nav>, or <footer> — this page has its own minimal layout. Make it visually polished with proper form validation UI — this page sets the design direction for the entire site. Do not generate other pages.
${anchorOutputLock(homePage)}`
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
Do not generate other pages.
${anchorOutputLock(homePage)}`
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
Do not generate other pages.
${anchorOutputLock(homePage)}`
}

/** Input artifact for the anchor phase. Written by `coherent session start`. */
export interface AnchorInput {
  homePage: { name: string; route: string; id?: string }
  message: string
  allPagesList: string
  allRoutes: string
  plan: ArchitecturePlan | null
  /**
   * Project config — needed to wrap the short anchor directive with the full
   * modification prompt (CORE_CONSTRAINTS + JSON response schema). Without
   * the wrapper, the AI sees a 9-line directive with no output-format
   * instructions and falls back to ad-hoc exploration. Optional for
   * backward-compat with older session.json files; missing config falls
   * back to the bare directive.
   */
  config?: DesignSystemConfig
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

/**
 * Parse an anchor- or page-phase response into a ModificationRequest.
 *
 * M14 (PHASE_ENGINE_PROTOCOL=2): supports two formats. Tries fenced TSX first;
 * falls back to legacy JSON-with-pageCode for one release so older skill
 * markdown still ingests.
 *
 * Fenced TSX shape:
 *
 *     { "type": "add-page", "target": "new", "changes": { "id": "...", ... } }
 *
 *     ```tsx
 *     import ...
 *     export default function ...() { ... }
 *     ```
 *
 * Returns null when neither format yields a usable add-page request.
 *
 * Lives in anchor.ts (not page.ts) to avoid a circular import — page.ts
 * already imports `pickAddPageRequest` from here.
 */
export function parseAnchorOrPageResponse(rawResponse: string): ModificationRequest | null {
  const trimmed = rawResponse.trim()

  const fencedMatch = trimmed.match(/^(\{[\s\S]*?\})\s*\n\s*```tsx\s*\n([\s\S]*?)\n```\s*$/)
  if (fencedMatch) {
    const headerJson = fencedMatch[1]
    const tsxBody = fencedMatch[2]
    try {
      const header = JSON.parse(headerJson) as Record<string, unknown>
      let headerRequest: ModificationRequest | null = null
      if (header.type === 'add-page') {
        headerRequest = header as unknown as ModificationRequest
      } else if (Array.isArray(header.requests)) {
        const found = (header.requests as ModificationRequest[]).find(r => r?.type === 'add-page')
        if (found) headerRequest = found
      }
      if (!headerRequest) return null
      const headerChanges = (headerRequest.changes as Record<string, unknown> | undefined) ?? {}
      // When the header was a `{requests: [...]}` envelope, `headerChanges`
      // holds the inner request's changes. When the header was a flat
      // add-page object, the top-level header IS the changes-equivalent.
      const baseChanges = Object.keys(headerChanges).length > 0 ? headerChanges : (header as Record<string, unknown>)
      const merged: ModificationRequest = {
        ...headerRequest,
        type: 'add-page',
        target: headerRequest.target ?? 'new',
        changes: {
          ...baseChanges,
          pageCode: tsxBody,
        },
      }
      return merged
    } catch {
      // Fall through to legacy parse — header JSON was malformed.
    }
  }

  // Legacy fallback. parsePlanResponse throws SyntaxError on non-JSON or on
  // missing closing brace; treat that as "no add-page request available" and
  // return null instead of bubbling up. The runner can then re-prompt.
  try {
    const parsed = parsePlanResponse(rawResponse)
    return pickAddPageRequest(parsed)
  } catch {
    return null
  }
}

export function createAnchorPhase(options: AnchorPhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'anchor-input.json'
  const anchorFile = options.anchorArtifact ?? 'anchor.json'

  /**
   * Returns `null` when the input artifact is missing — the plan phase
   * intentionally suppresses `anchor-input.json` when no add-page was
   * requested (codex P1 #1 from M14, see plan.ts:224). v0.11.4: callers
   * use `null` to mean "graceful skip" via PHASE_SKIP_SENTINEL instead of
   * throwing → the CLI no longer prints `❌ anchor prep failed` for what
   * is a legitimate plan-only flow.
   */
  async function loadInputOrNull(ctx: PhaseContext): Promise<AnchorInput | null> {
    const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
    if (raw === null) return null
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
      config: parsed.config as DesignSystemConfig | undefined,
    }
  }

  return {
    kind: 'ai',
    name: 'anchor',

    async prep(ctx: PhaseContext): Promise<string> {
      const input = await loadInputOrNull(ctx)
      // v0.11.4 — plan-only sessions (delete-page, update-token, etc.)
      // produce no anchor-input.json. Pre-v0.11.4 we threw "missing
      // required artifact" → CLI exit 1 → user saw `❌ anchor prep
      // failed`. The skill agent at runtime then guessed "Plan-only
      // delete — skipping anchor/components". v0.11.4 emits the skip
      // sentinel cleanly so the CLI exits 0 and the skill body can
      // detect via `isSkipSentinel` and skip Write+ingest. Components
      // phase has used this exact pattern since M14.
      if (input === null) return PHASE_SKIP_SENTINEL
      const directive = buildAnchorPagePrompt(
        input.homePage,
        input.message,
        input.allPagesList,
        input.allRoutes,
        input.plan,
      )
      // Wrap the short anchor directive with the full modification prompt so
      // Claude receives CORE_CONSTRAINTS + the JSON output schema. Without the
      // wrapper, the AI sees a ~9-line directive with no format instructions
      // and either guesses the schema or falls into ad-hoc source-tree
      // exploration (`find`, `grep`) — and exploration triggers permission
      // prompts on every step. Chat rail does the same wrap by passing the
      // anchor directive through `parseModification` → `buildModificationPrompt`.
      // Falls back to the bare directive when config isn't present (older
      // session.json from a prior CLI version).
      if (!input.config) return directive
      const detected = detectPageType(input.homePage.name) || detectPageType(input.homePage.route)
      const isAuth =
        isAuthRoute(input.homePage.route) ||
        isAuthRoute(input.homePage.name) ||
        new Set(['login', 'register', 'reset-password']).has(detected || '')
      const pageType: 'marketing' | 'app' | 'auth' = isAuth
        ? 'auth'
        : detected === 'landing' ||
            detected === 'pricing' ||
            detected === 'about' ||
            detected === 'contact' ||
            detected === 'blog'
          ? 'marketing'
          : 'app'
      // The fenced ```tsx output-format instruction now lives inside
      // `directive` (via buildAnchorPagePrompt → anchorOutputLock), so both the
      // skill rail (here) and the in-process chat rail share one source and the
      // model never sees the instruction twice.
      return buildModificationPrompt(directive, input.config, '', { pageType })
    },

    async ingest(rawResponse: string, ctx: PhaseContext): Promise<void> {
      // v0.11.4 — tolerate the skip sentinel as input. Older skill markdown
      // that doesn't yet detect the sentinel will pipe it through to ingest;
      // prep() emitted it because there was no add-page in the plan, so
      // there's nothing to ingest. No-op.
      if (isSkipSentinel(rawResponse)) return

      const input = await loadInputOrNull(ctx)
      // The sentinel guard above covers the "prep emitted skip → ingest
      // sees sentinel" path. The branch below covers the rare "ingest
      // called without a matching prep" case (e.g. from a custom test or
      // a partial skill body). Same outcome — no-op rather than throw.
      if (input === null) return

      const request = parseAnchorOrPageResponse(rawResponse)
      const pageCode =
        request && typeof (request.changes as Record<string, unknown>)?.pageCode === 'string'
          ? ((request.changes as Record<string, unknown>).pageCode as string)
          : ''

      const out: AnchorArtifact = { pageCode, request }
      await ctx.session.writeArtifact(ctx.sessionId, anchorFile, JSON.stringify(out, null, 2))

      // Also emit a `page-<anchorId>.json` so the session-end pages applier
      // writes the anchor page to disk via the same path as every other
      // generated page. Without this, anchor.json never reaches disk: the
      // skill rail used to re-generate the same anchor page in the page
      // phase a second time (codex /codex P2 #3 — skill rail duplicate).
      // Falls through silently when anchorId or request is missing —
      // session-end applier will simply have one fewer page to apply.
      const anchorId = input.homePage.id
      if (anchorId && request) {
        const changes = (request.changes as Record<string, unknown> | undefined) ?? {}
        const route =
          typeof changes.route === 'string' && changes.route ? (changes.route as string) : input.homePage.route
        const name = typeof changes.name === 'string' && changes.name ? (changes.name as string) : input.homePage.name
        const detected = detectPageType(input.homePage.name) || detectPageType(input.homePage.route)
        const isAuth =
          isAuthRoute(input.homePage.route) ||
          isAuthRoute(input.homePage.name) ||
          new Set(['login', 'register', 'reset-password']).has(detected || '')
        const pageType: 'marketing' | 'app' | 'auth' = isAuth
          ? 'auth'
          : detected === 'landing' ||
              detected === 'pricing' ||
              detected === 'about' ||
              detected === 'contact' ||
              detected === 'blog'
            ? 'marketing'
            : 'app'
        const pagePayload = {
          id: anchorId,
          name,
          route,
          pageType,
          request,
        }
        await ctx.session.writeArtifact(ctx.sessionId, `page-${anchorId}.json`, JSON.stringify(pagePayload, null, 2))
      }
    },
  }
}
