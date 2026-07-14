/**
 * Seeded stratified sampling for eval ground-truth authoring (R10).
 *
 * Codex consult 2026-07-13 verdict 1: the eval needs a REPRESENTATIVE set
 * (percentage gate) sampled reproducibly, plus a separate zero-tolerance
 * hard-case suite (forced IDs). Seeded RNG so the same corpus + seed always
 * selects the same clusters — the sample is reviewable and re-derivable.
 */

import type { Cluster } from './types.js'

export interface StratifiedSampleOptions {
  /** Deterministic RNG seed. Same corpus + same seed → same sample. */
  seed: number
  /** Per-stratum counts. Stratum bounds: high ≥ 20 members, mid 5–19, low < 5. */
  counts: { high: number; mid: number; low: number }
  /** Cluster IDs excluded from the representative sample (the hard-case suite). */
  excludeIds?: string[]
}

/** mulberry32 — tiny deterministic PRNG, good enough for sampling. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function stratumOf(cluster: Cluster): 'high' | 'mid' | 'low' {
  const n = cluster.members.length
  if (n >= 20) return 'high'
  if (n >= 5) return 'mid'
  return 'low'
}

/**
 * Deterministic sample: clusters are sorted by cluster_id within each stratum
 * (stable regardless of input order), then shuffled with the seeded RNG and
 * the first N taken. If a stratum has fewer clusters than requested, all of
 * them are taken (no backfill from other strata — the shortfall is reported
 * by the caller comparing lengths).
 */
export function stratifiedSample(clusters: Cluster[], options: StratifiedSampleOptions): Cluster[] {
  const excluded = new Set(options.excludeIds ?? [])
  const strata: Record<'high' | 'mid' | 'low', Cluster[]> = { high: [], mid: [], low: [] }
  for (const c of clusters) {
    if (excluded.has(c.cluster_id)) continue
    strata[stratumOf(c)].push(c)
  }

  const rng = mulberry32(options.seed)
  const picked: Cluster[] = []
  for (const name of ['high', 'mid', 'low'] as const) {
    const pool = strata[name].slice().sort((a, b) => a.cluster_id.localeCompare(b.cluster_id))
    // Fisher–Yates with the seeded RNG
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    picked.push(...pool.slice(0, options.counts[name]))
  }
  return picked
}
