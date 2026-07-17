/**
 * Anthropic-backed default `SemanticLlmFn` for `coherent extract --semantic`.
 *
 * The core `runSemanticInference` is SDK-free; this adapter lives on the CLI
 * side where `@anthropic-ai/sdk` is already a dep, and wires Anthropic's
 * Messages API into the prompt-shape the core module emits.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SemanticLlmFn } from '@getcoherent/core'
import { DEFAULT_MODEL } from '../utils/model.js'

export interface AnthropicSemanticOptions {
  apiKey?: string
  /** Model id; defaults to the ANTHROPIC_MODEL env var, else {@link DEFAULT_MODEL}. */
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
  const model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const maxTokens = opts.maxTokens ?? 2048

  return async ({ system, user }) => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    })
    // Scan for the text block — do NOT assume content[0]. Under adaptive
    // thinking (the default on Sonnet 5 / Fable 5 when `thinking` is omitted) a
    // `thinking` block comes first, so the text sits at index 1+. Assuming
    // index 0 silently degraded the whole semantic pass — the exact bug that
    // left `extract --semantic` producing deterministic-only roles. Same fix as
    // ClaudeClient.textOf; see packages/cli/src/utils/claude.ts.
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      const seen = response.content.map(b => b.type).join(', ') || 'nothing'
      throw new Error(`Anthropic semantic call returned no text block (got [${seen}])`)
    }
    return { text: textBlock.text }
  }
}
