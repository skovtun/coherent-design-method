import chalk from 'chalk'
import { restoreBackup, listBackups } from '../utils/backup.js'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'

export async function undoCommand(options: { list?: boolean }) {
  try {
    const project = findConfig()
    if (!project) exitNotCoherent()
    const projectRoot = project.root

    const backups = listBackups(projectRoot)

    if (options.list) {
      if (backups.length === 0) {
        console.log(chalk.yellow('No backups found.'))
        return
      }
      console.log(chalk.bold('\n📦 Available backups:\n'))
      for (const b of backups) {
        const date = new Date(b.timestamp)
        const timeStr = date.toLocaleString()
        console.log(chalk.white(`  ${b.name}`))
        console.log(chalk.dim(`    ${timeStr} — ${b.files} file(s)`))
        console.log()
      }
      return
    }

    if (backups.length === 0) {
      console.log(chalk.yellow('No backups found. Nothing to undo.'))
      return
    }

    const latest = backups[0]
    const ok = restoreBackup(projectRoot, latest.name)
    if (!ok) {
      console.log(chalk.red('Failed to restore backup.'))
      return
    }

    console.log(chalk.green('\n✅ Restored to previous state:\n'))
    console.log(chalk.dim(`  Snapshot: ${new Date(latest.timestamp).toLocaleString()}`))
    console.log(chalk.dim(`  Files:    ${latest.files} restored`))
    console.log(chalk.cyan('\n  Run: coherent preview\n'))
  } catch (error) {
    console.error(chalk.red('❌ Undo failed:'), error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}
