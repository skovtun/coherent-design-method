/**
 * Anthropic implementation of the eval JudgeProvider (R12).
 *
 * Same structured-output discipline as the labeler: forced tool_use, temp 0,
 * exact model pin. One call per graded case — the judge only ever sees cases
 * the string matcher already failed (typically <10), so a full judged eval
 * costs cents, not dollars.
 */

import Anthropic from '@anthropic-ai/sdk'
import { MODEL_ID, TEMPERATURE } from '../constants.js'
import {
  buildJudgeUserPrompt,
  JUDGE_SYSTEM_RULES,
  type JudgeDecision,
  type JudgeProvider,
  type JudgeRequest,
} from '../eval-judge.js'

const JUDGE_TOOL = {
  name: 'judge_label',
  description: 'Grade whether the candidate label means the same as an acceptable label for this cluster.',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: {
        type: 'string',
        enum: ['adequate', 'too_narrow', 'wrong'],
        description:
          'adequate = same meaning; too_narrow = names one usage of a general utility; wrong = different thing',
      },
      reason: { type: 'string', minLength: 3, maxLength: 200 },
    },
    required: ['verdict', 'reason'],
    additionalProperties: false,
  },
}

export interface AnthropicJudgeOptions {
  apiKey?: string
  /** Override SDK client (testing). */
  client?: Anthropic
}

export class AnthropicJudgeProvider implements JudgeProvider {
  private readonly client: Anthropic

  constructor(options: AnthropicJudgeOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
  }

  async judge(request: JudgeRequest): Promise<JudgeDecision> {
    const response = await this.client.messages.create({
      model: MODEL_ID,
      max_tokens: 512,
      temperature: TEMPERATURE,
      system: JUDGE_SYSTEM_RULES,
      messages: [{ role: 'user', content: buildJudgeUserPrompt(request) }],
      tools: [JUDGE_TOOL],
      tool_choice: { type: 'tool', name: JUDGE_TOOL.name },
    })

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === JUDGE_TOOL.name) {
        const input = block.input as Partial<JudgeDecision>
        if (input.verdict && input.reason) return { verdict: input.verdict, reason: input.reason }
      }
    }
    // A judge that cannot answer must not silently rescue: treat as "wrong",
    // i.e. the string matcher's original failure stands.
    return { verdict: 'wrong', reason: `judge returned no verdict (stop_reason: ${response.stop_reason ?? 'unknown'})` }
  }
}

/** Exported for tests — keep the tool schema diff-able. */
export const JUDGE_TOOL_SCHEMA = JUDGE_TOOL
