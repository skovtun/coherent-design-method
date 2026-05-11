/**
 * Token-budget chunker for B-2b LLM labeler. Codex Q3: fixed-count chunking
 * is fragile because cluster payload size varies wildly — an inline_classes
 * cluster with 80 tokens + 3 long snippet samples can dwarf 20 tiny clusters.
 *
 * Strategy: walk clusters in input order, accumulate estimated tokens, cut a
 * new chunk whenever EITHER (a) `MAX_CLUSTERS_PER_CHUNK` clusters fit OR (b)
 * adding the next would exceed `MAX_INPUT_TOKENS_PER_CHUNK`. Per-cluster
 * over-budget clusters are detected upstream by `isOverPerClusterBudget`;
 * this module assumes each cluster's compact form fits.
 */

import { HARD_INPUT_TOKEN_CAP, MAX_CLUSTERS_PER_CHUNK, MAX_INPUT_TOKENS_PER_CHUNK } from './constants.js'
import { compactClusterForPrompt, estimateCompactClusterTokens, estimateTokensFromText } from './estimate-tokens.js'
import type { Cluster } from './types.js'

export interface ChunkPlan {
  /** Index slice from the input array; same ordering preserved. */
  clusters: Cluster[]
  estimated_input_tokens: number
}

export interface ChunkOptions {
  designContext: string | null
  /** Override defaults for tests. Production should leave undefined. */
  maxClusters?: number
  maxInputTokens?: number
}

/**
 * Approximate fixed-prompt overhead added to every chunk (system prompt,
 * exemplars, output instructions). Adjust if `prompt-builder.ts` grows.
 */
const FIXED_PROMPT_TOKEN_OVERHEAD = 800

export function chunkClustersForLabeling(clusters: Cluster[], options: ChunkOptions): ChunkPlan[] {
  const maxClusters = options.maxClusters ?? MAX_CLUSTERS_PER_CHUNK
  const maxInputTokens = options.maxInputTokens ?? MAX_INPUT_TOKENS_PER_CHUNK
  const designTokens = options.designContext ? estimateTokensFromText(options.designContext) : 0
  const baseOverhead = FIXED_PROMPT_TOKEN_OVERHEAD + designTokens

  const chunks: ChunkPlan[] = []
  let current: Cluster[] = []
  let currentTokens = baseOverhead

  for (const cluster of clusters) {
    const compact = compactClusterForPrompt(cluster)
    const clusterTokens = estimateCompactClusterTokens(compact)
    const nextTotal = currentTokens + clusterTokens

    const wouldExceedTokenBudget = nextTotal > maxInputTokens
    const wouldExceedCount = current.length >= maxClusters

    if ((wouldExceedTokenBudget || wouldExceedCount) && current.length > 0) {
      chunks.push({ clusters: current, estimated_input_tokens: currentTokens })
      current = []
      currentTokens = baseOverhead
    }

    current.push(cluster)
    currentTokens += clusterTokens
  }

  if (current.length > 0) {
    chunks.push({ clusters: current, estimated_input_tokens: currentTokens })
  }

  return chunks
}

/**
 * Diagnostic: returns true if ANY chunk's estimate trips the hard cap. Useful
 * for an early abort before paying for the first LLM call.
 */
export function hasOverHardCap(chunks: ChunkPlan[]): boolean {
  return chunks.some(c => c.estimated_input_tokens > HARD_INPUT_TOKEN_CAP)
}

export function totalEstimatedInputTokens(chunks: ChunkPlan[]): number {
  return chunks.reduce((sum, c) => sum + c.estimated_input_tokens, 0)
}
