import { describe, expect, it } from 'vitest'
import {
  compactClusterForPrompt,
  estimateCompactClusterTokens,
  estimateTokensFromText,
  isOverPerClusterBudget,
} from './estimate-tokens.js'
import { MAX_SAMPLES_PER_CLUSTER, MAX_TOTAL_SAMPLE_CHARS } from './constants.js'
import type { Cluster } from './types.js'
import type { EvidenceRow } from '../adapters/types.js'

function mkRow(partial: Partial<EvidenceRow> & { file: string; line: number }): EvidenceRow {
  return {
    kind: 'inline_classes',
    raw_class_string: partial.raw_class_string ?? 'lb-label text-grey_light_text',
    surrounding_context: partial.surrounding_context ?? '<label class="lb-label text-grey_light_text">Hi</label>',
    ...partial,
    file: partial.file,
    line: partial.line,
  } as EvidenceRow
}

function mkCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    cluster_id: overrides.cluster_id ?? 'abc12345',
    signature: overrides.signature ?? { kind: 'inline_classes', tokens: ['lb-label', 'text-grey_light_text'] },
    members: overrides.members ?? [mkRow({ file: 'a.blade.php', line: 1 })],
  }
}

describe('estimateTokensFromText', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokensFromText('')).toBe(0)
  })

  it('approximates 1 token per 4 chars (ceil)', () => {
    expect(estimateTokensFromText('abcd')).toBe(1)
    expect(estimateTokensFromText('abcde')).toBe(2)
    expect(estimateTokensFromText('a'.repeat(40))).toBe(10)
  })
})

describe('compactClusterForPrompt', () => {
  it('caps samples at MAX_SAMPLES_PER_CLUSTER', () => {
    const members = Array.from({ length: 10 }, (_, i) => mkRow({ file: `file-${i}.blade.php`, line: i + 1 }))
    const cluster = mkCluster({ members })
    const compact = compactClusterForPrompt(cluster)
    expect(compact.samples.length).toBeLessThanOrEqual(MAX_SAMPLES_PER_CLUSTER)
  })

  it('records truncated_token_count when tokens exceed cap', () => {
    const tokens = Array.from({ length: 130 }, (_, i) => `t-${i}`)
    const cluster = mkCluster({ signature: { kind: 'inline_classes', tokens } })
    const compact = compactClusterForPrompt(cluster)
    expect(compact.tokens.length).toBe(120)
    expect(compact.truncated_token_count).toBe(10)
  })

  it('records truncated_sample_count when total chars overflow', () => {
    const big = 'x'.repeat(2_000)
    const members = Array.from({ length: 3 }, (_, i) =>
      mkRow({ file: `f-${i}.php`, line: i + 1, surrounding_context: big }),
    )
    const cluster = mkCluster({ members })
    const compact = compactClusterForPrompt(cluster)
    const totalChars = compact.samples.reduce((s, x) => s + x.snippet.length, 0)
    expect(totalChars).toBeLessThanOrEqual(MAX_TOTAL_SAMPLE_CHARS)
    expect(compact.truncated_sample_count).toBeGreaterThan(0)
  })

  it('falls back to raw_class_string when surrounding_context is empty', () => {
    const cluster = mkCluster({
      members: [mkRow({ file: 'x.php', line: 5, raw_class_string: 'btn btn-primary', surrounding_context: '' })],
    })
    const compact = compactClusterForPrompt(cluster)
    expect(compact.samples[0].snippet).toBe('btn btn-primary')
  })
})

describe('isOverPerClusterBudget', () => {
  it('returns false for a small compact cluster', () => {
    const compact = compactClusterForPrompt(mkCluster())
    expect(isOverPerClusterBudget(compact)).toBe(false)
  })

  it('returns true for a synthetic over-budget compact', () => {
    const compact = {
      cluster_id: 'aaaaaaaa',
      kind: 'inline_classes',
      tokens: Array.from({ length: 120 }, (_, i) => `t-${i}-stuffed`),
      truncated_token_count: 0,
      samples: Array.from({ length: 3 }, (_, i) => ({
        file: `f-${i}.php`,
        line: i,
        snippet: 'x'.repeat(50_000),
      })),
      truncated_sample_count: 0,
    }
    expect(isOverPerClusterBudget(compact)).toBe(true)
  })
})

describe('estimateCompactClusterTokens', () => {
  it('returns a positive integer for a real compact', () => {
    const compact = compactClusterForPrompt(mkCluster())
    expect(estimateCompactClusterTokens(compact)).toBeGreaterThan(0)
  })
})
