/**
 * Repair Command (deprecated — use `coherent fix`)
 *
 * Kept for backward compatibility. Delegates to fixCommand.
 */

import chalk from 'chalk'
import { fixCommand } from './fix.js'

export async function repairCommand() {
  console.log(chalk.dim('  ℹ️  `coherent repair` is deprecated — use `coherent fix` instead\n'))
  await fixCommand()
}
