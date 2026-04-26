/**
 * Dispatch — AI-dependent cases + the `applyMode` contract gate.
 *
 * **PR1 commit #6 scope (this commit):** declare the `applyMode: 'with-
 * ai' | 'no-new-ai'` contract and enforce it BEFORE delegating to the
 * existing `applyModification` switch in `commands/chat/modification-
 * handler.ts`. Physical move of the 5 AI-case bodies (~880 lines of
 * `modify-layout-block`, `link-shared`, `promote-and-link`, `add-page`,
 * `update-page`) lands in PR1 commit #10 once the API rail's call site
 * is migrated through the applyRequests entry (PR1 #7).
 *
 * The wrapper-now / move-later split is deliberate. The win this commit
 * delivers is the CONTRACT, not the file move:
 *
 *   - skill rail (no AI provider) calls applyRequests with `mode:
 *     'no-new-ai'`. AI-dependent requests must be pre-populated with
 *     their deterministic output (`changes.pageCode`, `changes.layoutBlock`)
 *     by the producer side. If they aren't, the request fails LOUDLY
 *     with `COHERENT_E007_NO_AI_REQUIRES_PREPOPULATION`.
 *   - API rail keeps `mode: 'with-ai'` — full provider available,
 *     pre-population not required, gate is a no-op.
 *
 * That gate alone kills the v0.11.3 silent-drop bug class STRUCTURALLY:
 * the skill rail used to drop AI-only requests on the floor with no
 * surface signal. Now it throws E007 immediately.
 *
 * Cross-rail back-edge note: importing `applyModification` from
 * `commands/chat/modification-handler.ts` IS a layer back-edge (apply-
 * requests/ should not depend on commands/chat/*). It's marked tempo-
 * rary scaffolding — PR1 #10 inverts the dependency by physically moving
 * the 5 AI-case bodies into this file and reducing modification-handler
 * to a re-export, then PR1 #11 deletes the re-export.
 */

import type { ModificationRequest } from '@getcoherent/core'
import { applyModification } from '../commands/chat/modification-handler.js'
import { CoherentError } from '../errors/CoherentError.js'
import { COHERENT_ERROR_CODES } from '../errors/codes.js'
import type { ApplyMode, ApplyRequestsContext, ApplyResult } from './types.js'

/**
 * The 6 AI-dependent ModificationRequest types. These ALWAYS need an
 * AI provider unless the producer side has pre-populated the deter-
 * ministic output.
 *
 * `add-layout-block` is included even though no current code path
 * implements it — without inclusion, an `add-layout-block` request
 * would fall through both `dispatchDeterministic` (returns null) and
 * `dispatchAi` (returns null) and end up in `unknownTypeFailure`,
 * silently producing `{success:false}` instead of throwing E007 in
 * `'no-new-ai'` mode. Adversarial review (2026-04-26) caught this as
 * a silent-drop bug-class regression. Listing it here closes the gap
 * structurally — the gate fires loudly even on the unimplemented type.
 */
const AI_TYPES = new Set<ModificationRequest['type']>([
  'modify-layout-block',
  'add-layout-block',
  'link-shared',
  'promote-and-link',
  'add-page',
  'update-page',
])

/**
 * True when `request.type` is AI-dependent. Symmetric with
 * `dispatch.ts:isDeterministic` — exactly one of these returns true for
 * any valid ModificationRequest type.
 */
export function isAi(request: ModificationRequest): boolean {
  return AI_TYPES.has(request.type)
}

/**
 * Inspect whether an AI-dependent request has been pre-populated with
 * its deterministic output. Used by the `applyMode: 'no-new-ai'` gate
 * to decide whether to throw E007 or proceed.
 *
 * Pre-population shape per request type:
 *   - add-page / update-page: `changes.pageCode` is a non-empty string
 *   - modify-layout-block: `changes.layoutBlock` is a non-empty string
 *   - link-shared: NEVER pre-populatable (always needs AI to pick the
 *     insertion site within the page). Returns false unconditionally —
 *     skill rail must surface this case as "skill phase missing".
 *   - promote-and-link: NEVER pre-populatable (always needs AI to do the
 *     extraction). Returns false unconditionally.
 */
export function isAiCasePrepopulated(request: ModificationRequest): boolean {
  const changes = (request.changes ?? {}) as Record<string, unknown>
  switch (request.type) {
    case 'add-page':
    case 'update-page':
      return typeof changes.pageCode === 'string' && (changes.pageCode as string).trim() !== ''
    case 'modify-layout-block':
      return typeof changes.layoutBlock === 'string' && (changes.layoutBlock as string).trim() !== ''
    case 'add-layout-block':
    case 'link-shared':
    case 'promote-and-link':
      // `add-layout-block` is in the type union but no current path implements
      // it. Treating as never-pre-populatable means the E007 gate fires for
      // any skill-rail invocation, surfacing the missing implementation
      // loudly instead of silently dropping the request.
      return false
    default:
      return false
  }
}

/**
 * Run an AI-dependent ModificationRequest. Returns `null` if the
 * request type is deterministic — caller should hand off to
 * `dispatchDeterministic` in that case (symmetric to dispatch.ts).
 *
 * `applyMode` enforcement happens BEFORE delegation:
 *
 *   - 'with-ai' (API rail): no gate. Provider is available, request
 *     proceeds whether pre-populated or not.
 *   - 'no-new-ai' (skill rail): AI-dependent requests MUST be pre-
 *     populated. If not, throws E007 with the specific request type
 *     in the message so the user knows which producer phase failed
 *     to fill in the deterministic output.
 *
 * This is the structural fix for the v0.11.3 silent-drop bug class —
 * skill rail used to drop AI-only requests with no signal. Now it
 * throws loudly the moment a non-pre-populated AI request hits the
 * gate.
 */
export async function dispatchAi(
  request: ModificationRequest,
  ctx: ApplyRequestsContext,
  mode: ApplyMode,
): Promise<ApplyResult | null> {
  if (!isAi(request)) {
    return null
  }

  if (mode === 'no-new-ai' && !isAiCasePrepopulated(request)) {
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E007_NO_AI_REQUIRES_PREPOPULATION,
      message: `applyMode: 'no-new-ai' received an AI-dependent request (${request.type}) without pre-populated output`,
      cause: `The skill rail runs without an AI provider. AI-dependent requests must arrive with their deterministic output already filled in (changes.pageCode for add/update-page, changes.layoutBlock for modify-layout-block). Types like 'link-shared' and 'promote-and-link' cannot be pre-populated and require a skill-phase rewrite to produce them inline.`,
      fix: `If you reached this from a skill-rail invocation, this is a producer bug — the upstream phase must populate the deterministic output before emitting the request. If you reached this directly, switch to applyMode: 'with-ai' (API rail).`,
    })
  }

  // Delegate to the legacy switch. PR1 #10 will move the 5 case bodies
  // into this file and reduce the legacy switch to a forwarder; PR1
  // #11 deletes the forwarder once both rails route through the apply-
  // requests entry. This back-edge is explicitly temporary scaffolding.
  return applyModification(request, ctx.dsm, ctx.cm, ctx.pm, ctx.projectRoot, ctx.provider, ctx.originalMessage)
}
