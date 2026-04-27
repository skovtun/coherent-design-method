/**
 * Cross-manager state synchronization helper.
 *
 * Ported verbatim from `commands/chat/modification-handler.ts:196` (the
 * `applyManagerResult` private function). Both rails need it after a
 * `cm.register` / `cm.update` / `pm.*` operation that returns a new
 * config — the trio of managers must stay in lockstep so subsequent
 * reads see the same picture.
 *
 * Tokens are re-attached because the manager-returned config can drop
 * them in some code paths (matches behavior at line 202 of the original).
 *
 * Lives here in `apply-requests/` because both the dispatch cases (in
 * `dispatch.ts`) and the post-apply hooks (in `post.ts`) need it. Keeping
 * it in `commands/chat/` would require both to import from the command
 * layer, which is the layer-violation codex flagged in D4.
 */

import type { ComponentManager, DesignSystemConfig, DesignSystemManager, PageManager } from '@getcoherent/core'

export function applyManagerResult(
  dsm: DesignSystemManager,
  cm: ComponentManager,
  pm: PageManager,
  newConfig: DesignSystemConfig,
): void {
  const merged: DesignSystemConfig = { ...newConfig, tokens: dsm.getConfig().tokens }
  dsm.updateConfig(merged)
  cm.updateConfig(merged)
  pm.updateConfig(merged)
}
