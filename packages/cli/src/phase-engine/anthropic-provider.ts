import Anthropic from '@anthropic-ai/sdk'
import type { AiProvider, GenerateOptions } from './ai-provider.js'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 4096

/**
 * Phase-engine's Anthropic adapter. Takes the same env-var contract as
 * `utils/ai-provider.ts::ClaudeClient` but exposes only the thin
 * {@link AiProvider.generate} surface.
 *
 * Not a replacement for ClaudeClient — legacy AI methods (editPageCode,
 * extractSharedComponents, generateConfig, ...) stay on ClaudeClient.
 */
export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic
  private readonly defaultModel: string

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not found. Set it in your environment or pass apiKey to the constructor.')
    }
    this.client = new Anthropic({ apiKey: key, maxRetries: 1 })
    this.defaultModel = model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await this.client.messages.create(
      {
        model: options?.model ?? this.defaultModel,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: options?.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      },
      options?.signal ? { signal: options.signal } : undefined,
    )

    const first = response.content[0]
    if (!first || first.type !== 'text') {
      throw new Error(`Expected text response from Anthropic, got ${first?.type ?? 'empty'}`)
    }
    return first.text
  }
}
