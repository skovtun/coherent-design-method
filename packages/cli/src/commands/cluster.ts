/**
 * `coherent cluster` — Tool 2 Phase B-2a (deterministic clustering).
 *
 * Reads a B-1 evidence JSON file and emits a draft COHERENT-DESIGN.md.
 * v0 supports only the deterministic path (`--no-llm`); the chunked-batch
 * LLM labeler ships in B-2b. Cluster IDs are stable across runs so
 * downstream tooling (--diff, merge wizard) can rely on them.
 *
 * Errors via plain chalk + process.exit to match `coherent scan`'s style.
 * Promotion to CoherentError + an E009 slot is a follow-up.
 */

import chalk from 'chalk'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { deterministicLabelAll } from '../scan/cluster/deterministic-label.js'
import { precluster } from '../scan/cluster/precluster.js'
import { serializeCohereDesign } from '../scan/cluster/serialize.js'
import { SCHEMA_VERSION, type ScanOutput } from '../scan/json-output.js'

export interface ClusterOptions {
  out?: string
  /** Commander.js maps `--no-llm` to `llm: false`; absence leaves it `undefined`. */
  llm?: boolean
}

function isScanOutput(value: unknown): value is ScanOutput {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.metadata !== null && typeof v.metadata === 'object' && Array.isArray(v.rows)
}

export async function clusterCommand(evidencePath: string, opts: ClusterOptions = {}): Promise<void> {
  if (!evidencePath) {
    console.error(chalk.red('✗ cluster: evidence JSON path is required (run `coherent scan` first)'))
    process.exit(1)
  }

  if (opts.llm !== false) {
    console.error(
      chalk.yellow('⚠ cluster: B-2a ships --no-llm only. Pass --no-llm explicitly; LLM labeler lands in B-2b.'),
    )
    process.exit(1)
  }

  const inputPath = resolve(evidencePath)
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch (err) {
    console.error(chalk.red(`✗ cluster: cannot read ${inputPath} (${(err as Error).message})`))
    process.exit(1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(chalk.red(`✗ cluster: ${inputPath} is not valid JSON (${(err as Error).message})`))
    process.exit(1)
  }

  if (!isScanOutput(parsed)) {
    console.error(chalk.red(`✗ cluster: ${inputPath} does not match ScanOutput schema (expected {metadata, rows})`))
    process.exit(1)
  }

  if (parsed.metadata.schema_version !== SCHEMA_VERSION) {
    console.error(
      chalk.yellow(
        `⚠ cluster: schema mismatch (file=${parsed.metadata.schema_version}, cli=${SCHEMA_VERSION}). Output may be wrong. Re-run \`coherent scan\` with this CLI.`,
      ),
    )
  }

  const started = Date.now()
  const clusters = precluster(parsed.rows)
  const labeled = deterministicLabelAll(clusters)
  const md = serializeCohereDesign(labeled, { metadata: parsed.metadata })
  const duration = Date.now() - started

  const outPath = resolve(opts.out ?? 'COHERENT-DESIGN.md')
  writeFileSync(outPath, md, 'utf8')

  console.error(
    chalk.green(
      `✓ cluster: ${parsed.rows.length} rows → ${clusters.length} clusters (${duration}ms, deterministic) → ${outPath}`,
    ),
  )
}
