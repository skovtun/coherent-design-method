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
  console.log(`  ${tick} ${chalk.dim('AI context  ')}${chalk.gray('— .cursorrules, CLAUDE.md, .claude/')}`)

  if (options.v2TargetEditors && options.v2TargetEditors.length > 0) {
    const names = options.v2TargetEditors.map(e => `.${e === 'claude-code' ? 'claude' : e}`).join(', ')
    console.log('')
    console.log(chalk.dim(`  detected ${names} — native skill adapter lands in v0.10+`))
  }

  const elapsed = options.elapsedMs ? ` ${chalk.dim('in')} ${chalk.white(formatElapsed(options.elapsedMs))}` : ''
  console.log('')
  console.log(`  ${chalk.green('Ready')}${elapsed}`)

  const cdLine = options.projectName ? `cd ${options.projectName} && ` : ''
  console.log('')
  console.log(chalk.bold('  Next:'))

  if (mode === 'skill') {
    console.log(chalk.cyan(`    ${cdLine}coherent preview`))
    console.log(chalk.dim(`    ${cdLine}then: `) + chalk.cyan('/coherent-generate "describe your app"'))
    console.log(chalk.dim('    (in Claude Code — uses your subscription, no API key)'))
  } else if (mode === 'api') {
    console.log(chalk.cyan(`    ${cdLine}coherent preview`))
    console.log(chalk.dim(`    ${cdLine}then: `) + chalk.cyan('coherent chat "add a dashboard"'))
  } else {
    console.log(chalk.cyan(`    ${cdLine}coherent preview`))
    console.log(chalk.dim('    skill mode: ') + chalk.cyan('/coherent-generate "describe your app"'))
    console.log(chalk.dim('    chat mode:  ') + chalk.cyan('coherent chat "add a dashboard"'))
  }

  console.log('')
  console.log(chalk.dim('  Docs: ') + chalk.dim.underline('https://github.com/skovtun/coherent-design-method'))
  console.log('')
}
