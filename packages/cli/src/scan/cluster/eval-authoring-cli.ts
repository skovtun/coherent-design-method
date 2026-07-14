/**
 * Dev-only entry: generate eval authoring cards (R10).
 *
 * NOT a supported CLI feature — no bin registration, no docs, no
 * compatibility guarantees (codex consult 2026-07-13 verdict 2). Run from
 * a repo checkout after `npm run build`:
 *
 *   node packages/cli/dist/eval-authoring-cards.js <evidence.json> \
 *     --out /path/OUTSIDE/repo/AUTHORING-CARDS.md \
 *     [--seed 42] [--high 8 --mid 9 --low 8] [--force id1,id2,...] [--design path]
 *
 * Refuses to write inside the repo: cards embed pilot-project code.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { precluster } from './precluster.js'
import { stratifiedSample } from './eval-sampling.js'
import { assertOutsideRepo, serializeAuthoringCards } from './eval-authoring.js'
import type { ScanOutput } from '../json-output.js'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const evidencePath = process.argv[2]
const outFlag = arg('out')
if (!evidencePath || evidencePath.startsWith('--') || !outFlag) {
  console.error(
    'usage: eval-authoring-cards.js <evidence.json> --out <path outside repo> [--seed N] [--high N --mid N --low N] [--force ids] [--design path]',
  )
  process.exit(1)
}

const seed = Number(arg('seed') ?? 42)
const counts = {
  high: Number(arg('high') ?? 8),
  mid: Number(arg('mid') ?? 9),
  low: Number(arg('low') ?? 8),
}
const forcedIds = (arg('force') ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const designPath = arg('design') ?? null

// dist/eval-authoring-cards.js → packages/cli/dist → repo root is 3 up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const outPath = resolve(outFlag)
assertOutsideRepo(outPath, repoRoot)

const parsed = JSON.parse(readFileSync(resolve(evidencePath), 'utf8')) as ScanOutput
const clusters = precluster(parsed.rows)
const byId = new Map(clusters.map(c => [c.cluster_id, c]))

const hardCases = forcedIds.map(id => {
  const c = byId.get(id)
  if (!c) {
    console.error(`✗ forced hard-case id not found in corpus: ${id}`)
    process.exit(1)
  }
  return c
})

const sampled = stratifiedSample(clusters, { seed, counts, excludeIds: forcedIds })
const md = serializeAuthoringCards({ sampled, hardCases, designPath, seed })
writeFileSync(outPath, md, 'utf8')
console.error(
  `✓ authoring cards: ${hardCases.length} hard + ${sampled.length} representative (seed ${seed}) → ${outPath}`,
)
console.error('  PRIVATE artifact — do not commit. Author labels from card content only.')
