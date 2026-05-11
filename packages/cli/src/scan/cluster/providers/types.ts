/**
 * Provider seam for cluster labeling. Codex Q9: thin interface now, single
 * Anthropic implementation, abstract later when a second provider arrives.
 *
 * Provider speaks one verb: `labelChunk(input) → RawLabelOutput[]`. The
 * orchestrator owns chunking, caching, reconciliation, and fallbacks; the
 * provider just makes one LLM call and returns whatever it got back. No
 * retry logic inside the provider — keeps repair attempts visible upstream.
 */

import type { Cluster } from '../types.js'

/** What the LLM should return for a single cluster. */
export interface RawLabelOutput {
  cluster_id: string
  human_label: string
  suggested_role?: string
  confidence: number
}

/** Input to a single chunk call. */
export interface LabelChunkInput {
  clusters: Cluster[]
  designContext: string | null
  designHash: string
  promptVersion: string
  modelId: string
  temperature: number
  /** Optional repair-prompt sub-context. Orchestrator sets these on retries. */
  repair?: {
    attempt: 1 | 2 | 3
    missing: string[]
    extra: string[]
    duplicate: string[]
    invalid: string[]
  }
}

/** Diagnostics surface from a single provider call. */
export interface LabelChunkResult {
  outputs: RawLabelOutput[]
  /** Approximate token counts from the provider, if available. */
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export interface LabelProvider {
  /** Label one chunk of clusters. No retry, no cache; caller orchestrates. */
  labelChunk(input: LabelChunkInput): Promise<LabelChunkResult>
}
