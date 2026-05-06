/**
 * Anthropic-backed default `SemanticLlmFn` for `coherent extract --semantic`.
 *
 * The core `runSemanticInference` is SDK-free; this adapter lives on the CLI
 * side where `@anthropic-ai/sdk` is already a dep, and wires Anthropic's
 * Messages API into the prompt-shape the core module emits.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SemanticLlmFn } from '@getcoherent/core'

export interface AnthropicSemanticOptions {
  apiKey?: string
  /** Model id; defaults to ANTHROPIC_MODEL env or claude-sonnet-4-20250514. */
  model?: string
  /** Max output tokens for the JSON envelope. Default 2048 — semantic output is small. */
  maxTokens?: number
}

export function createAnthropicSemanticCall(opts: AnthropicSemanticOptions = {}): SemanticLlmFn {
  const key = opts.apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. `coherent extract --semantic` needs a key:\n' + '  export ANTHROPIC_API_KEY=sk-ant-…',
    )
  }
  const client = new Anthropic({ apiKey: key, maxRetries: 1 })
  const model = opts.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  const maxTokens = opts.maxTokens ?? 2048

  return async ({ system, user }) => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const block = response.content[0]
    if (!block || block.type !== 'text') {
      throw new Error('Anthropic semantic call returned no text block')
    }
    return { text: block.text }
  }
}
