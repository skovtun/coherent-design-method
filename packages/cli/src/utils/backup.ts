import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, copyFileSync, statSync } from 'fs'
import { join, dirname } from 'path'

const BACKUP_DIR = '.coherent/backups'

function findFiles(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findFiles(full, suffix))
    } else if (entry.name.endsWith(suffix)) {
      results.push(full)
    }
  }
  return results
}
const MAX_BACKUPS = 10

interface BackupManifest {
  timestamp: string
  message: string
  files: string[]
}

function getBackupRoot(projectRoot: string): string {
  return join(projectRoot, BACKUP_DIR)
}

/**
 * Create a backup of all page files, layout, and config before modification.
 * Returns the backup id (timestamp-based directory name).
 */
export function createBackup(projectRoot: string, message: string): string {
  const backupRoot = getBackupRoot(projectRoot)
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(backupRoot, id)
  mkdirSync(backupDir, { recursive: true })

  const filesToBackup = [
    'design-system.config.ts',
    'app/layout.tsx',
    ...findFiles(join(projectRoot, 'app'), 'page.tsx').map(f => f.slice(projectRoot.length + 1)),
    ...findFiles(join(projectRoot, 'components', 'shared'), '.tsx').map(f => f.slice(projectRoot.length + 1)),
  ]

  const backedUp: string[] = []
  for (const relPath of filesToBackup) {
    const src = join(projectRoot, relPath)
    if (!existsSync(src)) continue
    const dest = join(backupDir, relPath)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    backedUp.push(relPath)
  }

  const manifest: BackupManifest = {
    timestamp: new Date().toISOString(),
    message,
    files: backedUp,
  }
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  pruneOldBackups(backupRoot)
  return id
}

/**
 * Restore the most recent backup (or a specific backup by id).
 * Returns the manifest of the restored backup, or null if none found.
 */
export function restoreBackup(projectRoot: string, backupId?: string): BackupManifest | null {
  const backupRoot = getBackupRoot(projectRoot)
  if (!existsSync(backupRoot)) return null

  const id = backupId || getLatestBackupId(backupRoot)
  if (!id) return null

  const backupDir = join(backupRoot, id)
  const manifestPath = join(backupDir, 'manifest.json')
  if (!existsSync(manifestPath)) return null

  const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  for (const relPath of manifest.files) {
    const src = join(backupDir, relPath)
    const dest = join(projectRoot, relPath)
    if (!existsSync(src)) continue
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  return manifest
}

/**
 * List available backups (newest first).
 */
export function listBackups(projectRoot: string): Array<{ id: string; manifest: BackupManifest }> {
  const backupRoot = getBackupRoot(projectRoot)
  if (!existsSync(backupRoot)) return []

  const dirs = readdirSync(backupRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse()

  const results: Array<{ id: string; manifest: BackupManifest }> = []
  for (const id of dirs) {
    const manifestPath = join(backupRoot, id, 'manifest.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      results.push({ id, manifest })
    } catch {
      // skip corrupted
    }
  }
  return results
}

function getLatestBackupId(backupRoot: string): string | undefined {
  const dirs = readdirSync(backupRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
  return dirs[dirs.length - 1]
}

function pruneOldBackups(backupRoot: string): void {
  const dirs = readdirSync(backupRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  while (dirs.length > MAX_BACKUPS) {
    const oldest = dirs.shift()!
    rmSync(join(backupRoot, oldest), { recursive: true, force: true })
  }
}
