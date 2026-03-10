import chalk from 'chalk'
import { restoreBackup, listBackups } from '../utils/backup.js'

export async function undoCommand(options: { list?: boolean }) {
  const projectRoot = process.cwd()

  if (options.list) {
    const backups = listBackups(projectRoot)
    if (backups.length === 0) {
      console.log(chalk.yellow('No backups found.'))
      return
    }
    console.log(chalk.bold('\n📦 Available backups:\n'))
    for (const { id, manifest } of backups) {
      const date = new Date(manifest.timestamp)
      const timeStr = date.toLocaleString()
      console.log(chalk.white(`  ${id}`))
      console.log(chalk.dim(`    ${timeStr} — ${manifest.message.slice(0, 80)}`))
      console.log(chalk.dim(`    ${manifest.files.length} file(s)`))
      console.log()
    }
    return
  }

  const manifest = restoreBackup(projectRoot)
  if (!manifest) {
    console.log(chalk.yellow('No backups found. Nothing to undo.'))
    return
  }

  console.log(chalk.green('\n✅ Restored to previous state:\n'))
  console.log(chalk.dim(`  Snapshot: ${new Date(manifest.timestamp).toLocaleString()}`))
  console.log(chalk.dim(`  Message:  ${manifest.message.slice(0, 80)}`))
  console.log(chalk.dim(`  Files:    ${manifest.files.length} restored`))
  manifest.files.forEach(f => console.log(chalk.dim(`    • ${f}`)))
  console.log(chalk.cyan('\n  Run: coherent preview'))
  console.log()
}
