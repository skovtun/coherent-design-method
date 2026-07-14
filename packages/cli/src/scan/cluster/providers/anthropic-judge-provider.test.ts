import { describe, expect, it, vi } from 'vitest'
import { AnthropicJudgeProvider, JUDGE_TOOL_SCHEMA } from './anthropic-judge-provider.js'
import { MODEL_ID, TEMPERATURE } from '../constants.js'
import type { JudgeRequest } from '../eval-judge.js'

const req: JudgeRequest = {
  cluster_id: 'a',
  actual_label: 'Desktop Nav Center',
  acceptable_labels: ['Desktop Nav Wrapper'],
  must_be_generic: false,
  tokens: ['hidden', 'lg:flex'],
  occurrences: 1,
  distinct_files: 1,
  samples: [{ file: 'app.blade.php', line: 88, snippet: '<nav class="hidden lg:flex">' }],
}

describe('AnthropicJudgeProvider', () => {
  it('forces the judge tool and parses the verdict', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'judge_label',
          id: 't1',
          input: { verdict: 'adequate', reason: 'both name the desktop nav wrapper' },
        },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnthropicJudgeProvider({ client: { messages: { create } } as any })

    const decision = await provider.judge(req)

    expect(decision.verdict).toBe('adequate')
    const args = create.mock.calls[0][0]
    expect(args.model).toBe(MODEL_ID)
    expect(args.temperature).toBe(TEMPERATURE)
    expect(args.tool_choice).toEqual({ type: 'tool', name: 'judge_label' })
  })

  it('defaults to "wrong" when the model returns no verdict (never silently rescues)', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'I am not sure' }],
      stop_reason: 'end_turn',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnthropicJudgeProvider({ client: { messages: { create } } as any })

    const decision = await provider.judge(req)

    expect(decision.verdict).toBe('wrong')
    expect(decision.reason).toContain('no verdict')
  })
})

describe('JUDGE_TOOL_SCHEMA', () => {
  it('locks the verdict enum to the three-way taxonomy', () => {
    expect(JUDGE_TOOL_SCHEMA.input_schema.properties.verdict.enum).toEqual(['adequate', 'too_narrow', 'wrong'])
    expect(JUDGE_TOOL_SCHEMA.input_schema.required).toEqual(['verdict', 'reason'])
  })
})
