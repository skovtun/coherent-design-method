import { describe, expect, it } from 'vitest'
import { chunkClustersForLabeling, hasOverHardCap, totalEstimatedInputTokens } from './chunking.js'
import type { Cluster } from './types.js'
import type { EvidenceRow } from '../adapters/types.js'

function row(file: string, line: number, snippet = '<label class="x">a</label>'): EvidenceRow {
  return {
    file,
    line,
    kind: 'inline_classes',
    raw_class_string: 'x',
    surrounding_context: snippet,
  }
}

function tiny(id: string): Cluster {
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens: ['x'] },
    members: [row('a.blade.php', 1)],
  }
}

function fat(id: string): Cluster {
  // forces chunk-budget cut: big synthetic snippet
  const big = 'x'.repeat(40_000)
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens: ['x'] },
    members: [row('a.blade.php', 1, big)],
  }
}

describe('chunkClustersForLabeling', () => {
  it('returns one chunk for a handful of tiny clusters', () => {
    const clusters = Array.from({ length: 5 }, (_, i) => tiny(`id-${i}`))
    const plans = chunkClustersForLabeling(clusters, { designContext: null })
    expect(plans.length).toBe(1)
    expect(plans[0].clusters.length).toBe(5)
  })

  it('respects maxClusters count cap', () => {
    const clusters = Array.from({ length: 12 }, (_, i) => tiny(`id-${i}`))
    const plans = chunkClustersForLabeling(clusters, { designContext: null, maxClusters: 5 })
    expect(plans.length).toBe(3) // 5 + 5 + 2
    expect(plans[0].clusters.length).toBe(5)
    expect(plans[2].clusters.length).toBe(2)
  })

  it('cuts chunks on token budget when clusters are fat', () => {
    // Snippets are compacted before estimation (MAX_SAMPLE_CHARS=1500), so a
    // single compacted "fat" cluster is ~425 input tokens. With baseline
    // overhead 800, maxInputTokens=1500 forces a cut after every cluster.
    const clusters = Array.from({ length: 6 }, (_, i) => fat(`id-${i}`))
    const plans = chunkClustersForLabeling(clusters, { designContext: null, maxInputTokens: 1_500 })
    expect(plans.length).toBeGreaterThan(1)
    for (const plan of plans) {
      expect(plan.estimated_input_tokens).toBeGreaterThan(0)
    }
  })

  it('preserves input order across chunks', () => {
    const clusters = Array.from({ length: 12 }, (_, i) => tiny(`id-${i}`))
    const plans = chunkClustersForLabeling(clusters, { designContext: null, maxClusters: 4 })
    const flatIds = plans.flatMap(p => p.clusters.map(c => c.cluster_id))
    expect(flatIds).toEqual(clusters.map(c => c.cluster_id))
  })

  it('returns [] for empty input', () => {
    expect(chunkClustersForLabeling([], { designContext: null })).toEqual([])
  })

  it('factors DESIGN.md tokens into baseline budget', () => {
    const clusters = Array.from({ length: 10 }, (_, i) => tiny(`id-${i}`))
    const noDesign = chunkClustersForLabeling(clusters, { designContext: null, maxInputTokens: 4_000 })
    const bigDesign = chunkClustersForLabeling(clusters, {
      designContext: 'x'.repeat(15_000),
      maxInputTokens: 4_000,
    })
    expect(bigDesign.length).toBeGreaterThanOrEqual(noDesign.length)
  })
})

describe('hasOverHardCap + totalEstimatedInputTokens', () => {
  it('returns false for normal chunks', () => {
    const clusters = Array.from({ length: 3 }, (_, i) => tiny(`id-${i}`))
    const plans = chunkClustersForLabeling(clusters, { designContext: null })
    expect(hasOverHardCap(plans)).toBe(false)
    expect(totalEstimatedInputTokens(plans)).toBeGreaterThan(0)
  })
})
