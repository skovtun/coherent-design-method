/**
 * Deterministic labeler. Produces LabeledCluster[] from Cluster[] without
 * any LLM call. This is the DEFAULT (free) label and the fallback when an
 * LLM call cannot resolve a cluster. Same input → same labels across runs.
 *
 * The label is the cluster's CLASS SIGNATURE — its meaningful tokens joined,
 * with pure spacing/sizing utilities dropped (see salientTokens). Honest and
 * free: "text-grey_light_text", "container text-sm", "grid grid-cols-a1a".
 * The `--llm` path polishes these into semantic names ("Subtle Text",
 * "Breadcrumb Nav"); the free default no longer emits "<token>-cluster-<hash>"
 * noise (the stable id already prints on its own line in COHERENT-DESIGN.md).
 * Per codex consult 2026-05-11 Q7: serializer is LLM-agnostic so this
 * slot-fills the same interface.
 */

import { salientTokens } from './token-class.js'
import type { Cluster, LabeledCluster } from './types.js'

/** Cap so a class-soup cluster doesn't produce a runaway heading. */
const LABEL_MAX_CHARS = 56

function classSignatureLabel(tokens: string[]): string {
  const salient = salientTokens(tokens)
  if (salient.length === 0) return 'unknown'
  const joined = salient.join(' ')
  if (joined.length <= LABEL_MAX_CHARS) return joined
  // Truncate on a token boundary, mark elision.
  let out = ''
  for (const t of salient) {
    const next = out ? `${out} ${t}` : t
    if (next.length > LABEL_MAX_CHARS - 2) break
    out = next
  }
  return `${out || salient[0].slice(0, LABEL_MAX_CHARS - 2)} …`
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
  return {
    cluster,
    human_label: classSignatureLabel(cluster.signature.tokens),
    suggested_role: suggestedRole(cluster.signature.kind),
    source: 'deterministic',
  }
}

export function deterministicLabelAll(clusters: Cluster[]): LabeledCluster[] {
  return clusters.map(deterministicLabel)
}
