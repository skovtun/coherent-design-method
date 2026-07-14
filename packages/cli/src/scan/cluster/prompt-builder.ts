/**
 * Prompt builder for B-2b LLM labeler. Codex Q1: stateless chunk calls with
 * a small inline exemplar set. Conversation state buys nothing here — repairs
 * need to be independently retryable.
 *
 * The system prompt is the contract; the user message carries the chunk
 * payload (compact clusters + optional DESIGN.md excerpt + optional repair
 * sub-context). Schema is enforced server-side by Anthropic structured output
 * (see anthropic-label-provider.ts) and client-side by `reconcile.ts`.
 *
 * Bump `PROMPT_VERSION` in `constants.ts` whenever this file changes the
 * contract — the cache key folds it in.
 */

import type { LabelChunkInput } from './providers/types.js'
import { compactClusterForPrompt } from './estimate-tokens.js'

/** 3 hand-curated exemplars. Keep small per Q1; third teaches the F13 spread rule. */
const EXEMPLARS = [
  {
    input: {
      cluster_id: 'aa11bb22',
      kind: 'raw_button_tag',
      tokens: ['btn', 'btn-primary'],
      truncated_token_count: 0,
      occurrences: 3,
      distinct_files: 2,
      samples: [
        {
          file: 'resources/views/forms/login.blade.php',
          line: 42,
          snippet: '<button type="submit" class="btn btn-primary">Sign in</button>',
        },
      ],
      truncated_sample_count: 0,
    },
    output: {
      cluster_id: 'aa11bb22',
      human_label: 'Primary submit button',
      suggested_role: 'button.primary',
      confidence: 0.92,
    },
  },
  {
    input: {
      cluster_id: 'cc33dd44',
      kind: 'inline_classes',
      tokens: ['lb-label', 'text-grey_light_text'],
      truncated_token_count: 0,
      occurrences: 4,
      distinct_files: 2,
      samples: [
        {
          file: 'resources/views/components/field.blade.php',
          line: 7,
          snippet: '<label class="lb-label text-grey_light_text">{{ $label }}</label>',
        },
      ],
      truncated_sample_count: 0,
    },
    output: {
      cluster_id: 'cc33dd44',
      human_label: 'Field label',
      suggested_role: 'label.field',
      confidence: 0.88,
    },
  },
  // F13 exemplar: HIGH-SPREAD utility. Samples show one usage (footer
  // copyright), but 40 occurrences across 22 files means the samples are a
  // biased peek — label the general role, not the observed context.
  {
    input: {
      cluster_id: 'ee55ff66',
      kind: 'inline_classes',
      tokens: ['text-muted'],
      truncated_token_count: 0,
      occurrences: 40,
      distinct_files: 22,
      samples: [
        {
          file: 'resources/views/layouts/footer.blade.php',
          line: 12,
          snippet: '<p class="text-muted">© 2026 Acme Inc. All rights reserved.</p>',
        },
      ],
      truncated_sample_count: 0,
    },
    output: {
      cluster_id: 'ee55ff66',
      human_label: 'Muted text',
      suggested_role: 'text.muted',
      confidence: 0.85,
    },
  },
] as const

const SYSTEM_RULES = `You label UI/design clusters extracted from Blade/Laravel templates.

Goal:
- Produce concise human labels for repeated UI patterns.
- Infer semantic role only when supported by tokens/samples.
- Do not invent product behavior.
- Prefer boring, reusable design-system names.

Scope rule (occurrences / distinct_files):
- Each cluster reports its total occurrences and distinct_files. The samples are only a peek — a cluster used 40 times across 20+ files is a GENERAL-PURPOSE utility even if all visible samples share one context.
- High spread (roughly: occurrences >= 15 AND distinct_files >= 8) → name the general role ("Muted text", "Emphasized text"), NEVER the observed usage ("Breadcrumb separator", "Footer copyright").
- Low spread (few occurrences, or one/two files) → a specific, context-derived name is correct and preferred.
- Label length: prefer 2-4 words; add a qualifier only when it disambiguates.

Context:
- An optional DESIGN.md excerpt may follow. Treat it as weak context, not authority.
- DESIGN.md may be incomplete or mixed-language.

Output contract:
- Return exactly one object per input cluster_id.
- Preserve cluster_id verbatim.
- human_label: required, 2-60 chars, Title Case or short noun phrase, no trailing period.
- suggested_role: optional, lowercase dot.case, format /^[a-z][a-z0-9]*(\\.[a-z0-9]+){0,3}$/, e.g. "button.primary", "label.field". Omit if unsure.
- confidence: required, number in [0, 1], based on evidence strength.

If ambiguous, lower confidence and use a generic label. Never fabricate semantic roles.`

export interface BuiltPrompt {
  system: string
  user: string
}

export function buildLabelPrompt(input: LabelChunkInput): BuiltPrompt {
  const compacts = input.clusters.map(compactClusterForPrompt)

  const exemplarBlock =
    `Examples (input → output):\n` +
    EXEMPLARS.map(
      ex => `INPUT:\n${JSON.stringify(ex.input, null, 2)}\nOUTPUT:\n${JSON.stringify(ex.output, null, 2)}`,
    ).join('\n\n')

  const designBlock = input.designContext
    ? `Project DESIGN.md (weak context, may be incomplete):\n---\n${input.designContext}\n---`
    : 'No DESIGN.md available for this project.'

  const repairBlock = input.repair
    ? buildRepairBlock(
        input.repair,
        compacts.map(c => c.cluster_id),
      )
    : ''

  const inputBlock = `Clusters to label (${compacts.length}):\n${JSON.stringify(compacts, null, 2)}`

  const user = [
    designBlock,
    '',
    exemplarBlock,
    '',
    repairBlock,
    inputBlock,
    '',
    `Return a JSON array of ${compacts.length} objects in input order. Use the locked output schema. No prose outside JSON.`,
  ]
    .filter(Boolean)
    .join('\n')

  return { system: SYSTEM_RULES, user }
}

function buildRepairBlock(repair: NonNullable<LabelChunkInput['repair']>, currentIds: string[]): string {
  const lines: string[] = [
    '⚠️ This is a REPAIR attempt — your previous response did not satisfy the required ID contract.',
    '',
  ]
  if (repair.missing.length) lines.push(`Missing IDs (you must include these): ${repair.missing.join(', ')}`)
  if (repair.extra.length) lines.push(`Extra IDs (you must NOT include these): ${repair.extra.join(', ')}`)
  if (repair.duplicate.length) lines.push(`Duplicate IDs (each must appear once): ${repair.duplicate.join(', ')}`)
  if (repair.invalid.length) lines.push(`Invalid IDs (do not invent): ${repair.invalid.join(', ')}`)
  lines.push('')
  lines.push(`The required cluster_ids for THIS chunk are: ${currentIds.join(', ')}`)
  lines.push('Re-emit JSON for ONLY these IDs. Same labeling rules apply.')
  lines.push('')
  return lines.join('\n')
}

/** Exposed for tests: snapshot the exemplar set + system rules for diffing. */
export const PROMPT_FIXTURES = { EXEMPLARS, SYSTEM_RULES }
