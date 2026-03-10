/**
 * Rules command: regenerate .cursorrules and CLAUDE.md from current manifest + config.
 */

import chalk from 'chalk'
import { regenerateCursorRules } from '../utils/cursor-rules.js'
import { exitNotCoherent } from '../utils/find-config.js'

export async function rulesCommand() {
  const result = await regenerateCursorRules()
  if (!result.written) {
    exitNotCoherent()
  }
  const parts: string[] = []
  if (result.sharedCount !== undefined) parts.push(`${result.sharedCount} shared components`)
  if (result.tokenKeys !== undefined) parts.push(`${result.tokenKeys} design token keys`)
  const summary = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  console.log(chalk.green(`✔ Updated .cursorrules and CLAUDE.md${summary}\n`))
}
