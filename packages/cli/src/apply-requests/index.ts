/**
 * apply-requests — entry point.
 *
 * Top-level peer service shared by both rails (API + skill). See
 * `types.ts` for the architectural rationale + `docs/wiki/ADR/0005-...`
 * for the full ADR being delivered.
 *
 * **PR1 commit #7 status:** entry implemented. Per-request routing is
 * live (deterministic → dispatchDeterministic, AI-dependent → dispatchAi
 * with applyMode gate). The API rail (`commands/chat.ts:981`) calls
 * this entry as of PR1 #7. The skill rail (`phase-engine/appliers.ts`
 * modificationApplier) migration is bundled with PR1 #10's modification-
 * handler collapse — the existing skill applier emits divergent message
 * strings that need to be reconciled with the shared format in one batch
 * to keep the test churn together.
 *
 * Re-exports of named types + the `applyManagerResult` helper live
 * alongside so callers can:
 *
 *   ```ts
 *   import {
 *     applyRequests,
 *     applyManagerResult,
 *     type ApplyMode,
 *     type ApplyRequestsContext,
 *   } from '@/apply-requests'
 *   ```
 */

import type { ModificationRequest } from '@getcoherent/core'
import { dispatchDeterministic, isDeterministic } from './dispatch.js'
import { dispatchAi } from './dispatch-ai.js'
import type { ApplyMode, ApplyRequestsContext, ApplyResult } from './types.js'

export type { ApplyMode, ApplyRequestsContext, ApplyResult } from './types.js'
export { applyManagerResult } from './managers.js'
export { dispatchDeterministic, isDeterministic } from './dispatch.js'
export { dispatchAi, isAi, isAiCasePrepopulated } from './dispatch-ai.js'

/**
 * Run a batch of modification requests through the shared pipeline.
 *
 * Per-request routing:
 *   - deterministic types (update-token, add-component, modify-component,
 *     update-navigation, delete-page, delete-component) → dispatchDeter-
 *     ministic. No AI involvement, runs in either mode.
 *   - AI-dependent types (modify-layout-block, link-shared, promote-and-
 *     link, add-page, update-page) → dispatchAi. Mode-gated: 'no-new-ai'
 *     throws COHERENT_E007 when the request lacks pre-populated output;
 *     'with-ai' delegates to the legacy applyModification (until PR1 #10
 *     moves the bodies into dispatch-ai.ts).
 *
 * Sequential by design — each request reads from the cumulative state of
 * its predecessors via the in-memory dsm/cm/pm trio in `ctx`. Parallel
 * dispatch would race on token mutations vs page writes.
 *
 * Pre/post pipeline (parse → pre.ts → applyRequests → post.ts) stays at
 * the call sites for now. Each rail's call site decides which helpers to
 * run before/after — chat.ts already runs applyDefaults + normalize +
 * createBackup + globals-fix manually; skill rail's appliers.ts runs its
 * own subset. Centralizing the pre/post stack lands in PR2 (the chat.ts
 * facade extraction).
 */
export async function applyRequests(
  requests: ModificationRequest[],
  ctx: ApplyRequestsContext,
  mode: ApplyMode,
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = []
  for (const request of requests) {
    if (isDeterministic(request)) {
      const r = await dispatchDeterministic(request, ctx)
      // dispatchDeterministic returns null only for AI types. Since
      // isDeterministic is true here, r is non-null by construction.
      results.push(r ?? unknownTypeFailure(request))
    } else {
      const r = await dispatchAi(request, ctx, mode)
      // dispatchAi returns null only for deterministic types. Same
      // construction-time invariant as above.
      results.push(r ?? unknownTypeFailure(request))
    }
  }
  return results
}

/**
 * Fallback result when a request type is neither deterministic nor AI-
 * dependent — should be unreachable given the type system, but kept as
 * a defensive net so downstream callers always get a structured result
 * instead of an undefined push slot.
 */
function unknownTypeFailure(request: ModificationRequest): ApplyResult {
  return {
    success: false,
    message: `applyRequests: unknown modification type "${(request as { type: string }).type}" — not deterministic and not AI-dependent`,
    modified: [],
  }
}
