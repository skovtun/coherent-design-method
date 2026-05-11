/**
 * B-2b orchestrator: turns Cluster[] into LabeledCluster[] via cache + chunked
 * LLM calls + 3-attempt repair ladder + deterministic fallback.
 *
 * Codex Q4 ladder per chunk:
 *   Attempt 1 — full chunk via provider
 *   Attempt 2 — full chunk with repair sub-context (missing/extra/dup/invalid)
 *   Attempt 3 — subset repair: re-call ONLY the still-unresolved IDs
 *   Then deterministic fallback at FALLBACK_CONFIDENCE for whatever's left
 *
 * Caching: only `source: 'llm'` results are written. Deterministic fallbacks
 * are NOT cached — next run gets a fresh shot at the LLM. This costs a bit
 * more but avoids freezing in low-confidence labels.
 */

import { chunkClustersForLabeling } from './chunking.js'
import { FALLBACK_CONFIDENCE, MODEL_ID, PROMPT_VERSION, TEMPERATURE } from './constants.js'
import { deterministicLabel } from './deterministic-label.js'
import {
  buildCacheKey,
  hashDesign,
  hashSignature,
  loadCache,
  lookupBatch,
  saveCache,
  upsertBatch,
  type CacheFile,
} from './cache.js'
import { reconcileLabelOutput, unresolvedIds } from './reconcile.js'
import type { LabelChunkInput, LabelProvider, RawLabelOutput } from './providers/types.js'
import type { Cluster, LabeledCluster } from './types.js'

export interface OrchestratorOptions {
  provider: LabelProvider
  designContext: string | null
  cachePath: string | null
  /** Suppresses cache read/write. Used by `--no-cache` and the stability test. */
  disableCache?: boolean
  /**
   * When true, partial LLM failure throws after the repair ladder rather than
   * falling back to deterministic (codex Q12 — --strict-llm).
   */
  strictLlm?: boolean
  /** Optional per-chunk progress callback. */
  onProgress?: (info: ChunkProgress) => void
}

export interface ChunkProgress {
  index: number
  total: number
  uncached: number
  attempt: 1 | 2 | 3
  reconciled: number
  unresolved: number
}

export interface OrchestratorResult {
  labeled: LabeledCluster[]
  cacheHits: number
  cacheMisses: number
  fallbackCount: number
  chunkCount: number
  /** Total tokens reported by provider, summed across all calls. */
  usage: { input_tokens: number; output_tokens: number }
}

