/**
 * Phase-engine AI provider interface.
 *
 * Intentionally thin: a phase's `prep` builds a prompt, passes it to
 * `generate()`, and the phase's `ingest` parses the raw string. Richer AI
 * surfaces (config generation, page edits, shared-component extraction) stay
 * on `utils/ai-provider.ts::AIProviderInterface` for the legacy chat path —
 * phase-engine does not consume them.
 *
 * Dependency-injected so tests can replace the real Anthropic client with
 * {@link MockProvider} from `./mock-provider.ts`.
 */

export interface GenerateOptions {
  /** Model identifier, e.g. `claude-sonnet-4-20250514`. Defaults to provider's default. */
  model?: string
  /** Max tokens the provider may emit. Defaults to 4096. */
  maxTokens?: number
  /** Optional system prompt. */
  systemPrompt?: string
  /**
   * Abort handle so callers can cancel an in-flight request (timeout, SIGINT).
   * Wired into the underlying SDK's fetch call, not just ignored post-hoc.
   */
  signal?: AbortSignal
}

export interface AiProvider {
  /**
   * Send a prompt and return the raw model text. Non-text responses (tool
   * calls, etc.) are not supported yet — phase-engine is single-turn prompt ->
   * string.
   */
  generate(prompt: string, options?: GenerateOptions): Promise<string>
}
