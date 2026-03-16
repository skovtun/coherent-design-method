/**
 * Auto-backup utility for Coherent projects.
 *
 * Saves snapshots of critical project files after each successful `coherent chat` run.
 * Keeps a rolling window of recent backups to enable recovery from data loss.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'
import chalk from 'chalk'

const DEBUG = process.env.COHERENT_DEBUG === '1'
const BACKUP_DIR = '.coherent/backups'
const MAX_BACKUPS = 5
const CRITICAL_FILES = [
  'design-system.config.ts',
  'package.json',
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.mjs',
]
const CRITICAL_DIRS = ['app', 'components']

/**
 * Create a backup of critical project files.
 */
export function createBackup(projectRoot: string): string | null {
  try {
    const backupBase = join(projectRoot, BACKUP_DIR)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = join(backupBase, timestamp)
    mkdirSync(backupPath, { recursive: true })

    let fileCount = 0

    for (const file of CRITICAL_FILES) {
      const src = join(projectRoot, file)
      if (existsSync(src)) {
        const dest = join(backupPath, file)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, readFileSync(src))
        fileCount++
      }
    }

    for (const dir of CRITICAL_DIRS) {
      const srcDir = join(projectRoot, dir)
      if (!existsSync(srcDir)) continue
      backupDirectory(srcDir, projectRoot, backupPath)
      fileCount += countFiles(srcDir)
    }

    // Write metadata
    writeFileSync(
      join(backupPath, '.backup-meta.json'),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          files: fileCount,
        },
        null,
        2,
      ),
    )

    pruneOldBackups(backupBase)

    return backupPath
  } catch (e) {
    if (DEBUG) console.error('Failed to create backup:', e)
    return null
  }
}

function backupDirectory(srcDir: string, projectRoot: string, backupPath: string): void {
  const entries = readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const fullPath = join(srcDir, entry.name)
    const relPath = relative(projectRoot, fullPath)
    const destPath = join(backupPath, relPath)

    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      backupDirectory(fullPath, projectRoot, backupPath)
    } else if (entry.isFile()) {
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, readFileSync(fullPath))
    }
  }
}

function countFiles(dir: string): number {
  let count = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        count += countFiles(fullPath)
      } else if (entry.isFile()) {
        count++
      }
    }
  } catch (e) {
    if (DEBUG) console.error('Failed to count files in', dir, e)
  }
  return count
}

function pruneOldBackups(backupBase: string): void {
  try {
    const entries = readdirSync(backupBase)
      .filter(e => e !== '.gitkeep' && !e.startsWith('.'))
      .map(name => ({ name, time: statSync(join(backupBase, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time)

    for (const old of entries.slice(MAX_BACKUPS)) {
      rmSync(join(backupBase, old.name), { recursive: true, force: true })
    }
  } catch (e) {
    if (DEBUG) console.error('Failed to prune old backups:', e)
  }
}

/**
 * List available backups for the project.
 */
export function listBackups(projectRoot: string): Array<{ name: string; timestamp: string; files: number }> {
  const backupBase = join(projectRoot, BACKUP_DIR)
  if (!existsSync(backupBase)) return []

  try {
    return readdirSync(backupBase)
      .filter(e => !e.startsWith('.'))
      .map(name => {
        const metaPath = join(backupBase, name, '.backup-meta.json')
        let meta = { timestamp: name, files: 0 }
        if (existsSync(metaPath)) {
          try {
            meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
          } catch (e) {
            if (DEBUG) console.error('Bad backup meta:', metaPath, e)
          }
        }
        return { name, timestamp: meta.timestamp, files: meta.files }
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  } catch (e) {
    if (DEBUG) console.error('Failed to list backups:', e)
    return []
  }
}

/**
 * Restore a backup to the project root.
 */
export function restoreBackup(projectRoot: string, backupName: string): boolean {
  const backupPath = join(projectRoot, BACKUP_DIR, backupName)
  if (!existsSync(backupPath)) return false

  try {
    restoreDirectory(backupPath, backupPath, projectRoot)
    return true
  } catch (e) {
    if (DEBUG) console.error('Failed to restore backup:', backupName, e)
    return false
  }
}

function restoreDirectory(currentDir: string, backupRoot: string, projectRoot: string): void {
  const entries = readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.backup-meta.json') continue
    const fullPath = join(currentDir, entry.name)
    const relPath = relative(backupRoot, fullPath)
    const destPath = join(projectRoot, relPath)

    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      restoreDirectory(fullPath, backupRoot, projectRoot)
    } else if (entry.isFile()) {
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, readFileSync(fullPath))
    }
  }
}

/**
 * Print backup info after creation.
 */
export function logBackupCreated(backupPath: string | null): void {
  if (backupPath) {
    const name = backupPath.split('/').pop()
    console.log(chalk.dim(`  💾 Backup saved: .coherent/backups/${name}`))
  }
}
