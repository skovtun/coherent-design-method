/**
 * `coherent cluster` — Tool 2 (B-2b: LLM labeler + deterministic fallback).
 *
 * Reads a B-1 evidence JSON file, clusters deterministically, then optionally
 * labels via Sonnet 4.6 with a chunked-batch + repair-ladder orchestrator
 * (see scan/cluster/llm-label.ts). Falls back to deterministic labels per
 * cluster when the LLM cannot satisfy the ID contract.
 *
 * Codex consult 2026-05-11 verdicts encoded throughout. See `/tmp/codex-b2b-
 * consult.md` (consult artifact) for the design rationale.
 *
 * Errors via plain chalk + process.exit to match `coherent scan`'s style.
 * Promotion to CoherentError + an E009/E010 slot is a follow-up.
 */

import chalk from 'chalk'
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { deterministicLabelAll } from '../scan/cluster/deterministic-label.js'
import { precluster } from '../scan/cluster/precluster.js'
import { serializeCohereDesign } from '../scan/cluster/serialize.js'
import { SCHEMA_VERSION, type ScanOutput } from '../scan/json-output.js'
import { confirmLlmRun } from '../scan/cluster/cost-banner.js'
import { defaultCachePath } from '../scan/cluster/cache.js'
import { chunkClustersForLabeling, totalEstimatedInputTokens } from '../scan/cluster/chunking.js'
import { MODEL_ID } from '../scan/cluster/constants.js'
import { AnthropicLabelProvider } from '../scan/cluster/providers/anthropic-label-provider.js'
import { labelClustersWithLLM } from '../scan/cluster/llm-label.js'
import { evaluate, formatEvalReport, loadExpected } from '../scan/cluster/eval.js'
import { formatRedactionWarning, scanClustersForSecrets } from '../scan/cluster/redaction.js'

export interface ClusterOptions {
  out?: string
  /** Commander.js maps `--no-llm` to `llm: false`. Default (undefined) = LLM on. */
  llm?: boolean
  yes?: boolean
  strictLlm?: boolean
  /** Commander maps `--no-cache` → `cache: false`. */
  cache?: boolean
  design?: string
  eval?: string
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

  const llmEnabled = opts.llm !== false
  const useCache = opts.cache !== false
  const projectRoot = parsed.metadata.project_root
  const designResolved = resolveDesignPath(opts.design, projectRoot)
  const designContext = designResolved ? readFileSync(designResolved, 'utf8') : null
  const designBytes = designResolved ? statSync(designResolved).size : 0

  let labeled
  let summaryLine: string

  if (!llmEnabled) {
    labeled = deterministicLabelAll(clusters)
    summaryLine = `${parsed.rows.length} rows → ${clusters.length} clusters (${Date.now() - started}ms, deterministic)`
  } else {
    const provider = new AnthropicLabelProvider()
    const cachePath = useCache ? defaultCachePath(projectRoot) : null

    const chunks = chunkClustersForLabeling(clusters, { designContext })
    const estimatedInputTokens = totalEstimatedInputTokens(chunks)
    const estimatedOutputTokens = Math.max(500, clusters.length * 50)

    const redactionHits = scanClustersForSecrets(clusters)
    const redactionWarning = formatRedactionWarning(redactionHits)
    if (redactionWarning) process.stderr.write(chalk.yellow(redactionWarning) + '\n')

    let proceed: boolean
    try {
      proceed = await confirmLlmRun(
        {
          totalClusters: clusters.length,
          cachedClusters: 0, // refined inside orchestrator; banner reflects total work
          uncachedClusters: clusters.length,
          chunks: chunks.length,
          estimatedInputTokens,
          estimatedOutputTokens,
          model: MODEL_ID,
          designPath: designResolved,
          designBytes,
        },
        {
          assumeYes: opts.yes === true,
          isTTY: Boolean(process.stdout.isTTY),
        },
      )
    } catch (err) {
      console.error(chalk.red(`✗ cluster: ${(err as Error).message}`))
      process.exit(1)
    }

    if (!proceed) {
      console.error(chalk.gray('Cancelled.'))
      process.exit(0)
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(
        chalk.red(
          '✗ cluster: ANTHROPIC_API_KEY not set. Pass --no-llm for deterministic-only output, or export the env var.',
        ),
      )
      process.exit(1)
    }

    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext,
      cachePath,
      disableCache: !useCache,
      strictLlm: opts.strictLlm === true,
      onProgress: info => {
        if (info.attempt > 1) {
          process.stderr.write(
            chalk.gray(
              `  chunk ${info.index}/${info.total} repair attempt ${info.attempt}: ${info.unresolved} unresolved\n`,
            ),
          )
        }
      },
    })
    labeled = result.labeled
    summaryLine =
      `${parsed.rows.length} rows → ${clusters.length} clusters → ${result.cacheHits} cached, ` +
      `${result.cacheMisses} via LLM (${result.chunkCount} chunks, ${result.fallbackCount} fallbacks, ` +
      `${result.usage.input_tokens}/${result.usage.output_tokens} in/out tokens) in ${Date.now() - started}ms`
  }

  const md = serializeCohereDesign(labeled, { metadata: parsed.metadata })
  const outPath = resolve(opts.out ?? 'COHERENT-DESIGN.md')
  writeFileSync(outPath, md, 'utf8')

  console.error(chalk.green(`✓ cluster: ${summaryLine} → ${outPath}`))

  if (opts.eval) {
    const evalPath = resolve(opts.eval)
    try {
      const expected = loadExpected(evalPath)
      const report = evaluate(labeled, expected)
      process.stderr.write('\n' + formatEvalReport(report) + '\n')
      if (!report.gate.flip_llm_default_ok) process.exit(2)
    } catch (err) {
      console.error(chalk.red(`✗ cluster --eval: ${(err as Error).message}`))
      process.exit(1)
    }
  }
}

function resolveDesignPath(flag: string | undefined, projectRoot: string): string | null {
  if (flag) {
    const explicit = resolve(flag)
    if (!existsSync(explicit)) return null
    return explicit
  }
  const fallback = resolve(projectRoot, 'DESIGN.md')
  return existsSync(fallback) ? fallback : null
}
