/**
 * Rules command: regenerate .cursorrules, CLAUDE.md, and AGENTS.md from current manifest + config.
 */

import chalk from 'chalk'
import { regenerateAllHarnessFiles } from '../utils/harness-context.js'
import { exitNotCoherent } from '../utils/find-config.js'

export async function rulesCommand() {
  try {
    const result = await regenerateAllHarnessFiles()
    if (!result.written) {
      exitNotCoherent()
    }
    const parts: string[] = []
    if (result.sharedCount !== undefined) parts.push(`${result.sharedCount} shared components`)
    if (result.tokenKeys !== undefined) parts.push(`${result.tokenKeys} design token keys`)
    const summary = parts.length > 0 ? ` (${parts.join(', ')})` : ''
    console.log(chalk.green(`✔ Updated .cursorrules, CLAUDE.md, and AGENTS.md${summary}\n`))
  } catch (error) {
    console.error(chalk.red('❌ Command failed:'), error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}
