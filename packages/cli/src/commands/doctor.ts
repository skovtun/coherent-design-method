/**
 * Doctor Command (deprecated — use `coherent fix`)
 *
 * Kept for backward compatibility. Delegates to fixCommand.
 */

import chalk from 'chalk'
import { fixCommand } from './fix.js'

export async function doctorCommand() {
  console.log(chalk.dim('  ℹ️  `coherent doctor` is deprecated — use `coherent fix` instead\n'))
  await fixCommand()
}
