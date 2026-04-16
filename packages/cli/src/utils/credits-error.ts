/**
 * Credits / rate-limit error detection.
 *
 * AI providers fail in ways that look like generic errors but actually mean
 * "user needs to add money / wait". Surfacing these clearly prevents silent
 * half-generation where pages are created but fixes are skipped.
 */

import chalk from 'chalk'

const CREDIT_PATTERNS = [
  /credit balance is too low/i,
  /insufficient[_\s]?credits/i,
  /insufficient[_\s]?funds/i,
  /quota.*exceeded/i,
  /billing[_\s]?(?:required|error)/i,
  /payment[_\s]?required/i,
]

const RATE_LIMIT_PATTERNS = [/rate[_\s]?limit/i, /too many requests/i, /429/, /overloaded/i]

export type AIErrorKind = 'credits' | 'rate-limit' | 'other'

export function classifyAIError(err: unknown): AIErrorKind {
  const msg = err instanceof Error ? err.message : String(err || '')
  if (!msg) return 'other'
  if (CREDIT_PATTERNS.some(r => r.test(msg))) return 'credits'
  if (RATE_LIMIT_PATTERNS.some(r => r.test(msg))) return 'rate-limit'
  return 'other'
}

export function printCreditsWarning(provider: string, context: string): void {
  console.log('')
  console.log(chalk.red('━'.repeat(60)))
  console.log(chalk.red.bold('❌ AI credit balance exhausted'))
  console.log(chalk.red('━'.repeat(60)))
  console.log(chalk.yellow(`   Provider: ${provider}`))
  console.log(chalk.yellow(`   Step:     ${context}`))
  console.log('')
  console.log(chalk.white('   Generation produced pages, but post-generation fixes'))
  console.log(chalk.white('   (TypeScript auto-fix, quality repair) were skipped.'))
  console.log('')
  console.log(chalk.cyan('   👉 Top up credits, then run:'))
  console.log(chalk.white('      coherent fix'))
  console.log(chalk.red('━'.repeat(60)))
  console.log('')
}

export function printRateLimitWarning(provider: string, context: string): void {
  console.log('')
  console.log(chalk.yellow('⚠ Rate limited by ' + provider + ' during: ' + context))
  console.log(chalk.dim('  Wait a minute and run `coherent fix` to retry.'))
  console.log('')
}

/**
 * Called after every AI call that might fail. If the error is a credits or
 * rate-limit error, prints a prominent warning. Otherwise returns false and
 * the caller should handle normally.
 * Returns true iff the error was classified as a known provider issue.
 */
export function surfaceAIError(err: unknown, context: string, provider = 'Anthropic'): boolean {
  const kind = classifyAIError(err)
  if (kind === 'credits') {
    printCreditsWarning(provider, context)
    return true
  }
  if (kind === 'rate-limit') {
    printRateLimitWarning(provider, context)
    return true
  }
  return false
}
