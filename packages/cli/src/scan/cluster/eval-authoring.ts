/**
 * Authoring-card generation for eval ground truth (R10).
 *
 * A card shows the author EXACTLY what the LLM labeler sees for a cluster —
 * signature tokens, the same code samples `pickSamples` feeds the prompt
 * (with surrounding context), occurrence + file-spread counts — so
 * `acceptable_labels` are authored from the SAME context, not from token
 * signatures alone (the 2026-07-11 eval-gate failure mode).
 *
 * Codex consult 2026-07-13 verdicts encoded here:
 * - v2: dev-script surface, NOT a supported CLI feature.
 * - v2: cards embed pilot-project code — they must NEVER be written inside
 *   the public repo. `assertOutsideRepo` enforces it.
 * - v5: cluster_ids are unsalted content-derived hashes of low-entropy class
 *   signatures — treat cards and expected.json as private artifacts.
 * - Deliberately NO deterministic-label hint on the card: it would anchor
 *   the author toward token-derived names, recreating the original bias.
 */

import { existsSync, realpathSync } from 'fs'
import { dirname, resolve, sep } from 'path'
import { pickSamples } from './samples.js'
import { stratumOf } from './eval-sampling.js'
import type { Cluster } from './types.js'

export const SAMPLES_PER_CARD = 3

export interface AuthoringCardsOptions {
  /** Clusters in the representative sample. */
  sampled: Cluster[]
  /** Forced hard-case clusters (zero-tolerance suite). */
  hardCases: Cluster[]
  /** Path of the DESIGN.md the labeler would see, if any. */
  designPath?: string | null
  seed: number
}

/**
 * Refuse to write private authoring artifacts inside the public repository.
 * `repoRoot` is the coherent-design-method checkout; `targetPath` is where
 * the caller wants to write cards/expected.json.
 */
export function assertOutsideRepo(targetPath: string, repoRoot: string): void {
  const target = resolveExisting(resolve(targetPath))
  const root = resolveExisting(resolve(repoRoot))
  if (target === root || target.startsWith(root + sep)) {
    throw new Error(
      `eval-authoring: refusing to write private eval artifacts inside the public repo (${targetPath}). ` +
        'Cards embed pilot-project code samples; write them to the pilot project or another private location.',
    )
  }
}

/** Resolve symlinks on the nearest existing ancestor so /tmp vs /private/tmp cannot bypass the check. */
function resolveExisting(p: string): string {
  let probe = p
  let suffix = ''
  while (!existsSync(probe)) {
    suffix = sep + probe.split(sep).pop() + suffix
    const parent = dirname(probe)
    if (parent === probe) return p
    probe = parent
  }
  return realpathSync(probe) + suffix
}

function fileSpread(cluster: Cluster): number {
  return new Set(cluster.members.map(m => m.file)).size
}

function card(cluster: Cluster, kindTag: 'representative' | 'hard-case'): string {
  const samples = pickSamples(cluster.members, SAMPLES_PER_CARD)
  const lines: string[] = []
  lines.push(`### ${cluster.cluster_id} (${kindTag})`)
  lines.push('')
  lines.push(`- **kind:** \`${cluster.signature.kind}\``)
  lines.push(`- **stratum:** ${stratumOf(cluster)}`)
  lines.push(`- **occurrences:** ${cluster.members.length}`)
  lines.push(`- **distinct files:** ${fileSpread(cluster)}`)
  lines.push(`- **tokens:** \`${cluster.signature.tokens.join(' ')}\``)
  lines.push('- **samples (same as the labeler sees):**')
  lines.push('')
  for (const s of samples) {
    lines.push(`  \`${s.file}:${s.line}\``)
    lines.push('')
    lines.push('  ```html')
    for (const ctxLine of s.surrounding_context.split('\n')) lines.push(`  ${ctxLine}`)
    lines.push('  ```')
    lines.push('')
  }
  lines.push('- **author here →** `acceptable_labels`: [ ], `expected_role`: , `must_be_generic`: ')
  lines.push('')
  return lines.join('\n')
}

export function serializeAuthoringCards(options: AuthoringCardsOptions): string {
  const { sampled, hardCases, designPath, seed } = options
  const lines: string[] = [
    '# Eval authoring cards (PRIVATE — do not commit)',
    '',
    '> Author 2–5 `acceptable_labels` + `expected_role` per cluster **from the card',
    '> content only** (tokens + samples + DESIGN.md), i.e. the same context the LLM',
    '> labeler sees. For high-spread generic utilities set `must_be_generic: true` —',
    '> a usage-specific label on such a cluster must count as a failure (F13).',
    '',
    `- **seed:** ${seed}`,
    `- **representative cases:** ${sampled.length}`,
    `- **hard cases (zero-tolerance):** ${hardCases.length}`,
    `- **DESIGN.md:** ${designPath ? `\`${designPath}\` (read it before authoring)` : 'none detected'}`,
    '',
    '## Hard-case suite',
    '',
  ]
  for (const c of hardCases) lines.push(card(c, 'hard-case'))
  lines.push('## Representative sample')
  lines.push('')
  for (const c of sampled) lines.push(card(c, 'representative'))
  return (
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}
