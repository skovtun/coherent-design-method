/**
 * Success Message for `coherent init`.
 *
 * Modern CLI aesthetic (Vite/Bun/Astro-style): compact, scannable, one hero
 * emoji, muted gray for context, bright only for signal. No marketing blocks —
 * that content lives in README/docs. The goal is to get the user to their next
 * command in 5 seconds.
 *
 * Branches on mode so users land on the CTA that fits their setup:
 *  - skill: /coherent-generate in Claude Code (no API key needed)
 *  - api:   coherent chat (uses an Anthropic/OpenAI key)
 *  - both:  show both
 */

import chalk from 'chalk'
import type { DetectedEditor } from './editor-detection.js'

export type SuccessMode = 'skill' | 'api' | 'both'

export interface SuccessMessageOptions {
  mode?: SuccessMode
  detectedEditors?: DetectedEditor[]
  v2TargetEditors?: DetectedEditor[]
  /** ms since `coherent init` began — rendered as "Ready in Xs". */
  elapsedMs?: number
  /** User-supplied project name (rendered in Next command when we generated a subdir). */
  projectName?: string
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

export function showSuccessMessage(projectPath: string = '.', options: SuccessMessageOptions = {}): void {
  const mode: SuccessMode = options.mode ?? 'api'
  const tick = chalk.green('✓')

  console.log('')
  console.log(`  ${tick} ${chalk.dim('Next.js scaffolded')}`)
  console.log(`  ${tick} ${chalk.dim('Design system configured')}`)
  console.log(`  ${tick} ${chalk.dim('Shared components  ')}${chalk.gray('— Header, Footer, DSButton')}`)
  console.log(`  ${tick} ${chalk.dim('Design System viewer  ')}${chalk.gray('— /design-system')}`)
  console.log(`  ${tick} ${chalk.dim('AI context configured')}`)

  if (options.v2TargetEditors && options.v2TargetEditors.length > 0) {
    const names = options.v2TargetEditors.map(e => `.${e === 'claude-code' ? 'claude' : e}`).join(', ')
    console.log('')
    console.log(chalk.dim(`  detected ${names} — native skill adapter lands in v0.10+`))
  }

  const elapsed = options.elapsedMs ? ` ${chalk.dim('in')} ${chalk.white(formatElapsed(options.elapsedMs))}` : ''
  console.log('')
  console.log(`  ${chalk.green('Ready')}${elapsed}`)
  console.log('')
  console.log(`  ${chalk.magenta('✨ Coherent Design Method — Project Initialized')}`)

  // Copy matches the getcoherent.design landing page: Describe first, then
  // Preview. `cd <project>` is only prepended where a shell command actually
  // needs it — slash-commands inside Claude Code don't, and hint lines
  // definitely don't.
  const cdPrefix = options.projectName ? `cd ${options.projectName} && ` : ''
  const example = '"a fitness studio app with classes, pricing, and contact"'
  console.log('')
  console.log(chalk.bold('  Next:'))
  console.log('')

  if (mode === 'skill') {
    console.log(chalk.dim('    1. Describe your app') + chalk.dim(' — in Claude Code:'))
    console.log(chalk.cyan(`       /coherent-generate ${example}`))
    console.log('')
    console.log(chalk.dim('    2. Preview:'))
    console.log(chalk.cyan(`       ${cdPrefix}coherent preview`))
  } else if (mode === 'api') {
    console.log(chalk.dim('    1. Describe your app:'))
    console.log(chalk.cyan(`       ${cdPrefix}coherent chat ${example}`))
    console.log('')
    console.log(chalk.dim('    2. Preview:'))
    console.log(chalk.cyan(`       ${cdPrefix}coherent preview`))
  } else {
    console.log(chalk.dim('    1. Describe your app — pick one:'))
    console.log(chalk.dim('       Claude Code:') + chalk.cyan(`  /coherent-generate ${example}`))
    console.log(chalk.dim('       CLI:') + chalk.cyan(`          ${cdPrefix}coherent chat ${example}`))
    console.log('')
    console.log(chalk.dim('    2. Preview:'))
    console.log(chalk.cyan(`       ${cdPrefix}coherent preview`))
  }

  console.log('')
  console.log(chalk.dim('  Docs: ') + chalk.dim.underline('https://github.com/skovtun/coherent-design-method'))
  console.log('')
}
