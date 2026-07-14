/**
 * Anthropic provider for B-2b cluster labeling. Codex Q9: thin seam, single
 * implementation. Codex Q2 + Q8: structured-output via tool_use (Anthropic
 * doesn't expose JSON schema response format yet; forced tool_use is the
 * canonical equivalent), `temperature: 0`, exact `MODEL_ID` pin.
 *
 * No retries here — caller (orchestrator) owns the 3-attempt repair ladder.
 * If the SDK throws or the tool_use block is malformed, propagate the error
 * up; orchestrator decides whether to retry or fall back.
 */

import Anthropic from '@anthropic-ai/sdk'
import { buildLabelPrompt } from '../prompt-builder.js'
import type { LabelChunkInput, LabelChunkResult, LabelProvider, RawLabelOutput } from './types.js'

const EMIT_LABELS_TOOL = {
  name: 'emit_labels',
  description: 'Emit cluster labels in the locked schema. One object per input cluster_id.',
  input_schema: {
    type: 'object' as const,
    properties: {
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cluster_id: { type: 'string', description: 'Verbatim cluster_id from input.' },
            human_label: { type: 'string', minLength: 2, maxLength: 60 },
            suggested_role: {
              type: 'string',
              description: 'Lowercase dot.case role like "button.primary". Omit if unsure.',
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['cluster_id', 'human_label', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['labels'],
    additionalProperties: false,
  },
}

export interface AnthropicProviderOptions {
  apiKey?: string
  /** Override SDK client (testing). Production should not pass this. */
  client?: Anthropic
  /** Fixed max output tokens. Default: computed per chunk — see maxTokensFor. */
  maxTokens?: number
}

/**
 * Output budget scaled to chunk size. The old fixed 4096 could truncate a
 * 50-label tool_use JSON mid-array (each label ≈ 60-120 output tokens with
 * ids/roles/confidence), which reconciles as "everything unresolved" and
 * burns the whole repair ladder on a self-inflicted wound.
 */
export function maxTokensFor(clusterCount: number): number {
  return Math.min(16384, Math.max(4096, 500 + clusterCount * 140))
}

export class AnthropicLabelProvider implements LabelProvider {
  private readonly client: Anthropic
  private readonly fixedMaxTokens?: number

  constructor(options: AnthropicProviderOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
    this.fixedMaxTokens = options.maxTokens
  }

  async labelChunk(input: LabelChunkInput): Promise<LabelChunkResult> {
    const { system, user } = buildLabelPrompt(input)

    const response = await this.client.messages.create({
      model: input.modelId,
      max_tokens: this.fixedMaxTokens ?? maxTokensFor(input.clusters.length),
      temperature: input.temperature,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [EMIT_LABELS_TOOL],
      tool_choice: { type: 'tool', name: EMIT_LABELS_TOOL.name },
    })

    const outputs = extractLabels(response)
    const usage = response.usage
      ? { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
      : undefined

    return { outputs, usage }
  }
}

function extractLabels(response: Anthropic.Messages.Message): RawLabelOutput[] {
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'emit_labels') {
      const input = block.input as { labels?: unknown }
      if (Array.isArray(input.labels)) return input.labels as RawLabelOutput[]
    }
  }
  // stop_reason in the message makes truncation (max_tokens) diagnosable
  // upstream — it surfaces via ProviderErrorInfo instead of vanishing.
  throw new Error(
    `Anthropic response missing tool_use block for emit_labels (stop_reason: ${response.stop_reason ?? 'unknown'})`,
  )
}

/** Exported for tests — keep the tool schema diff-able. */
export const EMIT_LABELS_SCHEMA = EMIT_LABELS_TOOL
