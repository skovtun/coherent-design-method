/**
 * Page prompt builder — per-page generation prompt for Phase 6 parity.
 *
 * Two pieces compose the final prompt:
 *  1. An inline "mini-message" that names the page, route, pageType, and the
 *     per-page hints (atmosphere, design-quality, layout, reuse, auth, plan
 *     summary, existing-pages context, style context, design memory).
 *  2. The full modification prompt from {@link buildModificationPrompt},
 *     which wraps the mini-message with design constraints + component
 *     registry + shadcn list + rules.
 *
 * The mini-message mirrors the inline prompt assembled in Phase 6 of
 * `splitGeneratePages` (chat rail). Keeping it byte-identical is a parity-
 * harness requirement: both rails must produce the same string for the same
 * inputs so MockProvider replay matches.
 *
 * All per-page derived state (authNote, designConstraints, layoutNote, etc.)
 * is pre-computed by the caller (session-start in skill rail, direct call
 * site in chat rail). This keeps the phase itself ignorant of helpers like
 * getPageType, buildLayoutNote, buildReusePlan — those stay in the caller.
 */

import type { DesignSystemConfig } from '@getcoherent/core'
import { expandPageRequest } from '../../agents/page-templates.js'
import { buildModificationPrompt } from './modification.js'

/** Per-page bundle. Caller fills these in from plan + manifest + reuse planner. */
export interface PageSpec {
  id: string
  name: string
  route: string
  pageType: 'marketing' | 'app' | 'auth'
  /** Pre-rendered `renderAtmosphereDirective(plan.atmosphere)` output. */
  atmosphereDirective: string
  /** Pre-rendered `getDesignQualityForType(pageType)` output. */
  designConstraints: string
  /** Pre-rendered `buildLayoutNote(groupLayout)` output. */
  layoutNote: string
  /**
   * Pre-resolved directive. Caller applies the fallback chain:
   * `reusePlanDirective || tieredNote || sharedComponentsNote || ''`.
   * The empty-string case signals "no reuse hint this page".
   */
  reusePlanDirective: string
  /**
   * Optional `buildTieredComponentsPrompt` output. Passed through to
   * `buildModificationPrompt` so its internal fallback (reuse → tiered →
   * summary) matches chat rail behavior.
   */
  tieredComponentsPrompt: string | undefined
  /** null when not an auth page, else the auth note string. */
  authNote: string | null
  /** Pre-rendered `formatPlanSummary(plan, route)` output, or '' when no plan. */
  planSummary: string
  /** Pre-rendered `buildExistingPagesContext(config, pageType)` output. */
  existingPagesContext: string
  /** Sections from `plan.pageNotes[pageKey]?.sections || []`. */
  pageSections: string[]
}

/** Shared inputs (same for every page in the batch). */
export interface PagesInputShared {
  /** Raw user message, used in the `Context:` line and by contextual-rules selector. */
  message: string
  /** Output of extract-style phase. Empty string when anchor produced no patterns. */
  styleContext: string
  /**
   * Pre-rendered `EXISTING APP PAGE...` block, or '' when no existing app
   * page on disk. Caller skips the block for `pageType === 'auth'`; the
   * phase does the skip re-check for safety.
   */
  existingAppPageNote: string
  /** Pre-rendered `formatMemoryForPrompt(readDesignMemory(projectRoot))` output. */
  designMemoryBlock: string
  /** `EXISTING ROUTES in this project: ...` sentence. */
  routeNote: string
  /** Constant alignment-rule sentence. */
  alignmentNote: string
  /** DesignSystemConfig for buildModificationPrompt. */
  config: DesignSystemConfig
  /** Pre-built component registry string. */
  componentRegistry: string
  /** buildModificationPrompt's sharedComponentsSummary option. */
  sharedComponentsSummary: string | undefined
  /** Project root when available — enables buildProjectContextFromRoot. */
  projectRoot: string | null
}

/**
 * Assemble the inline mini-message. Matches Phase 6's `const prompt = [...]`
 * literal exactly. Pure. Empty strings and null entries are filtered before
 * joining to preserve the original `.filter(Boolean)` semantics.
 */
export function buildInlinePagePrompt(spec: PageSpec, shared: PagesInputShared): string {
  const reuseOrFallback = spec.reusePlanDirective || spec.tieredComponentsPrompt || undefined
  const parts: Array<string | null | undefined> = [
    `Create ONE page called "${spec.name}" at route "${spec.route}".`,
    spec.atmosphereDirective,
    `Context: ${shared.message}.`,
    `Generate complete pageCode for this single page only. Do not generate other pages.`,
    `FORBIDDEN in pageCode: <header>, <nav>, <footer>, site-wide navigation, copyright footers. The layout provides all of these.`,
    `PAGE TYPE: ${spec.pageType}`,
    spec.designConstraints,
    spec.layoutNote,
    reuseOrFallback,
    shared.routeNote,
    shared.alignmentNote,
    spec.authNote,
    spec.planSummary,
    spec.pageType !== 'auth' ? shared.existingAppPageNote : undefined,
    spec.existingPagesContext,
    shared.styleContext,
    shared.designMemoryBlock,
  ]
  return parts.filter((p): p is string => Boolean(p)).join('\n\n')
}

/**
 * Build the final per-page prompt: inline mini-message wrapped by
 * buildModificationPrompt. Replicates parseModification's non-planOnly /
 * non-lightweight branch:
 *
 *  - preParseDestructive is skipped. It only fires for "delete X page"
 *    patterns; the inline mini-message starts with "Create ONE page..."
 *    so the regex never matches. Skipping it keeps the phase pure.
 *  - isAddPage + expandPageRequest runs. The inline message does include
 *    "Create ... page" so the regex fires; expandPageRequest may or may
 *    not expand depending on whether the captured word is a known page
 *    type. Byte-identical match with chat rail requires running it.
 */
export function buildPagePrompt(spec: PageSpec, shared: PagesInputShared): string {
  const inline = buildInlinePagePrompt(spec, shared)

  let enhancedMessage = inline
  let isExpandedPageRequest = false
  const isAddPage = /add|create|make.*page/i.test(inline)
  if (isAddPage) {
    const match = inline.match(/(?:add|create|make)\s+(?:a\s+)?(\w+)\s+page/i)
    if (match) {
      const expanded = expandPageRequest(match[1], inline)
      if (expanded !== inline) {
        enhancedMessage = expanded
        isExpandedPageRequest = true
      }
    }
  }

  return buildModificationPrompt(enhancedMessage, shared.config, shared.componentRegistry, {
    isExpandedPageRequest,
    sharedComponentsSummary: shared.sharedComponentsSummary,
    tieredComponentsPrompt: spec.tieredComponentsPrompt,
    reusePlanDirective: spec.reusePlanDirective || undefined,
    pageSections: spec.pageSections,
    projectRoot: shared.projectRoot ?? undefined,
    // Pass the plan-resolved pageType through so the design-quality block
    // matches the page (marketing/app/auth) instead of falling back to "app"
    // because route inference can't read the route out of the wrapped inline
    // prompt. Codex /codex review P2 #2.
    pageType: spec.pageType,
  })
}
