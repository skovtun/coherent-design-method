/**
 * ID-reconciliation for B-2b LLM output. Codex Q4: every input cluster_id
 * must appear exactly once in output; no extras, no duplicates, no invented
 * IDs. Schema fields (human_label, confidence) must be present and valid.
 *
 * This module reports the *what*, not the *how* — the orchestrator decides
 * whether to retry, repair the broken subset, or fall back to deterministic.
 */

import type { RawLabelOutput } from './providers/types.js'

export interface ReconcileReport {
  /** Outputs that match input IDs and pass schema validation. */
  valid: RawLabelOutput[]
  /** Input cluster_ids the LLM didn't return. */
  missing: string[]
  /** Output cluster_ids that weren't in input (hallucinated). */
  extra: string[]
  /** Cluster_ids the LLM emitted more than once. */
  duplicate: string[]
  /** Outputs that match input IDs but fail schema validation. */
  invalid: { cluster_id: string; reason: string }[]
  /** True when valid.length === expectedIds.length and others are empty. */
  ok: boolean
}

const ROLE_RE = /^[a-z][a-z0-9]*(\.[a-z0-9]+){0,3}$/
const LABEL_MAX = 60
const LABEL_MIN = 2

function validateOutput(output: RawLabelOutput): string | null {
  if (typeof output.human_label !== 'string') return 'human_label must be string'
  const label = output.human_label.trim()
  if (label.length < LABEL_MIN) return `human_label too short (<${LABEL_MIN} chars)`
  if (label.length > LABEL_MAX) return `human_label too long (>${LABEL_MAX} chars)`
  if (label.endsWith('.')) return 'human_label must not end with a period'

  if (typeof output.confidence !== 'number' || Number.isNaN(output.confidence)) {
    return 'confidence must be a number'
  }
  if (output.confidence < 0 || output.confidence > 1) {
    return 'confidence must be in [0, 1]'
  }

  if (output.suggested_role !== undefined) {
    if (typeof output.suggested_role !== 'string') return 'suggested_role must be string or omitted'
    if (output.suggested_role !== '' && !ROLE_RE.test(output.suggested_role)) {
      return `suggested_role does not match dot.case regex: ${output.suggested_role}`
    }
  }

  return null
}

export function reconcileLabelOutput(expectedIds: string[], outputs: RawLabelOutput[]): ReconcileReport {
  const expected = new Set(expectedIds)
  const seenCounts = new Map<string, number>()
  const validByFirstHit = new Map<string, RawLabelOutput>()
  const invalid: ReconcileReport['invalid'] = []
  const extra: string[] = []

  for (const out of outputs) {
    const id = out.cluster_id
    if (!expected.has(id)) {
      extra.push(id)
      continue
    }

    const prior = seenCounts.get(id) ?? 0
    seenCounts.set(id, prior + 1)

    if (prior > 0) continue // duplicate, ignore; tracked below

    const reason = validateOutput(out)
    if (reason) {
      invalid.push({ cluster_id: id, reason })
    } else {
      validByFirstHit.set(id, { ...out, human_label: out.human_label.trim() })
    }
  }

  const duplicate: string[] = []
  for (const [id, count] of seenCounts) {
    if (count > 1) duplicate.push(id)
  }

  const missing: string[] = []
  for (const id of expectedIds) {
    if (!validByFirstHit.has(id) && !invalid.find(i => i.cluster_id === id)) {
      missing.push(id)
    }
  }

  const ok = missing.length === 0 && extra.length === 0 && duplicate.length === 0 && invalid.length === 0

  return {
    valid: expectedIds.map(id => validByFirstHit.get(id)).filter((v): v is RawLabelOutput => v !== undefined),
    missing,
    extra,
    duplicate,
    invalid,
    ok,
  }
}

/** Returns the subset of IDs that still need re-labeling after a partial run. */
export function unresolvedIds(report: ReconcileReport, expectedIds: string[]): string[] {
  const resolved = new Set(report.valid.map(v => v.cluster_id))
  return expectedIds.filter(id => !resolved.has(id))
}
