/**
 * apply-requests — shared request-application pipeline.
 *
 * Top-level peer service shared by both rails (API + skill). Lives at
 * `packages/cli/src/apply-requests/` as a sibling to `commands/`,
 * `phase-engine/`, and `utils/`. Intentionally NOT under
 * `commands/chat/` (the name would falsely imply chat-rail ownership)
 * and NOT in `phase-engine/` (codex /codex consult flagged the layer
 * violation — `modification-handler.ts` imports six modules from
 * `commands/chat/*` which would drag command-layer deps into the
 * narrow `phase-engine/` infrastructure layer).
 *
 * See `docs/wiki/ADR/0005-chat-ts-as-facade-over-runpipeline.md` for
 * the architectural commitment this module delivers, and
 * `docs/plans/2026-04-26-pr1-execution-outline.md` for the migration
 * plan that lands this module commit-by-commit.
 *
 * Shapes only — implementation lives in `dispatch.ts`, `pre.ts`,
 * `post.ts`, `parse.ts`. The entry point `applyRequests(...)` lives
 * in `index.ts`.
 */

import type { ComponentManager, DesignSystemManager, PageManager } from '@getcoherent/core'

/**
 * Whether the pipeline may invoke an AI provider.
 *
 * - `'with-ai'` — chat rail. Provider is wired into `ctx.provider`.
 *   AI-dependent cases (`add-page`, `update-page`, `modify-layout-block`,
 *   `link-shared`, `promote-and-link`) call the provider as today.
 *
 * - `'no-new-ai'` — skill rail. Provider is NOT called. AI-dependent
 *   cases REQUIRE pre-populated artifact fields on `request.changes`
 *   (e.g. `changes.pageCode` for add-page; `changes.layoutBlock` for
 *   modify-layout-block). Missing pre-population → hard error
 *   (`E007_NO_AI_REQUIRES_PREPOPULATION`). The error is the contract
 *   that kills the v0.11.3 silent-drop bug class structurally:
 *   instead of silently dropping unsupported types, the skill rail
 *   surfaces a clear "this needs pre-AI work upstream" message.
 *
 * Codex /codex consult 2026-04-25 (D6 in the architecture review)
 * recommended this explicit two-mode contract over implicit detection
 * via context inspection. Modes are sticky — one applyRequests call
 * runs in exactly one mode, never auto-promotes mid-call.
 */
export type ApplyMode = 'with-ai' | 'no-new-ai'

/**
 * Context handed to every dispatch case. Keeps the per-case signatures
 * narrow and makes adding new context fields a one-line additive
 * change instead of touching 12 cases.
 *
 * `provider` and `originalMessage` are only consulted when
 * `mode === 'with-ai'`. In `no-new-ai` mode they may be undefined;
 * AI-dependent cases must read from `request.changes` directly.
 */
export interface ApplyRequestsContext {
  dsm: DesignSystemManager
  cm: ComponentManager
  pm: PageManager
  projectRoot: string
  /** Set on chat rail for AI-dependent cases. Undefined on skill rail. */
  provider?: 'claude' | 'openai' | 'auto'
  /** Original user prompt — used by some AI-case prompt builders. */
  originalMessage?: string
}

/**
 * Result shape per request. Mirrors the existing
 * `commands/chat/modification-handler.ts:208` `applyModification`
 * return type byte-for-byte so the chat-rail caller can be migrated
 * commit-by-commit without touching the consumer side.
 *
 * `success: false` is recoverable (e.g., delete-page target not found)
 * and the caller may choose to continue with subsequent requests.
 * Non-recoverable errors (E007_NO_AI_REQUIRES_PREPOPULATION,
 * destructive-intent refusal) throw `CoherentError` instead of
 * returning `success: false` so the whole batch aborts.
 */
export interface ApplyResult {
  success: boolean
  message: string
  modified: string[]
}
