/**
 * Pre-dispatch normalization pipeline — pure function both rails will run
 * BEFORE the dispatch switch fires.
 *
 * Wraps three concerns the API rail does inline at chat.ts:661-714:
 *   1. `applyDefaults` per request (request-parser.ts:386)
 *   2. PJ-009 destructive-intent guard — refuse if user message is
 *      destructive but no delete-page/delete-component appeared in the
 *      AI's request list (chat.ts:667-683)
 *   3. `normalizeRequest` per request + refusal-to-coerce when destructive
 *      intent vs non-destructive output (chat.ts:685-709)
 *
 * Skill rail (modification-handler.ts call sites) currently does NONE of
 * this — codex audit (2026-04-25) flagged it as the "destructive pre-
 * parser drift" class. Centralizing here means both rails get PJ-009
 * protection identically.
 *
 * **PR1 commit #4 scope (this commit):** create the helper + tests.
 * chat.ts call site stays UNCHANGED — parse.ts is co-located library at
 * this commit. Migration of call site lands in PR1 commit #7 alongside
 * the applyRequests entry wire.
 *
 * Pure: returns structured result the caller chooses how to surface
 * (spinner.fail / chalk.yellow / process.exit). No console writes here —
 * test ergonomics + matches pre.ts/post.ts contract.
 */

import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'
import { messageHasDestructiveIntent } from '../agents/destructive-preparser.js'
import { applyDefaults, normalizeRequest } from '../commands/chat/request-parser.js'

/**
 * One per-request adjustment the parser made. Caller decides whether to
 * log it (chat.ts uses chalk.dim for adjusted, chalk.yellow for skipped).
 */
export type ParseAdjustment =
  | { kind: 'skipped'; reason: string; original: ModificationRequest }
  | { kind: 'coerced-refused'; from: string; to: string; original: ModificationRequest }
  | { kind: 'type-adjusted'; from: string; to: string; target: string }

/**
 * Result of running the parse pipeline. Caller branches on
 * `destructiveRefusal !== null` to decide whether to abort the run with
 * a user-visible "rephrase" message before doing anything else.
 */
export interface ParseResult {
  /** Normalized requests, defaults applied, coercion-refused entries dropped. */
  requests: ModificationRequest[]
  /**
   * Set when the user's message looks destructive (PJ-009 vocabulary)
   * but no delete-page / delete-component request appeared in the parsed
   * list. Caller should refuse the run with `reason` + `hint`.
   */
  destructiveRefusal: { reason: string; hint: string } | null
  /** Per-request adjustments — caller decides whether/how to log each. */
  adjustments: ParseAdjustment[]
}

/**
 * Run the pre-dispatch normalization pipeline.
 *
 * Steps (in order):
 *   1. `applyDefaults` to every request (idempotent).
 *   2. Detect destructive intent on the user message (PJ-009 vocabulary).
 *      If detected AND no delete-* request emitted → set destructiveRefusal.
 *      Caller should abort before doing anything else.
 *   3. `normalizeRequest` per request:
 *        - error → drop with `kind: 'skipped'` adjustment
 *        - destructive intent + non-destructive coercion → drop with
 *          `kind: 'coerced-refused'` (PJ-009 silent coercion guard)
 *        - type changed → keep, emit `kind: 'type-adjusted'` for logging
 *
 * Pure: no FS, no console writes. Caller threads result through spinner
 * + chalk as it sees fit.
 */
export function parseRequests(
  rawRequests: ModificationRequest[],
  message: string,
  config: DesignSystemConfig,
): ParseResult {
  const adjustments: ParseAdjustment[] = []

  // Step 1 — applyDefaults pass.
  const defaulted = rawRequests.map(req => applyDefaults(req))

  // Step 2 — PJ-009 destructive-intent guard at the request-list level.
  const userIsDestructive = messageHasDestructiveIntent(message)
  let destructiveRefusal: ParseResult['destructiveRefusal'] = null
  if (userIsDestructive) {
    const hasDestructiveRequest = defaulted.some(r => r.type === 'delete-page' || r.type === 'delete-component')
    if (!hasDestructiveRequest) {
      destructiveRefusal = {
        reason: 'Your request looks destructive but the parser did not emit a delete-page/delete-component.',
        hint: 'Rephrase with a clear pattern: "delete <page-name> page" or "remove <component> component". If you meant to CREATE a page with delete functionality, say "add a delete-account page".',
      }
      // Still return the (un-normalized) requests so caller has full picture
      // for telemetry / debugging, but they'll likely abort before using them.
      return { requests: defaulted, destructiveRefusal, adjustments }
    }
  }

  // Step 3 — per-request normalization with PJ-009 coercion refusal.
  const requests: ModificationRequest[] = []
  for (const req of defaulted) {
    const result = normalizeRequest(req, config)
    if ('error' in result) {
      adjustments.push({ kind: 'skipped', reason: result.error, original: req })
      continue
    }
    if (userIsDestructive && req.type !== result.type) {
      adjustments.push({
        kind: 'coerced-refused',
        from: req.type,
        to: result.type,
        original: req,
      })
      continue
    }
    if (result.type !== req.type) {
      adjustments.push({
        kind: 'type-adjusted',
        from: req.type,
        to: result.type,
        target: req.target ?? '(unknown)',
      })
    }
    requests.push(result)
  }

  return { requests, destructiveRefusal, adjustments }
}
