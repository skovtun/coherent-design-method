/**
 * B-2b LLM labeler constants. Pinned for cache stability and reproducibility.
 * Per codex consult 2026-05-11 Q8: never `-latest`; record provenance.
 *
 * Bump `PROMPT_VERSION` whenever the system prompt or output schema changes;
 * the cache key (Q5) folds this in so stale labels invalidate cleanly.
 */

export const MODEL_ID = 'claude-sonnet-4-6' as const
export const PROMPT_VERSION = 'labeler-v1' as const
export const TEMPERATURE = 0 as const

/** Max input tokens per chunk before the chunker splits (codex Q3). */
export const MAX_INPUT_TOKENS_PER_CHUNK = 45_000
/** Absolute ceiling — if estimator says we're past this, abort the chunk. */
export const HARD_INPUT_TOKEN_CAP = 60_000
/** Soft cluster-count cap per chunk; token budget can split earlier. */
export const MAX_CLUSTERS_PER_CHUNK = 50

/** Per-cluster compaction caps (codex Q7). */
export const MAX_SAMPLES_PER_CLUSTER = 3
export const MAX_SAMPLE_CHARS = 1_500
export const MAX_TOTAL_SAMPLE_CHARS = 4_000
export const MAX_TOKENS_RENDERED = 120
export const MAX_CLUSTER_TOKEN_ESTIMATE = 8_000

/** Deterministic fallback confidence when LLM repair ladder exhausts (codex Q4). */
export const FALLBACK_CONFIDENCE = 0.35

/** Cost banner pricing anchors. Sonnet input/output per million tokens. */
export const SONNET_INPUT_COST_PER_MTOK = 3.0
export const SONNET_OUTPUT_COST_PER_MTOK = 15.0
