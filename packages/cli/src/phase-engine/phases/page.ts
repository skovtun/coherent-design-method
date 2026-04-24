/**
 * Page phase (AI) — per-page generation factory.
 *
 * `createPagePhase(pageId)` returns one {@link AiPhase} per page. A pipeline
 * runner (Lane C) loops `plan.pages` and invokes `runPipeline` once per id;
 * per-page parallelism (chat rail's pMap with AI_CONCURRENCY=3) lives in
 * that runner, not here.
 *
 * Input artifact: a single `pages-input.json` with `{ shared, pages }` — the
 * shared bundle + one {@link PageSpec} per page. Phase looks up its entry
 * by pageId, builds the prompt via {@link buildPagePrompt}, and on ingest
 * writes `page-<id>.json` with the parsed add-page request.
 *
 * Deferred to session-end (matches components phase pattern):
 *  - `verifyReusePlan` + `editPageCode` patching (second AI call).
 *  - `autoFixCode` and the validator loop (talks to tsc/package.json).
 *  - `manifest.usedIn` updates (project-disk state).
 *  - `extractDecisionsFromCode` + `appendDecisions` (project-disk memory).
 *  - Empty-page retry via `buildLightweightPagePrompt` (second AI call;
 *    belongs in the runner's retry-with-fallback hook, like components).
 *
 * `PageArtifact` preserves the spec metadata alongside the `request` so
 * session-end can apply each page without re-reading `pages-input.json`.
 */

import type { ModificationRequest } from '@getcoherent/core'
import type { AiPhase, PhaseContext } from '../phase.js'
import { buildPagePrompt, type PageSpec, type PagesInputShared } from '../prompt-builders/page.js'
import { parsePlanResponse } from './plan.js'
import { pickAddPageRequest } from './anchor.js'

/** Input artifact shape. Written by `coherent session start` or by caller. */
export interface PagesInput {
  shared: PagesInputShared
  pages: PageSpec[]
}

/**
 * Output artifact. One file per page.
 *
 * `request` is the ModificationRequest (type `add-page`) with the generated
 * `pageCode` in `changes.pageCode`, or `null` when the AI returned no usable
 * add-page request (runner may invoke a fallback phase).
 */
export interface PageArtifact {
  id: string
  name: string
  route: string
  pageType: 'marketing' | 'app' | 'auth'
  request: ModificationRequest | null
}

export interface PagePhaseOptions {
  /** Artifact to read PagesInput from. Default `pages-input.json`. */
  inputArtifact?: string
  /**
   * Artifact to write PageArtifact to. Default `page-<id>.json` using the
   * pageId passed to the factory. Override to route output for testing.
   */
  outputArtifact?: string
}

function assertSpec(input: PagesInput, pageId: string): PageSpec {
  const spec = input.pages.find(p => p.id === pageId)
  if (!spec) {
    throw new Error(`page: pageId ${JSON.stringify(pageId)} not found in pages-input.json`)
  }
  return spec
}

/**
 * Factory. Returns one phase per page; the runner decides how many to run
 * and at what concurrency.
 */
export function createPagePhase(pageId: string, options: PagePhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'pages-input.json'
  const outputFile = options.outputArtifact ?? `page-${pageId}.json`

  async function loadInput(ctx: PhaseContext): Promise<PagesInput> {
    const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
    if (raw === null) {
      throw new Error(`page: missing required artifact ${JSON.stringify(inputFile)}`)
    }
    const parsed = JSON.parse(raw) as Partial<PagesInput>
    if (!parsed.shared || !Array.isArray(parsed.pages)) {
      throw new Error(`page: artifact ${JSON.stringify(inputFile)} must have a "shared" object and a "pages" array`)
    }
    return parsed as PagesInput
  }

  return {
    kind: 'ai',
    name: `page:${pageId}`,

    async prep(ctx: PhaseContext): Promise<string> {
      const input = await loadInput(ctx)
      const spec = assertSpec(input, pageId)
      return buildPagePrompt(spec, input.shared)
    },

    async ingest(rawResponse: string, ctx: PhaseContext): Promise<void> {
      const input = await loadInput(ctx)
      const spec = assertSpec(input, pageId)
      const parsed = parsePlanResponse(rawResponse)
      const request = pickAddPageRequest(parsed)

      const out: PageArtifact = {
        id: spec.id,
        name: spec.name,
        route: spec.route,
        pageType: spec.pageType,
        request,
      }
      await ctx.session.writeArtifact(ctx.sessionId, outputFile, JSON.stringify(out, null, 2))
    },
  }
}
