/**
 * Local token estimator + per-cluster compactor for B-2b LLM labeler.
 *
 * Codex Q7: don't round-trip Anthropic's count-tokens API before sending —
 * one network hop per call defeats the cost banner. Local estimate is good
 * enough as a chunk-budget gate; the provider returns real usage afterward.
 *
 * Estimation rule: roughly 1 token per 4 characters of UTF-8 text. This
 * over-estimates ASCII slightly and under-estimates CJK, but for class-bag
 * payloads (mostly ASCII) it's within 10-15% of Anthropic's tokenizer.
 */

import {
  MAX_CLUSTER_TOKEN_ESTIMATE,
  MAX_SAMPLE_CHARS,
  MAX_SAMPLES_PER_CLUSTER,
  MAX_TOKENS_RENDERED,
  MAX_TOTAL_SAMPLE_CHARS,
} from './constants.js'
import { pickSamples } from './samples.js'
import type { Cluster } from './types.js'

const CHARS_PER_TOKEN = 4

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Compact representation of a cluster suitable for LLM input. */
export interface CompactCluster {
  cluster_id: string
  kind: string
  tokens: string[]
  truncated_token_count: number
  samples: { file: string; line: number; snippet: string }[]
  truncated_sample_count: number
}

/**
 * Sample snippets prefer `surrounding_context` (gives the LLM role clues like
 * "this is inside a button"). Fall back to `raw_class_string` if context is
 * empty.
 */
function buildSample(row: { file: string; line: number; raw_class_string: string; surrounding_context: string }): {
  file: string
  line: number
  snippet: string
} {
  const source = row.surrounding_context.trim() || row.raw_class_string.trim()
  const snippet = source.length <= MAX_SAMPLE_CHARS ? source : source.slice(0, MAX_SAMPLE_CHARS) + '…'
  return { file: row.file, line: row.line, snippet }
}

export function compactClusterForPrompt(cluster: Cluster): CompactCluster {
  const allTokens = cluster.signature.tokens
  const tokens = allTokens.slice(0, MAX_TOKENS_RENDERED)
  const truncated_token_count = Math.max(0, allTokens.length - tokens.length)

  const picked = pickSamples(cluster.members, MAX_SAMPLES_PER_CLUSTER)
  const compactSamples: CompactCluster['samples'] = []
  let runningChars = 0
  for (const row of picked) {
    const sample = buildSample(row)
    if (runningChars + sample.snippet.length > MAX_TOTAL_SAMPLE_CHARS && compactSamples.length > 0) break
    compactSamples.push(sample)
    runningChars += sample.snippet.length
  }
  const truncated_sample_count = picked.length - compactSamples.length

  return {
    cluster_id: cluster.cluster_id,
    kind: cluster.signature.kind,
    tokens,
    truncated_token_count,
    samples: compactSamples,
    truncated_sample_count,
  }
}

export function estimateCompactClusterTokens(compact: CompactCluster): number {
  return estimateTokensFromText(JSON.stringify(compact))
}

export function isOverPerClusterBudget(compact: CompactCluster): boolean {
  return estimateCompactClusterTokens(compact) > MAX_CLUSTER_TOKEN_ESTIMATE
}
