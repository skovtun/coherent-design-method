/**
 * DRIFT-REPORT.md emitter (B-2c). Conservative v0 per codex consult
 * 2026-05-11 Q6: NO automated semantic matching against free-form
 * DESIGN.md (prose vs class strings, mixed-language docs — too fragile).
 * The report states what was detected and defers comparison to a human.
 * Never claims a cluster is or is not covered by DESIGN.md.
 */

import type { ScanRunMetadata } from '../json-output.js'
import type { LabeledCluster } from './types.js'

export const DRIFT_TOP_N_DEFAULT = 20

export interface DriftReportOptions {
  /** Absolute path of the detected DESIGN.md. */
  designPath: string
  metadata: ScanRunMetadata
  /** How many clusters to list, by member count. Default 20. */
  topN?: number
}

const DISCLAIMER = [
  '> **Conservative report — no automated semantic comparison.**',
  '>',
  '> Clusters below were detected in code. Whether each one is already',
  '> covered by DESIGN.md is NOT determined automatically — free-form',
  '> design docs cannot be reliably matched against class strings.',
  '> Semantic comparison deferred — manual review required.',
].join('\n')

function clusterRow(rank: number, lc: LabeledCluster): string {
  const { cluster, human_label, source } = lc
  return `| ${rank} | ${human_label} | \`${cluster.signature.kind}\` | ${cluster.members.length} | \`${cluster.cluster_id}\` | ${source} |`
}

export function serializeDriftReport(clusters: LabeledCluster[], options: DriftReportOptions): string {
  const topN = options.topN ?? DRIFT_TOP_N_DEFAULT
  const sorted = clusters.slice().sort((a, b) => b.cluster.members.length - a.cluster.members.length)
  const top = sorted.slice(0, topN)
  const omitted = sorted.length - top.length

  const lines: string[] = [
    '# Drift Report (DRAFT)',
    '',
    DISCLAIMER,
    '',
    `DESIGN.md detected at \`${options.designPath}\`.`,
    '',
    '## Scan context',
    '',
    `- **project:** \`${options.metadata.project_root}\``,
    `- **scanned at:** ${options.metadata.scanned_at}`,
    `- **adapter:** ${options.metadata.adapter}`,
    `- **clusters detected:** ${clusters.length}`,
    '',
    `## Detected code clusters (top ${top.length} by occurrences)`,
    '',
    '| # | Label | Kind | Occurrences | id | Source |',
    '|---|-------|------|-------------|----|--------|',
  ]

  top.forEach((lc, i) => lines.push(clusterRow(i + 1, lc)))

  if (omitted > 0) {
    lines.push('')
    lines.push(
      `_${omitted} smaller cluster${omitted === 1 ? '' : 's'} omitted — see COHERENT-DESIGN.md for the full list._`,
    )
  }

  lines.push('')
  lines.push('## Manual review')
  lines.push('')
  lines.push('For each cluster above, check whether DESIGN.md already documents the')
  lines.push('pattern. If yes — align the code with the documented rule. If no —')
  lines.push('decide whether the pattern belongs in DESIGN.md or should be removed.')
  lines.push('Cluster IDs are stable across runs; safe to reference in issues.')

  return lines.join('\n').trimEnd() + '\n'
}
