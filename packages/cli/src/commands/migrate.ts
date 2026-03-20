/**
 * Migrate Command
 *
 * Upgrades a Coherent project from generated component templates to real
 * shadcn/ui components via the ComponentProvider.
 */

import chalk from 'chalk'
import ora from 'ora'
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ShadcnProvider } from '../providers/shadcn-provider.js'
import { getProjectRoot } from '../utils/find-config.js'

export interface MigrateOptions {
  dryRun?: boolean
  yes?: boolean
  rollback?: boolean
  projectRoot?: string
}

function backupDir(projectRoot: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return join(projectRoot, '.coherent', 'backups', `pre-migrate-${ts}`)
}

function guardPath(projectRoot: string): string {
  return join(projectRoot, '.coherent', 'migration-in-progress')
}

function createBackup(projectRoot: string): string {
  const uiDir = join(projectRoot, 'components', 'ui')
  const dest = backupDir(projectRoot)
  mkdirSync(dest, { recursive: true })
  if (existsSync(uiDir)) {
    cpSync(uiDir, join(dest, 'components-ui'), { recursive: true })
  }
  const configPath = join(projectRoot, 'design-system.config.ts')
  if (existsSync(configPath)) {
    cpSync(configPath, join(dest, 'design-system.config.ts'))
  }
  return dest
}

function setGuard(projectRoot: string, backupPath: string): void {
  const guard = guardPath(projectRoot)
  mkdirSync(join(projectRoot, '.coherent'), { recursive: true })
  writeFileSync(guard, JSON.stringify({ backup: backupPath, startedAt: new Date().toISOString() }))
}

function clearGuard(projectRoot: string): void {
  const guard = guardPath(projectRoot)
  if (existsSync(guard)) rmSync(guard)
}

function rollback(projectRoot: string): boolean {
  const guard = guardPath(projectRoot)
  if (!existsSync(guard)) return false
  try {
    const data = JSON.parse(readFileSync(guard, 'utf-8'))
    const backup = data.backup as string
    if (!existsSync(backup)) return false

    const uiBackup = join(backup, 'components-ui')
    const uiDir = join(projectRoot, 'components', 'ui')
    if (existsSync(uiBackup)) {
      if (existsSync(uiDir)) rmSync(uiDir, { recursive: true })
      cpSync(uiBackup, uiDir, { recursive: true })
    }

    const configBackup = join(backup, 'design-system.config.ts')
    const configDest = join(projectRoot, 'design-system.config.ts')
    if (existsSync(configBackup)) {
      cpSync(configBackup, configDest)
    }

    clearGuard(projectRoot)
    return true
  } catch {
    return false
  }
}

export async function migrateAction(options: MigrateOptions): Promise<void> {
  let projectRoot = options.projectRoot
  if (!projectRoot) {
    try { projectRoot = getProjectRoot() } catch { projectRoot = process.cwd() }
  }

  if (options.rollback) {
    const spinner = ora('Rolling back migration...').start()
    if (rollback(projectRoot)) {
      spinner.succeed('Migration rolled back successfully')
    } else {
      spinner.fail('No migration to roll back (no guard file found)')
    }
    return
  }

  const guard = guardPath(projectRoot)
  if (existsSync(guard)) {
    console.log(chalk.yellow('A migration is already in progress.'))
    console.log(chalk.dim('Run `coherent migrate --rollback` to undo, or delete .coherent/migration-in-progress'))
    return
  }

  const uiDir = join(projectRoot, 'components', 'ui')
  if (!existsSync(uiDir)) {
    console.log(chalk.yellow('No components/ui directory found. Nothing to migrate.'))
    return
  }

  const provider = new ShadcnProvider()
  const managedIds = new Set(provider.listNames())
  const files = readdirSync(uiDir).filter(f => f.endsWith('.tsx'))
  const migratable = files
    .map(f => f.replace('.tsx', ''))
    .filter(id => managedIds.has(id))

  if (migratable.length === 0) {
    console.log(chalk.green('All components are already up to date.'))
    return
  }

  console.log(chalk.cyan(`\nFound ${migratable.length} component(s) to migrate:`))
  for (const id of migratable) {
    console.log(chalk.dim(`  - ${id}`))
  }

  if (options.dryRun) {
    console.log(chalk.yellow('\n[dry-run] No changes applied.'))
    return
  }

  const spinner = ora('Migrating components...').start()

  const backup = createBackup(projectRoot)
  setGuard(projectRoot, backup)

  try {
    await provider.init(projectRoot)

    let migrated = 0
    for (const id of migratable) {
      try {
        const filePath = join(uiDir, `${id}.tsx`)
        if (existsSync(filePath)) rmSync(filePath)
        await provider.install(id, projectRoot)
        migrated++
      } catch (err) {
        console.warn(chalk.yellow(`  ⚠ Failed to migrate ${id}: ${err instanceof Error ? err.message : err}`))
      }
    }

    clearGuard(projectRoot)
    spinner.succeed(`Migrated ${migrated}/${migratable.length} components to real shadcn/ui`)
    console.log(chalk.dim(`  Backup saved to: ${backup}`))
  } catch (err) {
    spinner.fail('Migration failed — rolling back')
    rollback(projectRoot)
    throw err
  }
}
