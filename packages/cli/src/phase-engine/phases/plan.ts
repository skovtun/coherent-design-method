/**
 * Plan phase (AI).
 *
 * Wraps the existing `planOnly` prompt cycle from `parseModification` as an
 * AiPhase so both the chat rail (in-process) and skill rail (out-of-process)
 * share the same code path. Reads `plan-input.json`, builds the plan-only
 * prompt for the caller's AiProvider, ingests the raw response, and writes:
 *   - `plan.json`         — derived facts (pages, navType, appName)
 *   - `config-delta.json` — atomic patch for `coherent session end` to apply
 *                           to project config (name + navigation.type)
 *
 * Per design doc R2 (2026-04-23), config mutations live in a delta artifact
 * instead of being applied inline mid-pipeline. This phase is the first to
 * adopt that pattern; later phases merge into the same file.
 *
 * Two pure helpers (`parseNavTypeFromPlan`, `extractAppNameFromPrompt`) used
 * to live in split-generator.ts. They moved here to break the circular
 * dependency that would form if this phase imported from there. split-
 * generator.ts re-exports them so existing tests/imports stay green.
 */

import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'
import type { AiPhase, PhaseContext } from '../phase.js'
import { buildPlanOnlyPrompt } from '../prompt-builders/plan-only.js'

const VALID_NAV_TYPES = new Set(['header', 'sidebar', 'both', 'none'])

export type NavType = 'header' | 'sidebar' | 'both' | 'none'

/**
 * Read `navigation.type` from a plan response. Defaults to 'header' on
 * missing/invalid input. Pure.
 */
export function parseNavTypeFromPlan(planResult: Record<string, unknown>): NavType {
  const nav = planResult.navigation as Record<string, unknown> | undefined | null
  if (nav && typeof nav.type === 'string' && VALID_NAV_TYPES.has(nav.type)) {
    return nav.type as NavType
  }
  return 'header'
}

/**
 * Extract an app/product name from a user prompt deterministically.
 * Returns null when no plausible name is found. Pure.
 */
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

/** Input artifact for the plan phase. Written by `coherent session start`. */
export interface PlanInput {
  message: string
  config: DesignSystemConfig
}

/** Output artifact emitted by `ingest`. Captures AI-derived plan facts. */
export interface PlanArtifact {
  pageNames: Array<{ name: string; id: string; route: string }>
  navigationType: NavType
  /** `appName` field from the plan response, or null when omitted. */
  appName: string | null
}

/**
 * Append-only patch for project config. `coherent session end` reads this and
 * applies it atomically via two-phase commit (future Task #17). Multiple
 * phases may write to the same file — fields merge last-writer-wins.
 *
 * `name` here is the resolved name: explicit prompt name wins; else
 * plan.appName when the project's `config.name` is still the default 'My App'.
 */
export interface ConfigDelta {
  navigationType?: NavType
  name?: string
}

export interface PlanPhaseOptions {
  /** Artifact to read PlanInput from. Default `plan-input.json`. */
  inputArtifact?: string
  /** Artifact to write PlanArtifact to. Default `plan.json`. */
  planArtifact?: string
  /** Artifact to merge ConfigDelta into. Default `config-delta.json`. */
  configDeltaArtifact?: string
}

/**
 * Parse a raw plan-only response. Strips a leading ```json fence if present,
 * then JSON.parse. Returns the parsed object — wraps top-level arrays under a
 * `requests` key so callers can read uniformly. Throws on non-object roots.
 */
export function parsePlanResponse(raw: string): Record<string, unknown> {
  let body = raw.trim()
  if (body.startsWith('```')) {
    body = body
      .replace(/^```(?:json)?\s*/, '')
      .replace(/```\s*$/, '')
      .trim()
  }
  const parsed: unknown = JSON.parse(body)
  if (Array.isArray(parsed)) {
    return { requests: parsed }
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`plan: response did not parse to an object`)
  }
  return parsed as Record<string, unknown>
}

function derivePageNames(parsed: Record<string, unknown>): Array<{ name: string; id: string; route: string }> {
  const requests = (parsed.requests as ModificationRequest[] | undefined) ?? []
  return requests
    .filter(r => r?.type === 'add-page')
    .map(r => {
      const c = r.changes as Record<string, unknown>
      const name = (c.name as string) || (c.id as string) || 'page'
      const id = (c.id as string) || name.toLowerCase().replace(/\s+/g, '-')
      const route = (c.route as string) || `/${id}`
      return { name, id, route }
    })
}

/**
 * AiPhase wrapper around the plan-only cycle. Caller is responsible for
 * actually invoking the AiProvider with the prep() output and passing the
 * raw response back into ingest(). See phase.ts for the contract.
 */
export function createPlanPhase(options: PlanPhaseOptions = {}): AiPhase {
  const inputFile = options.inputArtifact ?? 'plan-input.json'
  const planFile = options.planArtifact ?? 'plan.json'
  const deltaFile = options.configDeltaArtifact ?? 'config-delta.json'

  async function loadInput(ctx: PhaseContext): Promise<PlanInput> {
    const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
    if (raw === null) {
      throw new Error(`plan: missing required artifact ${JSON.stringify(inputFile)}`)
    }
    const parsed = JSON.parse(raw) as Partial<PlanInput>
    if (typeof parsed.message !== 'string' || !parsed.config || typeof parsed.config !== 'object') {
      throw new Error(`plan: artifact ${JSON.stringify(inputFile)} must have a string "message" and an object "config"`)
    }
    return parsed as PlanInput
  }

  return {
    kind: 'ai',
    name: 'plan',

    async prep(ctx: PhaseContext): Promise<string> {
      const input = await loadInput(ctx)
      return buildPlanOnlyPrompt(input.message, input.config)
    },

    async ingest(rawResponse: string, ctx: PhaseContext): Promise<void> {
      const input = await loadInput(ctx)
      const parsed = parsePlanResponse(rawResponse)

      const pageNames = derivePageNames(parsed)
      const navigationType = parseNavTypeFromPlan(parsed)
      const planAppName = typeof parsed.appName === 'string' && parsed.appName ? parsed.appName : null

      const planArtifact: PlanArtifact = { pageNames, navigationType, appName: planAppName }
      await ctx.session.writeArtifact(ctx.sessionId, planFile, JSON.stringify(planArtifact, null, 2))

      const explicitName = extractAppNameFromPrompt(input.message)
      const resolvedName = explicitName ?? (planAppName && input.config.name === 'My App' ? planAppName : undefined)

      const newDelta: ConfigDelta = {}
      if (navigationType !== 'header' && input.config.navigation) {
        newDelta.navigationType = navigationType
      }
      if (resolvedName) {
        newDelta.name = resolvedName
      }

      if (Object.keys(newDelta).length === 0) return

      const existingRaw = await ctx.session.readArtifact(ctx.sessionId, deltaFile)
      const merged: ConfigDelta = existingRaw ? { ...(JSON.parse(existingRaw) as ConfigDelta), ...newDelta } : newDelta
      await ctx.session.writeArtifact(ctx.sessionId, deltaFile, JSON.stringify(merged, null, 2))
    },
  }
}
