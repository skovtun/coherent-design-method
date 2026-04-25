/**
 * Prompt builders for the phase-engine.
 *
 * Extracted from `packages/cli/src/agents/modifier.ts` so both rails of the
 * generation pipeline (`coherent chat` in-process, skill-mode via `_phase`
 * subcommands) share one source of truth for prompt strings.
 *
 * Consumers:
 * - `agents/modifier.ts` — imports privately + re-exports `buildLightweightPagePrompt`
 *   so `split-generator.ts` (and its test) remain zero-change.
 * - `prompt.ts` — calls directly to emit the full skill-mode prompt (future).
 * - Phase `prep` functions — call scoped subsets per phase.
 */
export { buildPlanOnlyPrompt } from './plan-only.js'
export { buildComponentRegistry } from './component-registry.js'
export { buildProjectContextFromRoot } from './project-context.js'
export { retrieveWikiContext } from './wiki-context.js'
export { buildModificationPrompt, type BuildModificationPromptOptions } from './modification.js'
export { buildLightweightPagePrompt } from './lightweight-page.js'
export { buildComponentsBatchPrompt } from './components-batch.js'
export { buildInlinePagePrompt, buildPagePrompt, type PageSpec, type PagesInputShared } from './page.js'
