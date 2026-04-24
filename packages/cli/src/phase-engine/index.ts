/**
 * Phase-engine public surface.
 *
 * Two rails consume this module: `coherent chat` (in-process pipeline) and
 * skill-mode `coherent _phase` subcommands (one invocation per phase).
 * Implementation is stateless w.r.t. project config — see design doc 2026-04-23.
 */
export * from './session-store.js'
export { FileBackedSessionStore } from './file-backed-session-store.js'
export { InMemorySessionStore } from './in-memory-session-store.js'
export type { AiProvider, GenerateOptions } from './ai-provider.js'
export { AnthropicProvider } from './anthropic-provider.js'
export { MockProvider, type MockGenerateCall } from './mock-provider.js'
export * from './prompt-builders/index.js'
export * from './phase.js'
export {
  extractStyleContext,
  createExtractStylePhase,
  type AnchorArtifact,
  type StyleArtifact,
  type ExtractStylePhaseOptions,
} from './phases/extract-style.js'
