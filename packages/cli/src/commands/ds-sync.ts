/**
 * `coherent ds sync`: the agent-mode design system from the CLI. Gives every
 * component an ID and writes /design-system as one governed edit, verifies it
 * (every page must render exactly as before) and rolls it back if it fails.
 */
import chalk from 'chalk'
import { resolve } from 'path'
import { dsSync, rollbackEdit, verifyEdit } from '../governance/session.js'
import { openTransaction } from '../governance/transaction.js'

export async function dsSyncCommand(opts: { dir?: string }): Promise<void> {
  const root = resolve(opts.dir ?? process.cwd())
  const log = (m: string) => console.log(chalk.dim(m))
  const openBefore = openTransaction(root)?.id
  try {
    const r = await dsSync(root, { log })
    if (!r.session) {
      console.log(chalk.green(`✓ Design system is current: every component has an ID, ${r.page} is up to date.`))
      return
    }
    for (const a of r.assigned) console.log(`  ${chalk.bold(a.id)}  ${a.name}  ${chalk.dim(a.file)}`)
    const v = await verifyEdit(root, { level: 'final', log })
    if (!v.ok) {
      rollbackEdit(root, { txId: r.session.txId })
      console.error(chalk.red(`✗ Verification failed; rolled back.\n${v.problems.join('\n')}`))
      process.exitCode = 1
      return
    }
    console.log(chalk.green(`✓ ${r.assigned.length} ID(s) assigned, ${r.page} written. Verdict: ${v.verdict}.`))
  } catch (e) {
    // Never leave a half-applied sync open: undo the edit this command started.
    process.exitCode = 1
    let note = ''
    try {
      const open = openTransaction(root)
      if (open && open.id !== openBefore) {
        rollbackEdit(root, { txId: open.id })
        note = '\nThe sync was rolled back.'
      }
    } catch (undo) {
      note = `\nRolling the sync back also failed: ${(undo as Error).message}. Undo it with: coherent edit --undo`
    }
    console.error(chalk.red(`✗ ${(e as Error).message}${note}`))
  }
}
