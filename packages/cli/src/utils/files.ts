/**
 * File System Operations
 *
 * Utilities for safe file operations with atomic writes and project-level locking.
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, rename, unlink, copyFile, access } from 'fs/promises'
import { dirname, join } from 'path'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { randomBytes } from 'crypto'

/**
 * Read file content
 */
export async function readFile(path: string): Promise<string> {
  try {
    return await fsReadFile(path, 'utf-8')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read file ${path}: ${error.message}`)
    }
    throw error
  }
}

/**
 * Write file content atomically (write to temp, then rename).
 * Ensures partial writes don't corrupt existing files on crash.
 */
export async function writeFile(path: string, content: string): Promise<void> {
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const tmpPath = `${path}.${randomBytes(4).toString('hex')}.tmp`
    await fsWriteFile(tmpPath, content, 'utf-8')
    await rename(tmpPath, path)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write file ${path}: ${error.message}`)
    }
    throw error
  }
}

/**
 * Check if file exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path)
}

/**
 * Check if file exists (async version for consistency)
 */
export async function fileExistsAsync(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// --- Project-level lock ---

const LOCK_FILENAME = '.coherent.lock'
const LOCK_STALE_MS = 5 * 60 * 1000
// Persistent locks outlive the CLI process that acquired them (skill-mode's
// `coherent session start` exits seconds after writing the lock, but the
// session can span many minutes or hours between `_phase` calls). 60 min is
// the generous-but-not-infinite window: long enough that a user reading a
// prep prompt, editing a response, and piping it back through ingest stays
// inside the window; short enough that a genuinely-abandoned session gets
// reclaimable. Future: `_phase` calls touch the lock to refresh ts.
const PERSISTENT_LOCK_STALE_MS = 60 * 60 * 1000

/**
 * Acquire a project-level lock. Prevents parallel `coherent chat` from corrupting config.
 * Returns a release function. Throws if lock is already held by another process.
 */
export async function acquireProjectLock(projectRoot: string): Promise<() => void> {
  const lockPath = join(projectRoot, LOCK_FILENAME)

  if (existsSync(lockPath)) {
    try {
      const raw = readFileSync(lockPath, 'utf-8')
      const data = JSON.parse(raw) as { pid: number; ts: number }
      const age = Date.now() - data.ts

      if (age < LOCK_STALE_MS) {
        try {
          process.kill(data.pid, 0)
          throw new Error(
            `Another coherent process (PID ${data.pid}) is running. Wait for it to finish or remove ${LOCK_FILENAME}.`,
          )
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e
        }
      }
      unlinkSync(lockPath)
    } catch (e) {
      if (e instanceof SyntaxError) unlinkSync(lockPath)
      else if (e instanceof Error && e.message.includes('Another coherent')) throw e
    }
  }

  const lockData = JSON.stringify({ pid: process.pid, ts: Date.now() })
  writeFileSync(lockPath, lockData, 'utf-8')

  const release = () => {
    try {
      unlinkSync(lockPath)
    } catch {
      /* lock already removed — expected during cleanup */
    }
  }
  process.on('exit', release)
  process.on('SIGINT', () => {
    release()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    release()
    process.exit(143)
  })

  return release
}

/**
 * Persistent variant for skill-mode (`coherent session start`/`end`): the lock must
 * survive the `start` process exit so a later `_phase` or `session end` process can
 * find the project still locked by the session owner. Uses the same `.coherent.lock`
 * filename as `acquireProjectLock` so they are mutually exclusive, but skips the
 * process.on('exit') auto-release.
 *
 * Staleness is timestamp-based only — no PID-liveness check. Codex review caught
 * that the old PID-liveness variant broke the persistent case: `coherent session
 * start` exits immediately after writing the lock, so every subsequent `session
 * start` saw ESRCH on the recorded PID, deleted the lock, and ran a parallel
 * session over the still-active one. The fix is to accept that for persistent
 * locks, "process no longer alive" is the EXPECTED state, not evidence of a
 * crash. Only elapsed wall-clock distinguishes "active session" from "abandoned
 * session" here.
 *
 * Lockfile shape: `{ kind: 'persistent', ts }`. The legacy PID variant written
 * by `acquireProjectLock` remains readable and is treated as the in-process
 * chat-rail's lock (mutually exclusive with the persistent rail).
 */
export function acquirePersistentLock(projectRoot: string): void {
  const lockPath = join(projectRoot, LOCK_FILENAME)

  if (existsSync(lockPath)) {
    try {
      const raw = readFileSync(lockPath, 'utf-8')
      const data = JSON.parse(raw) as { kind?: 'persistent'; pid?: number; ts: number }
      const age = Date.now() - data.ts

      if (data.kind === 'persistent') {
        // Persistent lock held by another session. Staleness = timestamp only.
        if (age < PERSISTENT_LOCK_STALE_MS) {
          throw new Error(
            `Another coherent session is active (lock age: ${Math.round(age / 1000)}s). ` +
              `Finish it with \`coherent session end <uuid>\` or remove ${LOCK_FILENAME} if the session is abandoned.`,
          )
        }
        // Stale persistent lock: reclaim.
        unlinkSync(lockPath)
      } else if (typeof data.pid === 'number') {
        // Legacy chat-rail lock. Use the original PID + timestamp semantics so
        // mixed-mode projects don't deadlock against each other.
        if (age < LOCK_STALE_MS) {
          try {
            process.kill(data.pid, 0)
            throw new Error(
              `Another coherent process (PID ${data.pid}) is running. Wait for it to finish or remove ${LOCK_FILENAME}.`,
            )
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e
          }
        }
        unlinkSync(lockPath)
      } else {
        // Unknown shape — treat as corrupt and reclaim rather than leaving the
        // project wedged forever.
        unlinkSync(lockPath)
      }
    } catch (e) {
      if (e instanceof SyntaxError) unlinkSync(lockPath)
      else if (
        e instanceof Error &&
        (e.message.includes('Another coherent process') || e.message.includes('Another coherent session'))
      ) {
        throw e
      }
    }
  }

  const lockData = JSON.stringify({ kind: 'persistent', ts: Date.now() })
  writeFileSync(lockPath, lockData, 'utf-8')
}

/**
 * Release the persistent lock. Idempotent: missing lockfile is not an error.
 */
export function releasePersistentLock(projectRoot: string): void {
  const lockPath = join(projectRoot, LOCK_FILENAME)
  try {
    unlinkSync(lockPath)
  } catch {
    /* already released */
  }
}

/**
 * Batch write: back up files, write all, and restore on failure.
 * Provides transactional semantics for multi-file operations.
 */
export async function batchWriteFiles(writes: Array<{ path: string; content: string }>): Promise<void> {
  const backups: Array<{ path: string; backupPath: string }> = []

  try {
    for (const { path, content } of writes) {
      if (existsSync(path)) {
        const backupPath = `${path}.${randomBytes(4).toString('hex')}.bak`
        await copyFile(path, backupPath)
        backups.push({ path, backupPath })
      }
      await writeFile(path, content)
    }
    for (const { backupPath } of backups) {
      try {
        await unlink(backupPath)
      } catch {
        /* cleanup best-effort */
      }
    }
  } catch (error) {
    for (const { path, backupPath } of backups) {
      try {
        await copyFile(backupPath, path)
      } catch {
        /* restore best-effort */
      }
      try {
        await unlink(backupPath)
      } catch {
        /* cleanup */
      }
    }
    throw error
  }
}
