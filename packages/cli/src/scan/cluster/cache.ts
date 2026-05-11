/**
 * Project-local label cache for B-2b. Codex Q5: cache lives in the user's
 * project at `.coherent/cache/labels.json`. NO global cache — labels are
 * project-contextual (DESIGN.md, naming conventions), so cross-project
 * pollution would silently degrade output.
 *
 * Cache key folds: cluster_id + signature_hash + prompt_version + model_id
 * + design_hash. Any drift in any input invalidates the entry; the file is
 * append-only-ish (keys are rewritten in place on each run).
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { signatureKey } from './signature.js'
import type { LabeledCluster } from './types.js'

export interface CacheKeyParts {
  cluster_id: string
  signature_hash: string
  prompt_version: string
  model_id: string
  design_hash: string
}

export interface CacheEntry {
  key: string
  cluster_id: string
  labeled: LabeledCluster
  /** ISO timestamp of cache write. Diagnostics only; not part of the key. */
  cached_at: string
}

export interface CacheFile {
  version: 1
  entries: Record<string, CacheEntry>
}

const EMPTY_FILE: CacheFile = { version: 1, entries: {} }

export function hashSignature(kind: string, tokens: string[]): string {
  return createHash('sha256')
    .update(signatureKey({ kind: kind as never, tokens }))
    .digest('hex')
    .slice(0, 16)
}

export function hashDesign(designContext: string | null): string {
  if (!designContext || designContext.trim().length === 0) return 'none'
  return createHash('sha256').update(designContext).digest('hex').slice(0, 16)
}

export function buildCacheKey(parts: CacheKeyParts): string {
  return [parts.cluster_id, parts.signature_hash, parts.prompt_version, parts.model_id, parts.design_hash].join('::')
}

export function defaultCachePath(projectRoot: string): string {
  return resolve(projectRoot, '.coherent', 'cache', 'labels.json')
}

export function loadCache(cachePath: string): CacheFile {
  if (!existsSync(cachePath)) return { ...EMPTY_FILE, entries: {} }
  try {
    const raw = readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.version !== 1 || !parsed.entries) return { ...EMPTY_FILE, entries: {} }
    return parsed
  } catch {
    return { ...EMPTY_FILE, entries: {} }
  }
}

export function saveCache(cachePath: string, file: CacheFile): void {
  mkdirSync(dirname(cachePath), { recursive: true })
  writeFileSync(cachePath, JSON.stringify(file, null, 2), 'utf8')
}

/** Returns entries keyed by cluster_id for the subset already cached. */
export function lookupBatch(
  file: CacheFile,
  parts: Omit<CacheKeyParts, 'cluster_id' | 'signature_hash'>,
  clusters: { cluster_id: string; signature_hash: string }[],
): Map<string, CacheEntry> {
  const hits = new Map<string, CacheEntry>()
  for (const c of clusters) {
    const key = buildCacheKey({
      cluster_id: c.cluster_id,
      signature_hash: c.signature_hash,
      prompt_version: parts.prompt_version,
      model_id: parts.model_id,
      design_hash: parts.design_hash,
    })
    const entry = file.entries[key]
    if (entry) hits.set(c.cluster_id, entry)
  }
  return hits
}

export function upsertBatch(
  file: CacheFile,
  parts: Omit<CacheKeyParts, 'cluster_id' | 'signature_hash'>,
  rows: { signature_hash: string; labeled: LabeledCluster }[],
): CacheFile {
  const now = new Date().toISOString()
  const next: CacheFile = { version: 1, entries: { ...file.entries } }
  for (const row of rows) {
    const key = buildCacheKey({
      cluster_id: row.labeled.cluster.cluster_id,
      signature_hash: row.signature_hash,
      prompt_version: parts.prompt_version,
      model_id: parts.model_id,
      design_hash: parts.design_hash,
    })
    next.entries[key] = {
      key,
      cluster_id: row.labeled.cluster.cluster_id,
      labeled: row.labeled,
      cached_at: now,
    }
  }
  return next
}
