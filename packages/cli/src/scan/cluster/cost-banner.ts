/**
 * Cost banner + confirmation gate for B-2b LLM run. Codex Q6: show real work
 * (cache hits subtracted) before the first SDK call. CI without `--yes`
 * fails loudly — never spend money silently in non-interactive contexts.
 *
 * Pure-ish: formats + reads stdin. The orchestrator owns wall-clock checks
 * and prompt construction; this module just decides "proceed yes/no".
 */

import chalk from 'chalk'
import { createInterface } from 'node:readline'
import { SONNET_INPUT_COST_PER_MTOK, SONNET_OUTPUT_COST_PER_MTOK } from './constants.js'

export interface CostBannerInput {
  totalClusters: number
  cachedClusters: number
  uncachedClusters: number
  chunks: number
  estimatedInputTokens: number
  /** Rough output estimate: ~50 output tokens per uncached cluster. */
  estimatedOutputTokens: number
  model: string
  designPath: string | null
  designBytes: number
}

export interface ConfirmOptions {
  /** `--yes` flag was passed — skip the prompt. */
  assumeYes: boolean
  /** stdout/stderr.isTTY captured here for testability. */
  isTTY: boolean
  /** Override stdin reader (tests). */
  promptReader?: () => Promise<string>
}

export function estimateCost(input: { inputTokens: number; outputTokens: number }): number {
  return (
    (input.inputTokens / 1_000_000) * SONNET_INPUT_COST_PER_MTOK +
    (input.outputTokens / 1_000_000) * SONNET_OUTPUT_COST_PER_MTOK
  )
}

export function formatBanner(input: CostBannerInput): string {
  const cost = estimateCost({ inputTokens: input.estimatedInputTokens, outputTokens: input.estimatedOutputTokens })
  const designLine = input.designPath
    ? `DESIGN.md:        detected at ${input.designPath}, included (${formatBytes(input.designBytes)})`
    : `DESIGN.md:        none detected`

  const lines = [
    chalk.bold('Coherent cluster --llm'),
    '',
    designLine,
    `Cache:            ${chalk.green(`${input.cachedClusters} hit`)}, ${chalk.yellow(`${input.uncachedClusters} miss`)} (of ${input.totalClusters} total)`,
    `Chunks:           ${input.chunks}`,
    `Model:            ${input.model}`,
    `Est. input:       ~${kFmt(input.estimatedInputTokens)} tokens`,
    `Est. output:      ~${kFmt(input.estimatedOutputTokens)} tokens`,
    `Est. cost:        ${chalk.bold(`$${cost.toFixed(2)}`)} (sonnet $${SONNET_INPUT_COST_PER_MTOK}/$${SONNET_OUTPUT_COST_PER_MTOK} per MTok in/out)`,
    '',
  ]
  return lines.join('\n')
}

function kFmt(n: number): string {
  return n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

/**
 * Resolves to true if the run should proceed, false if cancelled. Throws on
 * CI-without-yes per Q6 — fail loudly rather than silently abort.
 */
export async function confirmLlmRun(banner: CostBannerInput, opts: ConfirmOptions): Promise<boolean> {
  process.stderr.write(formatBanner(banner))

  if (banner.uncachedClusters === 0) {
    process.stderr.write(chalk.green('All clusters cached — no LLM call needed.\n'))
    return true
  }

  if (opts.assumeYes) {
    process.stderr.write(chalk.gray('(--yes passed; proceeding)\n'))
    return true
  }

  if (!opts.isTTY) {
    throw new Error(
      'cluster --llm requires interactive confirmation or `--yes` flag. Non-TTY context detected (CI/pipe). Re-run with --yes to authorize.',
    )
  }

  const answer = await (opts.promptReader ? opts.promptReader() : promptStdin('Proceed? [y/N] '))
  return /^y(es)?$/i.test(answer.trim())
}

function promptStdin(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    rl.question(question, ans => {
      rl.close()
      resolve(ans)
    })
  })
}
