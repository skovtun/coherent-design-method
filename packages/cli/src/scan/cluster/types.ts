/**
 * B-2 cluster types. INTERNAL to the scan subsystem.
 *
 * Stable cluster IDs are deterministic: same input → same ID across
 * machines, runs, and model versions. LLM labels clusters but never
 * defines membership. See PLAN.md §134-175 + codex consult 2026-05-11.
 */

import type { AntiPatternKind, EvidenceRow } from '../adapters/types.js'

export interface ClusterSignature {
  kind: AntiPatternKind
  tokens: string[]
}

export interface Cluster {
  cluster_id: string
  signature: ClusterSignature
  members: EvidenceRow[]
}

export type LabelSource = 'llm' | 'deterministic' | 'cache' | 'human'

export interface LabeledCluster {
  cluster: Cluster
  human_label: string
  suggested_role?: string
  confidence?: number
  source: LabelSource
}
