import { describe, expect, it } from 'vitest'
import { mulberry32, stratifiedSample, stratumOf } from './eval-sampling.js'
import type { Cluster, ClusterSignature } from './types.js'

function cluster(id: string, memberCount: number): Cluster {
  const signature: ClusterSignature = { kind: 'inline_classes', tokens: [id] }
  return {
    cluster_id: id,
    signature,
    members: Array.from({ length: memberCount }, (_, i) => ({
      file: `f${i}.blade.php`,
      line: i + 1,
      kind: 'inline_classes' as const,
      raw_class_string: id,
      surrounding_context: '',
    })),
  }
}

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('stratumOf', () => {
  it('classifies by member count', () => {
    expect(stratumOf(cluster('a', 20))).toBe('high')
    expect(stratumOf(cluster('b', 19))).toBe('mid')
    expect(stratumOf(cluster('c', 5))).toBe('mid')
    expect(stratumOf(cluster('d', 4))).toBe('low')
  })
})

describe('stratifiedSample', () => {
  const corpus = [
    ...Array.from({ length: 10 }, (_, i) => cluster(`high-${i}`, 25)),
    ...Array.from({ length: 15 }, (_, i) => cluster(`mid-${i}`, 10)),
    ...Array.from({ length: 30 }, (_, i) => cluster(`low-${i}`, 2)),
  ]

  it('same corpus + same seed → identical sample (reproducibility)', () => {
    const opts = { seed: 42, counts: { high: 3, mid: 4, low: 3 } }
    const a = stratifiedSample(corpus, opts).map(c => c.cluster_id)
    const b = stratifiedSample(corpus, opts).map(c => c.cluster_id)
    expect(a).toEqual(b)
  })

  it('sample is independent of input order', () => {
    const shuffled = corpus.slice().reverse()
    const opts = { seed: 42, counts: { high: 3, mid: 4, low: 3 } }
    expect(stratifiedSample(corpus, opts).map(c => c.cluster_id)).toEqual(
      stratifiedSample(shuffled, opts).map(c => c.cluster_id),
    )
  })

  it('respects per-stratum counts', () => {
    const picked = stratifiedSample(corpus, { seed: 7, counts: { high: 2, mid: 3, low: 4 } })
    expect(picked.filter(c => stratumOf(c) === 'high')).toHaveLength(2)
    expect(picked.filter(c => stratumOf(c) === 'mid')).toHaveLength(3)
    expect(picked.filter(c => stratumOf(c) === 'low')).toHaveLength(4)
  })

  it('excludes forced hard-case ids from the representative sample', () => {
    const picked = stratifiedSample(corpus, {
      seed: 42,
      counts: { high: 10, mid: 15, low: 30 },
      excludeIds: ['high-3', 'mid-7'],
    })
    const ids = picked.map(c => c.cluster_id)
    expect(ids).not.toContain('high-3')
    expect(ids).not.toContain('mid-7')
    expect(picked).toHaveLength(53) // 55 total - 2 excluded
  })

  it('takes the whole stratum when it is smaller than requested', () => {
    const tiny = [cluster('h1', 30), cluster('l1', 1)]
    const picked = stratifiedSample(tiny, { seed: 1, counts: { high: 5, mid: 5, low: 5 } })
    expect(picked).toHaveLength(2)
  })

  it('different seeds produce different samples (sanity)', () => {
    const a = stratifiedSample(corpus, { seed: 1, counts: { high: 3, mid: 3, low: 3 } }).map(c => c.cluster_id)
    const b = stratifiedSample(corpus, { seed: 2, counts: { high: 3, mid: 3, low: 3 } }).map(c => c.cluster_id)
    expect(a).not.toEqual(b)
  })
})
