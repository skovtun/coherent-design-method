/**
 * Pre-apply pipeline helpers — small pure functions both rails will run
 * BEFORE the dispatch switch fires.
 *
 * Pre-stack work the API rail does inline today (chat.ts:264-273,
 * 275, 915-920, plus duplicated knownRoutes assembly at three sites in
 * modification-handler.ts) belongs at this layer. The skill rail today
 * does a partial subset via `createConfigDeltaApplier` /
 * `createModificationApplier` setup; codex audit (2026-04-25) flagged
 * that as a parity drift class.
 *
 * **PR1 commit #2 scope (this commit):** create the helpers + tests.
 * chat.ts and modification-handler.ts call sites stay UNCHANGED — pre.ts
 * is just available as a co-located library at this commit. Migration
 * of call sites lands in PR1 commit #7 (when applyRequests entry wires
 * everything together).
 *
 * Each helper is intentionally tiny so per-helper tests stay tight and
 * the eventual migration is mechanical. The win comes from having ONE
 * well-tested implementation that both rails will share, not from
 * optimizing the inline call paths these wrap today.
 */

import type { DesignSystemConfig, DesignSystemManager } from '@getcoherent/core'
import { needsGlobalsFix, fixGlobalsCss } from '../utils/fix-globals-css.js'
import { loadHashes } from '../utils/file-hashes.js'
import { createBackup } from '../utils/backup.js'

/**
 * Idempotent CSS resync. Wraps `needsGlobalsFix` + `fixGlobalsCss` from
 * `chat.ts:264-273`. Silent on failure (best-effort) — caller decides
 * whether to surface the result via spinner / log.
 *
 * Returns `{ ran: true, fixed: true }` when the fix actually wrote
 * `globals.css`; `{ ran: false, fixed: false }` when no fix was needed;
 * `{ ran: true, fixed: false }` when the fix was attempted but threw
 * (treated as best-effort, not propagated).
 */
export function runGlobalsCssPreflight(
  projectRoot: string,
  config: DesignSystemConfig,
): { ran: boolean; fixed: boolean } {
  if (!needsGlobalsFix(projectRoot)) {
    return { ran: false, fixed: false }
  }
  try {
    fixGlobalsCss(projectRoot, config)
    return { ran: true, fixed: true }
  } catch {
    return { ran: true, fixed: false }
  }
}

/**
 * Manual-edit-protection hash registry. Wraps `loadHashes` from
 * `chat.ts:275`. Returned record is `{ relPath: sha256hex }` for every
 * file the project tracked at last write. Empty object on first run /
 * missing file (matches `loadHashes` semantics).
 *
 * Codex audit F-list flagged "Manual-edit hash protection drift" —
 * skill rail's `regenerateLayout` call site doesn't pass these. PR1 #7
 * wires both rails through the same applyRequests entry, which loads
 * hashes once and threads them through pre + post stacks consistently.
 */
export async function loadProjectHashes(projectRoot: string): Promise<Record<string, string>> {
  return loadHashes(projectRoot)
}

/**
 * Pre-generation snapshot. Wraps `createBackup` from `chat.ts:915-920`
 * with the same try/catch + best-effort semantics: snapshot failure
 * never blocks generation, but the backup is the safety net for
 * `coherent undo` and is gated by destructive-op detection downstream.
 *
 * Returns `null` when the snapshot was skipped or failed. When the
 * caller wants user-visible logging, wrap this in the surrounding
 * spinner — pre.ts itself stays log-free (test ergonomics).
 */
export function createPreApplyBackup(projectRoot: string): string | null {
  try {
    return createBackup(projectRoot)
  } catch {
    return null
  }
}

/**
 * Project-wide route inventory for `autoFixCode`'s `knownRoutes`
 * context field. Reads `dsm.getConfig().pages` and projects route
 * strings, filtering empty/missing.
 *
 * Codex audit (D6 era) flagged "Known-routes drift": API rail does
 * this inline at three sites (modification-handler.ts:617, 925, 1055)
 * with full config visibility; skill rail builds from the current
 * session's `pagesQueue` only, missing routes from prior chats. The
 * symptom: `autoFixCode`'s link-resolution mistakes a real route as
 * "stale" and rewrites it to `#`. Centralizing here makes both rails
 * use the identical source of truth (full config).
 *
 * Pure: no FS, no DSM mutation; safe to call repeatedly.
 */
export function resolveKnownRoutes(dsm: DesignSystemManager): string[] {
  const pages = dsm.getConfig().pages ?? []
  return pages.map(p => p.route).filter((r): r is string => typeof r === 'string' && r.length > 0)
}
