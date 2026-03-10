/**
 * Rules command: regenerate .cursorrules and CLAUDE.md from current manifest + config.
 */

import chalk from 'chalk'
import { regenerateCursorRules } from '../utils/cursor-rules.js'

export async function rulesCommand() {
  const result = await regenerateCursorRules()
  if (!result.written) {
    console.log(chalk.red('Not a Coherent project.'))
    console.log(chalk.dim('Run from a directory with design-system.config.ts, or run coherent init first.\n'))
    process.exit(1)
  }
  const parts: string[] = []
  if (result.sharedCount !== undefined) parts.push(`${result.sharedCount} shared components`)
  if (result.tokenKeys !== undefined) parts.push(`${result.tokenKeys} design token keys`)
  const summary = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  console.log(chalk.green(`✔ Updated .cursorrules and CLAUDE.md${summary}\n`))
}
