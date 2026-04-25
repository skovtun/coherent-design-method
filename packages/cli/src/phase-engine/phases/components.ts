/**
 * Components phase (AI) — batch shared-component generation.
 *
 * Wraps the batch prompt+parse path of `generateSharedComponentsFromPlan`.
 * Reads `components-input.json` (the plan's sharedComponents list +
 * styleContext from extract-style), builds one batch prompt, ingests the
 * AI response, and writes `components-generated.json` with the per-component
 * code blobs.
 *
 * Project-disk side effects (autoFixCode, missing-package install,
 * generateSharedComponent → write tsx + manifest update) live in
 * `coherent session end` per the design doc R2 pattern: phases produce
 * artifacts; session end applies them.
 *
 * The per-component fallback path (when the batch parse fails) stays in the
 * legacy `generateSharedComponentsFromPlan` for now — it requires N more AI
 * calls inside ingest, which doesn't fit the single-call AiPhase contract.
 * Caller can implement retry-with-fallback at the runPipeline layer (Lane C)
 * if needed.
 */

import type { AiPhase, PhaseContext } from '../phase.js'
import type { ArchitecturePlan, GeneratedComponent } from '../../commands/chat/plan-generator.js'
import type { DesignSystemConfig } from '@getcoherent/core'
import { buildComponentsBatchPrompt } from '../prompt-builders/components-batch.js'
import { parsePlanResponse, type PlanArtifact, type PlanInput } from './plan.js'
import type { PageSpec, PagesInputShared } from '../prompt-builders/page.js'
import type { PagesInput } from './page.js'
import { getDesignQualityForType, inferPageTypeFromRoute } from '../../agents/design-constraints.js'

/** Input artifact for the components phase. Written by `coherent session start`. */
export interface ComponentsInput {
  sharedComponents: ArchitecturePlan['sharedComponents']
  /** Output of extract-style phase. Empty string when anchor produced no patterns. */
  styleContext: string
}

/**
 * Output artifact. Each entry is `{name, code, file}` ready for session-end
 * to feed through `autoFixCode` → `generateSharedComponent`.
 *
 * `code` is the raw AI output with `export default function X` rewritten to
 * `export function X` (the named-export convention enforced by downstream
 * generation). It has NOT been autofixed — that's session-end's job since
 * autoFixCode talks to disk-bound state (TypeScript, package.json).
 */
export interface ComponentsArtifact {
  components: GeneratedComponent[]
}

export interface ComponentsPhaseOptions {
  /** Artifact to read ComponentsInput from. Default `components-input.json`. */
  inputArtifact?: string
  /** Artifact to write ComponentsArtifact to. Default `components-generated.json`. */
  outputArtifact?: string
  /**
   * Artifact to seed with PagesInput so every subsequent `_phase prep
   * page:<id>` call finds its input. Default `pages-input.json`. Set to
   * `null` to suppress the chain (e.g. chat-rail facade that seeds
   * pages-input from its richer in-process state).
   */
  pagesInputArtifact?: string | null
}

function toKebabCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Pull the per-component code blobs out of a parsed batch response. Pure.
 * Skips entries that lack a function export (named or default) so empty/
 * stub responses don't poison the artifact. Rewrites `export default function`
 * to `export function` to satisfy the named-export convention.
 */
export function pickGeneratedComponents(
  parsed: Record<string, unknown>,
  specs: ArchitecturePlan['sharedComponents'],
): GeneratedComponent[] {
  const requests = (parsed.requests as Array<{ type?: string; changes?: Record<string, unknown> }> | undefined) ?? []
  const out: GeneratedComponent[] = []
  for (const comp of specs) {
    const match = requests.find(
      r => r?.type === 'add-page' && (r?.changes as Record<string, unknown> | undefined)?.name === comp.name,
    )
    const code = (match?.changes as Record<string, unknown> | undefined)?.pageCode
    if (typeof code !== 'string' || !code) continue
    if (!code.includes('export function') && !code.includes('export default')) continue
    const fixedCode = code.replace(/export default function (\w+)/g, 'export function $1')
    out.push({
      name: comp.name,
      code: fixedCode,
      file: `components/shared/${toKebabCase(comp.name)}.tsx`,
    })
  }
  return out
}

/**
 * Constant alignment-rule sentence every page prompt embeds. Matches the
 * chat rail's phrasing byte-for-byte so parity harness diffs stay clean.
 */
const ALIGNMENT_NOTE =
  'ALIGNMENT: the container class on every page MUST match the home page exactly so headers, footers, and content blocks line up across routes.'

/**
 * Minimum viable PagesInput composition for v0.9.0 skill-mode. Reads the
 * plan + plan-input + style artifacts and pre-renders one PageSpec per page
 * plus a shared block. Fields that depend on chat-rail-only state (layout
 * groups, reuse planner, design memory, existing-pages scan, project root)
 * are filled with sensible defaults so the page phase's prompt builder
 * doesn't crash. The chat-rail facade (future Lane D task) will provide a
 * richer composition — this path is for skill-mode only.
 */
