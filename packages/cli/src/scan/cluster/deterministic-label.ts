/**
 * Deterministic labeler. Produces LabeledCluster[] from Cluster[] without
 * any LLM call. Used for --no-llm mode and as a stable fallback when the
 * LLM call fails. Same input → same labels across runs.
 *
 * Labels are derived from the cluster's leading sorted token (its
 * "anchor"). Generic tokens are skipped so labels don't collapse to
 * "block" or "p-4". Per codex consult 2026-05-11 Q7: serializer is LLM-
 * agnostic so this slot-fills the same interface.
 */

import type { Cluster, LabeledCluster } from './types.js'

const GENERIC_TOKENS = new Set([
  'block',
  'inline',
  'flex',
  'grid',
  'hidden',
  'relative',
  'absolute',
  'fixed',
  'static',
  'sticky',
])

function pickAnchor(tokens: string[]): string {
  for (const t of tokens) {
    if (!GENERIC_TOKENS.has(t)) return t
  }
  return tokens[0] ?? 'unknown'
}

function suggestedRole(kind: string): string {
  switch (kind) {
    case 'raw_button_tag':
      return 'button-element'
    case 'include_partial':
      return 'partial-include'
    case 'x_component_usage':
      return 'x-component'
    case 'at_class_directive':
      return 'at-class-directive'
    case 'conditional_class_array':
      return 'conditional-class'
    case 'inline_classes':
      return 'inline-class-bag'
    default:
      return kind
  }
}

export function deterministicLabel(cluster: Cluster): LabeledCluster {
  const anchor = pickAnchor(cluster.signature.tokens)
  return {
    cluster,
    human_label: `${anchor}-cluster-${cluster.cluster_id}`,
    suggested_role: suggestedRole(cluster.signature.kind),
    source: 'deterministic',
  }
}

export function deterministicLabelAll(clusters: Cluster[]): LabeledCluster[] {
  return clusters.map(deterministicLabel)
}
