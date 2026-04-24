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
import { buildComponentsBatchPrompt } from '../prompt-builders/components-batch.js'
import { parsePlanResponse } from './plan.js'

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

export function createComponentsPhase(options: ComponentsPhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'components-input.json'
  const outputFile = options.outputArtifact ?? 'components-generated.json'

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
    },
  }
}
