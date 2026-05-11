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
})
