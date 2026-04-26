/**
 * apply-requests — entry point.
 *
 * Top-level peer service shared by both rails (API + skill). See
 * `types.ts` for the architectural rationale + `docs/wiki/ADR/0005-...`
 * for the full ADR being delivered.
 *
 * **Status: scaffold only (PR1 commit #1).** The real `applyRequests`
 * implementation lands in PR1 commit #7, after `parse.ts` /
 * `dispatch.ts` / `pre.ts` / `post.ts` are extracted. Until then the
 * stub below throws to prevent accidental imports from getting silent
 * no-ops in tests.
 *
 * Re-exports of named types live alongside so callers can:
 *
 *   ```ts
 *   import { applyRequests, type ApplyMode, type ApplyRequestsContext }
 *     from '@/apply-requests'
 *   ```
 *
 * once wiring lands.
 */

import type { ModificationRequest } from '@getcoherent/core'
import type { ApplyMode, ApplyRequestsContext, ApplyResult } from './types.js'

export type { ApplyMode, ApplyRequestsContext, ApplyResult } from './types.js'
export { applyManagerResult } from './managers.js'

/**
 * Run a batch of modification requests through the shared pipeline.
 *
 * **Not yet implemented.** This is the PR1 commit #1 scaffold; the real
 * implementation lands in commit #7 once dispatch / pre / post / parse
 * are extracted from `commands/chat/modification-handler.ts` and
 * `commands/chat.ts` inline work.
 *
 * Until then, importing this function and calling it surfaces a clear
 * "scaffold not yet wired" error rather than silently no-op'ing — that
 * keeps in-flight feature branches from accidentally shipping with the
 * apply-requests path before the migration is complete.
 */
export async function applyRequests(
  _requests: ModificationRequest[],
  _ctx: ApplyRequestsContext,
  _mode: ApplyMode,
): Promise<ApplyResult[]> {
  throw new Error(
    'apply-requests/index.ts: applyRequests() is a PR1 commit #1 scaffold. ' +
      'Real implementation lands in PR1 commit #7. Use the existing ' +
      'commands/chat/modification-handler.ts:applyModification or ' +
      'phase-engine/appliers.ts:createModificationApplier in the meantime.',
  )
}
