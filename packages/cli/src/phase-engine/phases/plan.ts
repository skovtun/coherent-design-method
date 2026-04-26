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
import type { AnchorInput } from './anchor.js'

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

/**
 * v0.11.4 — explicit orchestration shape for the skill rail to branch on.
 *
 * Pre-v0.11.4 the skill body in `utils/claude-code.ts` was hardcoded for the
 * full 6-phase add-page workflow. Plan-only ops (delete-page, update-token,
 * etc.) still went through anchor → extract-style → components → page even
 * though those phases had nothing to do; anchor errored out with "missing
 * required artifact 'anchor-input.json'", and the skill agent learned to
 * recover via runtime guess. That is exactly the parity-drift bug class
 * codex flagged in the v0.11.3 audit (request-type subset coverage), but
 * applied to phase-execution coverage instead of request-type coverage.
 *
 * `SessionShape` is computed ONCE at plan time and consumed by the skill
 * body to branch deterministically:
 *
 *   - `requestTypes`        — sorted unique list, for diagnostics + tests
 *   - `hasAddPage`          — true when at least one add-page request lands;
 *                             gates anchor / extract-style / components /
 *                             page phases
 *   - `hasOnlyNoAiRequests` — true when every request is in the no-AI set
 *                             handled by createModificationApplier; the
 *                             skill body skips directly to session end
 *   - `phases`              — explicit ordered list of phases needed for
 *                             this session, e.g. `['plan', 'apply']` or
 *                             `['plan', 'anchor', 'extract-style',
 *                             'components', 'page', 'apply']`. Drives the
 *                             dynamic `[N/M]` counter in the skill body.
 *   - `needsFix`            — true when generated TSX or shared components
 *                             land on disk; gates the post-apply
 *                             `coherent fix` invocation. For plan-only ops
 *                             the post-apply fix is noisy and can mutate
 *                             unrelated state.
 *
 * Codex `/codex consult` 2026-04-25 audit flagged that `update-navigation`
 * is currently classified as deferred-not-applied (only `navigation.type`
 * via config-delta works; item-level reorder is unsupported). This shape
 * keeps `update-navigation` OUT of `hasOnlyNoAiRequests` so the skill body
 * doesn't claim a successful plan-only completion when the actual nav
 * mutation was silently skipped.
 */
export interface SessionShape {
  requestTypes: string[]
  hasAddPage: boolean
  hasOnlyNoAiRequests: boolean
  phases: SessionPhaseName[]
  needsFix: boolean
}

export type SessionPhaseName = 'plan' | 'anchor' | 'extract-style' | 'components' | 'page' | 'apply'

/**
 * Request types that `createModificationApplier` handles deterministically
 * at session-end without an AI call. Frozen list matched against codex
 * audit's GAP_LIST. New no-AI types added to the applier MUST also be added
 * here so `hasOnlyNoAiRequests` correctly classifies them.
 */
const NO_AI_REQUEST_TYPES = new Set<string>([
  'delete-page',
  'delete-component',
  'update-token',
  'add-component',
  'modify-component',
])

/**
 * Pure: compute the session shape from the planner's normalized requests.
 *
 * Empty `requests` returns the minimum-effort shape (just plan + apply,
 * `hasOnlyNoAiRequests: false` because there is nothing to apply at all
 * — the skill body should NOT short-circuit to session end on empty input,
 * it should run the full pipeline and let the appliers no-op).
 *
 * Mixed sessions where add-page coexists with delete-page (e.g. rename)
 * always need the full add-page pipeline; `hasOnlyNoAiRequests` is `false`
 * even though the deletes ARE no-AI, because the adds are not.
 */
export function computeSessionShape(requests: ModificationRequest[]): SessionShape {
  const requestTypes = Array.from(new Set(requests.map(r => r.type))).sort()
  const hasAddPage = requests.some(r => r.type === 'add-page')
  const allNoAi = requests.length > 0 && requests.every(r => NO_AI_REQUEST_TYPES.has(r.type))
  const phases: SessionPhaseName[] = ['plan']
  if (hasAddPage) {
    phases.push('anchor', 'extract-style', 'components', 'page')
  }
  phases.push('apply')
  return {
    requestTypes,
    hasAddPage,
    hasOnlyNoAiRequests: allNoAi,
    phases,
    // `coherent fix` only matters when generated TSX / shared components
    // landed on disk — i.e. there's an add-page in the queue. Pure
    // delete/token/component-config mutations don't produce new code that
    // could be broken in the typical fix-target ways (TS errors, raw
    // colors, missing imports, broken nav links). For those, fix is
    // noisy and risks mutating unrelated state — codex audit F-list.
    needsFix: hasAddPage,
  }
}

