/**
 * Phase registry — resolve a phase name to a Phase instance.
 *
 * Names:
 *   - `plan`, `anchor`, `extract-style`, `components`, `log-run` — single-factory phases
 *   - `page:<pageId>`                                              — per-page factory
 *
 * The skill-mode rail invokes `coherent _phase <action> <name>`; the registry
 * is the `name → Phase` resolver. Chat rail imports factories directly (no
 * string indirection). Keeping the registry + CLI out of the phase modules
 * preserves tree-shaking: tests that only exercise a single phase don't pull
 * in every factory.
 */

import { createAnchorPhase } from './phases/anchor.js'
import { createComponentsPhase } from './phases/components.js'
import { createExtractStylePhase } from './phases/extract-style.js'
import { createLogRunPhase } from './phases/log-run.js'
import { createPagePhase } from './phases/page.js'
import { createPlanPhase } from './phases/plan.js'
import type { Phase } from './phase.js'

/**
 * Bump when the on-disk artifact shape or CLI contract changes incompatibly.
 * `coherent _phase --protocol N` must match this value or the command bails.
 *
 * History:
 *   1 — Initial release (v0.9.0 skill-mode parity).
 *   2 — v0.10.0 / M14:
 *       • Page-phase response uses fenced ```tsx body, NOT pageCode-as-string.
 *         (`phases/page.ts` `parsePageResponse` keeps a legacy fallback so
 *         protocol-1 markdown still ingests for one release.)
 *       • Components phase emits `PHASE_SKIP_SENTINEL` from prep() when
 *         `sharedComponents.length === 0`. Protocol-1 skill markdown that
 *         doesn't detect the sentinel still works — ingest() tolerates it.
 *       • Plan and components phases write `pages-input.json` excluding the
 *         anchor page (no double-generation). Inherited from v0.9.0.
 */
export const PHASE_ENGINE_PROTOCOL = 2

export type SingleFactoryName = 'plan' | 'anchor' | 'extract-style' | 'components' | 'log-run'

export const SINGLE_FACTORY_NAMES: readonly SingleFactoryName[] = [
  'plan',
  'anchor',
  'extract-style',
  'components',
  'log-run',
] as const

/**
 * Resolve a phase name (as used on the CLI and in session artifacts) to a
 * Phase instance. Throws on unknown names or a malformed `page:` form.
 */
export function resolvePhase(name: string): Phase {
  if (name.startsWith('page:')) {
    const pageId = name.slice('page:'.length)
    if (!pageId) {
      throw new Error(`Phase "page:" requires a pageId (e.g. "page:pricing")`)
    }
    return createPagePhase(pageId)
  }
  switch (name) {
    case 'plan':
      return createPlanPhase()
    case 'anchor':
      return createAnchorPhase()
    case 'extract-style':
      return createExtractStylePhase()
    case 'components':
      return createComponentsPhase()
    case 'log-run':
      return createLogRunPhase()
    default:
      throw new Error(
        `Unknown phase: ${JSON.stringify(name)}. Known: ${SINGLE_FACTORY_NAMES.join(', ')}, page:<pageId>`,
      )
  }
}
