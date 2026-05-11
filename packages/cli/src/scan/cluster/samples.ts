/**
 * Deterministic sample selection for clusters. Same input → same samples
 * → reproducible labels and prompts across machines/runs.
 *
 * Order: stable sort by (file, line), then prefer distinct files when
 * the cluster has them. Per codex consult 2026-05-11 Q4.
 */

import type { EvidenceRow } from '../adapters/types.js'

export function pickSamples(members: EvidenceRow[], count: number): EvidenceRow[] {
  if (members.length <= count) return members.slice()

  const sorted = members.slice().sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

  const picked: EvidenceRow[] = []
  const seenFiles = new Set<string>()

  for (const row of sorted) {
    if (picked.length >= count) break
    if (!seenFiles.has(row.file)) {
      picked.push(row)
      seenFiles.add(row.file)
    }
  }

  if (picked.length < count) {
    for (const row of sorted) {
      if (picked.length >= count) break
      if (!picked.includes(row)) picked.push(row)
    }
  }

  return picked
}