export interface PlanPhaseOptions {
  /** Artifact to read PlanInput from. Default `plan-input.json`. */
  inputArtifact?: string
  /** Artifact to write PlanArtifact to. Default `plan.json`. */
  planArtifact?: string
  /** Artifact to merge ConfigDelta into. Default `config-delta.json`. */
  configDeltaArtifact?: string
  /**
   * Artifact to seed with AnchorInput so the next phase (`_phase prep anchor`)
   * finds its input. Default `anchor-input.json`. Set to `null` to suppress
   * the chain — useful when an upstream caller seeds anchor-input itself.
   */
  anchorInputArtifact?: string | null
  /**
   * Artifact to persist the FULL list of normalized requests from the plan
   * response. Default `modification-requests.json`. Set to `null` to suppress.
   *
   * Pre-v0.11.3 the plan ingest derived only `pageNames` from `add-page`
   * requests; every other type (`delete-page`, `update-token`, etc.) went
   * to /dev/null because no downstream applier read them. The audit
   * (codex consult, 2026-04-25) found 9+ silent-drop bugs of that class.
   * Persisting the raw requests gives `createModificationApplier` a single
   * source of truth that mirrors API rail's `applyModification` switch.
   */
  modificationRequestsArtifact?: string | null
  /**
   * Artifact to persist the computed `SessionShape` for the skill body
   * to read and branch on. Default `session-shape.json`. Set to `null`
   * to suppress.
   *
   * v0.11.4 — codex consult flagged that overloading
   * `modification-requests.json` with orchestration policy spreads
   * decisions into prose and rots. A separate shape artifact keeps the
   * applier's input (`modification-requests.json`) and the orchestrator's
   * input (`session-shape.json`) cleanly separated.
   */
  sessionShapeArtifact?: string | null
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
  // `undefined` → default 'anchor-input.json'; `null` → suppress chaining.
  const anchorInputFile = options.anchorInputArtifact === undefined ? 'anchor-input.json' : options.anchorInputArtifact
  // Same `undefined` vs `null` semantics as anchorInputFile above.
  const modificationRequestsFile =
    options.modificationRequestsArtifact === undefined
      ? 'modification-requests.json'
      : options.modificationRequestsArtifact
  const sessionShapeFile =
    options.sessionShapeArtifact === undefined ? 'session-shape.json' : options.sessionShapeArtifact

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

      // Persist the full normalized request list for the modification applier
      // (v0.11.3). `derivePageNames` above filters to add-page only; this
      // artifact carries delete-page, delete-component, update-token,
      // modify-component, add-component, and any unsupported types so the
      // applier can either handle them or hard-fail BEFORE add-pages land.
      // Skip the write entirely when the option was set to `null` (test or
      // caller wants to suppress chaining) or when the parsed response
      // contains no requests at all.
      const rawRequests = (parsed.requests as ModificationRequest[] | undefined) ?? []
      if (modificationRequestsFile !== null && rawRequests.length > 0) {
        await ctx.session.writeArtifact(
          ctx.sessionId,
          modificationRequestsFile,
          JSON.stringify({ requests: rawRequests }, null, 2),
        )
      }

      // v0.11.4 — compute and persist the session shape for the skill body
      // to branch on. Always written when there's at least one request,
      // even when the modification-requests artifact is suppressed; the
      // shape doubles as the orchestrator's source of truth for
      // anchor/extract-style/components/page gating + the dynamic
      // `[N/M]` counter + the `coherent fix` decision.
      //
      // Empty `parsed.requests` skips the write — the skill body falls
      // through to the existing path which lets the applier chain
      // no-op gracefully. Codex audit point: don't claim
      // `hasOnlyNoAiRequests: true` on empty input — let the appliers
      // each decide whether they have work.
      if (sessionShapeFile !== null && rawRequests.length > 0) {
        const shape = computeSessionShape(rawRequests)
        await ctx.session.writeArtifact(ctx.sessionId, sessionShapeFile, JSON.stringify(shape, null, 2))
      }

      // Chain anchor-input.json so the next skill-mode call (`_phase prep
      // anchor`) finds its input. Without this the pipeline dies here with
      // `anchor: missing required artifact "anchor-input.json"` (codex P1 #1
      // chain — this is part 2/4).
      //
      // Skip the write when pageNames is empty — the plan response produced
      // no add-page requests so there's no homePage to anchor on. The anchor
      // phase will then fail with its own "missing required artifact" error
      // if a caller still tries to advance, which correctly signals "plan
      // produced nothing to anchor on" rather than silently writing garbage.
      //
      // `plan: null` is intentional: v0.9.0 skill-mode doesn't run a separate
      // architecture-plan phase yet, so we don't have an ArchitecturePlan to
      // hand down. Anchor's prompt builder handles the null case and produces
      // a generic anchor prompt.
      if (anchorInputFile !== null && pageNames.length > 0) {
        const [firstPage] = pageNames
        const anchorInput: AnchorInput = {
          homePage: { name: firstPage.name, route: firstPage.route, id: firstPage.id },
          message: input.message,
          allPagesList: pageNames.map(p => p.name).join(', '),
          allRoutes: pageNames.map(p => p.route).join(', '),
          plan: null,
          // Carry the project config through so anchor.prep() can wrap the
          // short anchor directive with `buildModificationPrompt` (which adds
          // CORE_CONSTRAINTS + the JSON output schema). Without it, the AI
          // sees a ~9-line directive with no format instructions and starts
          // exploring the source tree, triggering permission prompts.
          config: input.config,
        }
        await ctx.session.writeArtifact(ctx.sessionId, anchorInputFile, JSON.stringify(anchorInput, null, 2))
      }

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
