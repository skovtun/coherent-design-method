/**
 * Audit Command (deprecated — use `coherent check`)
 *
 * Kept for backward compatibility. Delegates to checkCommand.
 */

import chalk from 'chalk'
import { checkCommand } from './check.js'

export async function auditCommand(options: { json?: boolean }) {
  console.log(chalk.dim('  ℹ️  `coherent audit` is deprecated — use `coherent check` instead\n'))
  await checkCommand({ shared: true, json: options.json })
}
