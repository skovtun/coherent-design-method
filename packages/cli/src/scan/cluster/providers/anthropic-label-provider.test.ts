import { describe, expect, it, vi } from 'vitest'
import { AnthropicLabelProvider, EMIT_LABELS_SCHEMA } from './anthropic-label-provider.js'
import { MODEL_ID, PROMPT_VERSION, TEMPERATURE } from '../constants.js'
import type { Cluster } from '../types.js'
import type { LabelChunkInput } from './types.js'

function mkCluster(id: string): Cluster {
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens: ['btn', 'btn-primary'] },
    members: [
      {
        file: 'a.blade.php',
        line: 1,
        kind: 'inline_classes',
        raw_class_string: 'btn btn-primary',
        surrounding_context: '<button class="btn btn-primary">x</button>',
      },
    ],
  }
}

function mkInput(clusters: Cluster[]): LabelChunkInput {
  return {
    clusters,
    designContext: null,
    designHash: 'none',
    promptVersion: PROMPT_VERSION,
    modelId: MODEL_ID,
    temperature: TEMPERATURE,
  }
}

describe('AnthropicLabelProvider', () => {
  it('forwards prompt to messages.create and parses tool_use', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'emit_labels',
          id: 'tool_1',
          input: {
            labels: [{ cluster_id: 'id1', human_label: 'Primary CTA', confidence: 0.91 }],
          },
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 56 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient = { messages: { create } } as any
    const provider = new AnthropicLabelProvider({ client: fakeClient })

    const result = await provider.labelChunk(mkInput([mkCluster('id1')]))

    expect(create).toHaveBeenCalledTimes(1)
    const callArgs = create.mock.calls[0][0]
    expect(callArgs.model).toBe(MODEL_ID)
    expect(callArgs.temperature).toBe(TEMPERATURE)
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'emit_labels' })
    expect(callArgs.tools[0].name).toBe('emit_labels')
    expect(callArgs.messages[0].role).toBe('user')

    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].cluster_id).toBe('id1')
    expect(result.outputs[0].human_label).toBe('Primary CTA')
    expect(result.usage).toEqual({ input_tokens: 1234, output_tokens: 56 })
  })

  it('throws when tool_use block is missing', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'I refuse to label.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient = { messages: { create } } as any
    const provider = new AnthropicLabelProvider({ client: fakeClient })

    await expect(provider.labelChunk(mkInput([mkCluster('id1')]))).rejects.toThrow(/tool_use/)
  })

  it('throws when tool_use input shape is wrong', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'emit_labels', id: 'x', input: { wrong: 'shape' } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeClient = { messages: { create } } as any
    const provider = new AnthropicLabelProvider({ client: fakeClient })

    await expect(provider.labelChunk(mkInput([mkCluster('id1')]))).rejects.toThrow(/tool_use/)
  })
})

describe('EMIT_LABELS_SCHEMA', () => {
  it('enforces required fields cluster_id, human_label, confidence', () => {
    const required = EMIT_LABELS_SCHEMA.input_schema.properties.labels.items.required
    expect(required).toEqual(['cluster_id', 'human_label', 'confidence'])
  })

  it('caps human_label length to 60', () => {
    const labelSchema = EMIT_LABELS_SCHEMA.input_schema.properties.labels.items.properties.human_label
    expect(labelSchema.maxLength).toBe(60)
    expect(labelSchema.minLength).toBe(2)
  })

  it('clamps confidence to [0, 1]', () => {
    const confSchema = EMIT_LABELS_SCHEMA.input_schema.properties.labels.items.properties.confidence
    expect(confSchema.minimum).toBe(0)
    expect(confSchema.maximum).toBe(1)
  })
})
