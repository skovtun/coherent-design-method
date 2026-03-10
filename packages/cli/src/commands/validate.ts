/**
 * Validate Command (deprecated — use `coherent check`)
 *
 * Kept for backward compatibility. Delegates to checkCommand.
 */

import chalk from 'chalk'
import { checkCommand } from './check.js'

export async function validateCommand() {
  console.log(chalk.dim('  ℹ️  `coherent validate` is deprecated — use `coherent check` instead\n'))
  await checkCommand({ pages: true })
}