export async function labelClustersWithLLM(
  clusters: Cluster[],
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const designHash = hashDesign(options.designContext)

  const cacheFile: CacheFile =
    options.disableCache || !options.cachePath ? { version: 1, entries: {} } : loadCache(options.cachePath)

  // Hash signatures up front so cache lookup is one pass.
  const sigHashes = new Map<string, string>()
  for (const c of clusters) {
    sigHashes.set(c.cluster_id, hashSignature(c.signature.kind, c.signature.tokens))
  }
  const cacheLookup = lookupBatch(
    cacheFile,
    { prompt_version: PROMPT_VERSION, model_id: MODEL_ID, design_hash: designHash },
    clusters.map(c => ({ cluster_id: c.cluster_id, signature_hash: sigHashes.get(c.cluster_id)! })),
  )

  const cachedResults = new Map<string, LabeledCluster>()
  const uncached: Cluster[] = []
  for (const c of clusters) {
    const entry = cacheLookup.get(c.cluster_id)
    if (entry) {
      // Rehydrate with the live cluster's members (cache stored a stale snapshot).
      cachedResults.set(c.cluster_id, { ...entry.labeled, cluster: c, source: 'cache' })
    } else {
      uncached.push(c)
    }
  }

  const chunks = chunkClustersForLabeling(uncached, { designContext: options.designContext })

  const llmResults = new Map<string, LabeledCluster>()
  let fallbackCount = 0
  const usage = { input_tokens: 0, output_tokens: 0 }
  const cacheUpserts: { signature_hash: string; labeled: LabeledCluster }[] = []

  for (let i = 0; i < chunks.length; i++) {
    const plan = chunks[i]
    const expectedIds = plan.clusters.map(c => c.cluster_id)
    const baseInput: LabelChunkInput = {
      clusters: plan.clusters,
      designContext: options.designContext,
      designHash,
      promptVersion: PROMPT_VERSION,
      modelId: MODEL_ID,
      temperature: TEMPERATURE,
    }

    let report = await runProvider(options.provider, baseInput, usage)
    options.onProgress?.({
      index: i + 1,
      total: chunks.length,
      uncached: plan.clusters.length,
      attempt: 1,
      reconciled: report.valid.length,
      unresolved: expectedIds.length - report.valid.length,
    })

    // Attempt 2: full-chunk repair if anything is off.
    if (!report.ok) {
      const repaired = await runProvider(
        options.provider,
        {
          ...baseInput,
          repair: {
            attempt: 2,
            missing: report.missing,
            extra: report.extra,
            duplicate: report.duplicate,
            invalid: report.invalid.map(i => i.cluster_id),
          },
        },
        usage,
      )
      report = mergeReports(report, repaired)
      options.onProgress?.({
        index: i + 1,
        total: chunks.length,
        uncached: plan.clusters.length,
        attempt: 2,
        reconciled: report.valid.length,
        unresolved: expectedIds.length - report.valid.length,
      })
    }

    // Attempt 3: subset repair for whatever's still unresolved.
    const stillUnresolved = unresolvedIds(report, expectedIds)
    if (stillUnresolved.length > 0) {
      const subsetClusters = plan.clusters.filter(c => stillUnresolved.includes(c.cluster_id))
      const subsetReport = await runProvider(
        options.provider,
        {
          ...baseInput,
          clusters: subsetClusters,
          repair: { attempt: 3, missing: stillUnresolved, extra: [], duplicate: [], invalid: [] },
        },
        usage,
      )
      report = mergeReports(report, subsetReport, stillUnresolved)
      options.onProgress?.({
        index: i + 1,
        total: chunks.length,
        uncached: plan.clusters.length,
        attempt: 3,
        reconciled: report.valid.length,
        unresolved: expectedIds.length - report.valid.length,
      })
    }

    // Promote valid outputs to LabeledCluster + record for cache.
    for (const raw of report.valid) {
      const cluster = plan.clusters.find(c => c.cluster_id === raw.cluster_id)
      if (!cluster) continue // shouldn't happen — extras filtered in reconcile
      const labeled: LabeledCluster = {
        cluster,
        human_label: raw.human_label,
        suggested_role: raw.suggested_role,
        confidence: raw.confidence,
        source: 'llm',
      }
      llmResults.set(cluster.cluster_id, labeled)
      cacheUpserts.push({ signature_hash: sigHashes.get(cluster.cluster_id)!, labeled })
    }

    // Deterministic fallback for the remainder.
    const finalUnresolved = unresolvedIds(report, expectedIds)
    if (finalUnresolved.length > 0) {
      if (options.strictLlm) {
        throw new Error(
          `cluster --strict-llm: ${finalUnresolved.length} clusters could not be labeled after 3 attempts: ${finalUnresolved.slice(0, 5).join(', ')}${finalUnresolved.length > 5 ? '…' : ''}`,
        )
      }
      for (const id of finalUnresolved) {
        const cluster = plan.clusters.find(c => c.cluster_id === id)
        if (!cluster) continue
        const fallback = deterministicLabel(cluster)
        llmResults.set(id, { ...fallback, confidence: FALLBACK_CONFIDENCE })
        fallbackCount++
      }
    }
  }

  // Reassemble in input order.
  const labeled: LabeledCluster[] = clusters.map(c => {
    const fromLlm = llmResults.get(c.cluster_id)
    if (fromLlm) return fromLlm
    const cached = cachedResults.get(c.cluster_id)
    if (cached) return cached
    // Should never happen — every cluster goes through at least one path.
    return { ...deterministicLabel(c), confidence: FALLBACK_CONFIDENCE }
  })

  // Persist cache (only LLM-sourced labels — deterministic fallbacks excluded).
  if (!options.disableCache && options.cachePath && cacheUpserts.length > 0) {
    const next = upsertBatch(
      cacheFile,
      { prompt_version: PROMPT_VERSION, model_id: MODEL_ID, design_hash: designHash },
      cacheUpserts,
    )
    saveCache(options.cachePath, next)
  }

  return {
    labeled,
    cacheHits: cachedResults.size,
    cacheMisses: uncached.length,
    fallbackCount,
    chunkCount: chunks.length,
    usage,
  }
}

async function runProvider(
  provider: LabelProvider,
  input: LabelChunkInput,
  usage: { input_tokens: number; output_tokens: number },
): Promise<ReturnType<typeof reconcileLabelOutput>> {
  const ids = input.clusters.map(c => c.cluster_id)
  let outputs: RawLabelOutput[] = []
  try {
    const result = await provider.labelChunk(input)
    outputs = result.outputs
    if (result.usage) {
      usage.input_tokens += result.usage.input_tokens
      usage.output_tokens += result.usage.output_tokens
    }
  } catch {
    // Network/SDK failure looks like a missing-everything reconcile report.
    outputs = []
  }
  return reconcileLabelOutput(ids, outputs)
}

/**
 * Merges a follow-up report's `valid` outputs into the prior report. The
 * second report's IDs are the new authority for that subset; previous
 * missing/extra/duplicate/invalid sets are recomputed.
 */
function mergeReports(
  prior: ReturnType<typeof reconcileLabelOutput>,
  next: ReturnType<typeof reconcileLabelOutput>,
  /** When provided, only these IDs count as "new authority". */
  scopedIds?: string[],
): ReturnType<typeof reconcileLabelOutput> {
  const validById = new Map<string, RawLabelOutput>()
  for (const v of prior.valid) validById.set(v.cluster_id, v)
  for (const v of next.valid) {
    if (!scopedIds || scopedIds.includes(v.cluster_id)) validById.set(v.cluster_id, v)
  }
  return {
    valid: Array.from(validById.values()),
    missing: [],
    extra: [],
    duplicate: [],
    invalid: [],
    ok: true,
  }
}
