import { describe, expect, it } from 'vitest'
import { buildLabelPrompt, PROMPT_FIXTURES } from './prompt-builder.js'
import { MODEL_ID, PROMPT_VERSION, TEMPERATURE } from './constants.js'
import type { Cluster } from './types.js'
import type { LabelChunkInput } from './providers/types.js'
import type { EvidenceRow } from '../adapters/types.js'

function row(): EvidenceRow {
  return {
    file: 'r/v/login.blade.php',
    line: 1,
    kind: 'inline_classes',
    raw_class_string: 'btn btn-primary',
    surrounding_context: '<button class="btn btn-primary">Sign in</button>',
  }
}

function cluster(id: string): Cluster {
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens: ['btn', 'btn-primary'] },
    members: [row()],
  }
}

function input(extra: Partial<LabelChunkInput> = {}): LabelChunkInput {
  return {
    clusters: [cluster('id1')],
    designContext: null,
    designHash: 'none',
    promptVersion: PROMPT_VERSION,
    modelId: MODEL_ID,
    temperature: TEMPERATURE,
    ...extra,
  }
}

describe('buildLabelPrompt', () => {
  it('returns system + user strings', () => {
    const { system, user } = buildLabelPrompt(input())
    expect(system).toContain('Output contract')
    expect(system).toContain('dot.case')
    expect(user).toContain('No DESIGN.md available')
    expect(user).toContain('Clusters to label (1)')
  })

  it('includes DESIGN.md when provided', () => {
    const { user } = buildLabelPrompt(input({ designContext: '# My system\n\nUse blue for primary actions.' }))
    expect(user).toContain('Use blue for primary actions.')
    expect(user).not.toContain('No DESIGN.md available')
  })

  it('embeds repair sub-context with missing/extra/duplicate', () => {
    const { user } = buildLabelPrompt(
      input({
        clusters: [cluster('id1'), cluster('id2')],
        repair: {
          attempt: 2,
          missing: ['id2'],
          extra: ['idX'],
          duplicate: [],
          invalid: [],
        },
      }),
    )
    expect(user).toContain('REPAIR attempt')
    expect(user).toContain('Missing IDs')
    expect(user).toContain('id2')
    expect(user).toContain('Extra IDs')
    expect(user).toContain('idX')
  })

  it('does not include a repair block when not repairing', () => {
    const { user } = buildLabelPrompt(input())
    expect(user).not.toContain('REPAIR attempt')
  })

  it('includes compact cluster payload (not raw EvidenceRow)', () => {
    const { user } = buildLabelPrompt(input())
    // raw_class_string should NOT leak into prompt — we send compact form only.
    expect(user).toContain('"cluster_id": "id1"')
    expect(user).toContain('"samples"')
    expect(user).not.toContain('raw_class_string')
  })

  it('exposes fixtures for snapshot diffing', () => {
    expect(PROMPT_FIXTURES.EXEMPLARS.length).toBeGreaterThanOrEqual(2)
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('dot.case')
  })

  it('F13: system rules carry the spread-based scope rule + label brevity', () => {
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('Scope rule')
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('high_spread')
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('sampling bias')
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('2-4 words')
  })

  it('F13.1: rule keys off the precomputed flag, not raw numbers', () => {
    // labeler-v2 asked the model to compare counts to thresholds and it did
    // not comply; v3 hands it a boolean.
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('do not re-derive it')
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('high_spread: true')
    expect(PROMPT_FIXTURES.SYSTEM_RULES).toContain('high_spread: false')
  })

  it('F13: payload exposes occurrences, distinct_files and high_spread', () => {
    const { user } = buildLabelPrompt(input())
    expect(user).toContain('"occurrences"')
    expect(user).toContain('"distinct_files"')
    expect(user).toContain('"high_spread"')
  })

  it('F13: high-spread exemplar labels the general role, not the sampled usage', () => {
    const f13 = PROMPT_FIXTURES.EXEMPLARS[2]
    expect(f13.input.occurrences).toBeGreaterThanOrEqual(15)
    expect(f13.input.distinct_files).toBeGreaterThanOrEqual(8)
    expect(f13.input.high_spread).toBe(true)
    // Sample shows a footer copyright line; the output must NOT mention it.
    expect(f13.input.samples[0].snippet).toContain('©')
    expect(f13.output.human_label.toLowerCase()).not.toContain('footer')
    expect(f13.output.human_label.toLowerCase()).not.toContain('copyright')
  })

  it('F13: prompt version bumped to labeler-v3 (cache invalidation contract)', () => {
    expect(PROMPT_VERSION).toBe('labeler-v3')
  })
})
