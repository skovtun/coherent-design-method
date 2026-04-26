/**
 * File System Operations
 *
 * Utilities for safe file operations with atomic writes and project-level locking.
 */

import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, rename, unlink, copyFile, access } from 'fs/promises'
import { dirname, join } from 'path'
import { existsSync, readdirSync, statSync, writeFileSync, unlinkSync, readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { COHERENT_ERROR_CODES, CoherentError } from '../errors/index.js'

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
const SESSION_DIR_REL = '.coherent/session'

/**
 * v0.11.5 — when the persistent lock is held, surface the actual UUID
 * of the active session so the recovery command in the error message is
 * copy-pasteable. The lock file itself doesn't carry the UUID; we look
 * for live session directories under `.coherent/session/<uuid>/` and
 * pick the most recently modified one.
 *
 * Returns the UUID string when exactly one or more session dirs exist
 * (most-recent wins on ties — matches how a user would identify "the
 * session blocking me right now"), or null when no session dirs exist
 * (orphan lock without a session — user should just delete the lock).
 *
 * Best-effort: any FS error returns null, so this never throws into the
 * lock-acquire error path.
 */
function findActiveSessionUuid(projectRoot: string): string | null {
  try {
    const sessionRoot = join(projectRoot, SESSION_DIR_REL)
    if (!existsSync(sessionRoot)) return null
    const entries = readdirSync(sessionRoot)
    // UUID dirs only. Skip files, dotfiles, malformed entries.
    const candidates = entries.filter(name => {
      if (name.startsWith('.')) return false
      try {
        return statSync(join(sessionRoot, name)).isDirectory()
      } catch {
        return false
      }
    })
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]
    // Multiple — return most recent by mtime so the error points at
    // the one most likely blocking the user right now.
    let best = candidates[0]
    let bestMtime = 0
    for (const name of candidates) {
      try {
        const m = statSync(join(sessionRoot, name)).mtimeMs
        if (m > bestMtime) {
          best = name
          bestMtime = m
        }
      } catch {
        /* ignore unreadable */
      }
    }
    return best
  } catch {
    return null
  }
}
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
          // v0.11.5 — surface the actual active UUID + ready-to-paste
          // recovery command. Pre-v0.11.5 the fix said "coherent session
          // end <uuid>" with the literal `<uuid>` placeholder; users had
          // to know which UUID to use, and the dogfood log on v0.11.4
          // showed the agent had to manually `ls .coherent/session/` to
          // figure it out. The lock file itself doesn't store the UUID —
          // we get it by listing the active session dirs.
          const activeUuid = findActiveSessionUuid(projectRoot)
          const recoveryCmd = activeUuid
            ? `coherent session end ${activeUuid} --keep`
            : `coherent session end <uuid> --keep   (find <uuid> via: ls .coherent/session)`
          throw new CoherentError({
            code: COHERENT_ERROR_CODES.E002_SESSION_LOCKED,
            message: `Another coherent session is active (lock age: ${Math.round(age / 1000)}s)`,
            cause:
              'Coherent holds a project-wide lock between session start and session end so two runs cannot corrupt shared state.',
            fix: `Run: ${recoveryCmd}\n  (or delete ${LOCK_FILENAME} if you're sure the session is abandoned and you don't need its artifacts.)`,
          })
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
