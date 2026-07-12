/**
 * Deterministic pre-clustering. v0 = exact token-set match only.
 *
 * Token-level Jaccard near-dup merge with same-prefix guardrail is a
 * follow-up — exact-match alone gave 938 clusters on the pilot Blade app (104 files,
 * 2855 rows), which is well within Sonnet chunked-batch budget. Add
 * Jaccard only if cluster count becomes a real LLM cost or review burden.
 * See codex consult 2026-05-11 Q2.
 *
 * LLM never enters this layer. Same input → same clusters → same IDs.
 */

import type { EvidenceRow } from '../adapters/types.js'
import { canonicalSignature, clusterId, signatureKey } from './signature.js'
import type { Cluster } from './types.js'

export function precluster(rows: EvidenceRow[]): Cluster[] {
  const buckets = new Map<string, Cluster>()

  for (const row of rows) {
    const sig = canonicalSignature(row.kind, row.raw_class_string)
    const key = signatureKey(sig)
    let cluster = buckets.get(key)
    if (!cluster) {
      cluster = {
        cluster_id: clusterId(sig),
        signature: sig,
        members: [],
      }
      buckets.set(key, cluster)
    }
    cluster.members.push(row)
  }

  return Array.from(buckets.values()).sort((a, b) => a.cluster_id.localeCompare(b.cluster_id))
}