async function seedPagesInputFromSessionArtifacts(
  ctx: PhaseContext,
  styleContext: string,
  artifactName: string,
): Promise<void> {
  const planRaw = await ctx.session.readArtifact(ctx.sessionId, 'plan.json')
  const planInputRaw = await ctx.session.readArtifact(ctx.sessionId, 'plan-input.json')
  if (planRaw === null || planInputRaw === null) {
    // Plan or plan-input absent → nothing to compose pages from. Skip the
    // write; the page phase will surface a clean "missing required artifact"
    // error if a caller still tries to advance.
    return
  }

  const plan = JSON.parse(planRaw) as PlanArtifact
  const planInput = JSON.parse(planInputRaw) as PlanInput
  if (plan.pageNames.length === 0) return

  // The first page in plan.pageNames is the anchor — anchor phase has already
  // generated its full pageCode and emitted `page-<anchorId>.json` (see
  // anchor.ts ingest). Skipping it from pages-input.json prevents a second
  // wasted prep cycle that would regenerate the same page from scratch
  // (codex /codex P2 #3 — skill rail duplicate).
  const anchorPage = plan.pageNames[0]
  const pageNamesForGeneration = plan.pageNames.slice(1)
  const routeNote = `EXISTING ROUTES in this project: ${plan.pageNames.map(p => p.route).join(', ')}`

  // Empty after dropping the anchor — single-page plan, anchor covers it.
  // Skip writing pages-input.json so page phase has nothing to run.
  if (pageNamesForGeneration.length === 0) {
    void anchorPage
    return
  }

  const pages: PageSpec[] = pageNamesForGeneration.map(p => {
    const pageType = inferPageTypeFromRoute(p.route)
    return {
      id: p.id,
      name: p.name,
      route: p.route,
      pageType,
      atmosphereDirective: '',
      designConstraints: getDesignQualityForType(pageType),
      layoutNote: '',
      reusePlanDirective: '',
      tieredComponentsPrompt: undefined,
      authNote: null,
      planSummary: '',
      existingPagesContext: '',
      pageSections: [],
    }
  })

  const shared: PagesInputShared = {
    message: planInput.message,
    styleContext,
    existingAppPageNote: '',
    designMemoryBlock: '',
    routeNote,
    alignmentNote: ALIGNMENT_NOTE,
    config: planInput.config as DesignSystemConfig,
    componentRegistry: '',
    sharedComponentsSummary: undefined,
    projectRoot: null,
  }

  const pagesInput: PagesInput = { shared, pages }
  await ctx.session.writeArtifact(ctx.sessionId, artifactName, JSON.stringify(pagesInput, null, 2))
}

export function createComponentsPhase(options: ComponentsPhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'components-input.json'
  const outputFile = options.outputArtifact ?? 'components-generated.json'
  const pagesInputFile = options.pagesInputArtifact === undefined ? 'pages-input.json' : options.pagesInputArtifact

  async function loadInput(ctx: PhaseContext): Promise<ComponentsInput> {
    const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
    if (raw === null) {
      throw new Error(`components: missing required artifact ${JSON.stringify(inputFile)}`)
    }
    const parsed = JSON.parse(raw) as Partial<ComponentsInput>
    if (!Array.isArray(parsed.sharedComponents) || typeof parsed.styleContext !== 'string') {
      throw new Error(
        `components: artifact ${JSON.stringify(inputFile)} must have an array "sharedComponents" and a string "styleContext"`,
      )
    }
    return {
      sharedComponents: parsed.sharedComponents,
      styleContext: parsed.styleContext,
    }
  }

  return {
    kind: 'ai',
    name: 'components',

    async prep(ctx: PhaseContext): Promise<string> {
      const input = await loadInput(ctx)
      return buildComponentsBatchPrompt(input.sharedComponents, input.styleContext)
    },

    async ingest(rawResponse: string, ctx: PhaseContext): Promise<void> {
      const input = await loadInput(ctx)
      const parsed = parsePlanResponse(rawResponse)
      const components = pickGeneratedComponents(parsed, input.sharedComponents)
      const out: ComponentsArtifact = { components }
      await ctx.session.writeArtifact(ctx.sessionId, outputFile, JSON.stringify(out, null, 2))

      // Chain pages-input.json so `_phase prep page:<id>` finds its input
      // (codex P1 #1 chain, part 4/4). v0.9.0 skill-mode composes a minimum-
      // viable PagesInput from plan + style artifacts; the chat-rail facade
      // (future) will replace this with a richer composition that matches
      // chat's in-process prompt assembly.
      if (pagesInputFile !== null) {
        await seedPagesInputFromSessionArtifacts(ctx, input.styleContext, pagesInputFile)
      }
    },
  }
}
