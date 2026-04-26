import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { acquirePersistentLock, releasePersistentLock } from './files.js'
import { COHERENT_ERROR_CODES, CoherentError, isCoherentError } from '../errors/index.js'

const LOCK_FILENAME = '.coherent.lock'

describe('acquirePersistentLock', () => {
  let root: string
  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true })
  })

  it('writes a persistent-kind lockfile on fresh acquire', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    acquirePersistentLock(root)
    const raw = readFileSync(join(root, LOCK_FILENAME), 'utf-8')
    const data = JSON.parse(raw)
    expect(data.kind).toBe('persistent')
    expect(typeof data.ts).toBe('number')
    expect(data.pid).toBeUndefined()
  })

  it('rejects a second acquire while the first is still fresh', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    acquirePersistentLock(root)
    expect(() => acquirePersistentLock(root)).toThrow(/Another coherent session is active/)
  })

  it('throws CoherentError with code E002 on collision (T17b)', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    acquirePersistentLock(root)

    let caught: unknown = null
    try {
      acquirePersistentLock(root)
    } catch (e) {
      caught = e
    }
    expect(isCoherentError(caught)).toBe(true)
    const err = caught as CoherentError
    expect(err.code).toBe(COHERENT_ERROR_CODES.E002_SESSION_LOCKED)
    expect(err.message).toMatch(/Another coherent session is active/)
    expect(err.fix).toMatch(/coherent session end/)
    expect(err.docsUrl).toBe('https://getcoherent.design/errors/E002')
  })

  it('v0.11.5 — collision fix message includes the active session UUID when one session dir exists', () => {
    // The skill rail writes one session dir under .coherent/session/<uuid>/
    // per active session. The lock file itself doesn't carry the UUID, so
    // pre-v0.11.5 the recovery hint was literal `<uuid>` and the user (or
    // agent) had to figure out which session was blocking. Now we look up
    // the dir and bake the actual UUID into the fix message.
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-uuid-'))
    const fakeUuid = '4f2adb4a-bec4-4760-a5b5-e67e1bc447b7'
    mkdirSync(join(root, '.coherent', 'session', fakeUuid), { recursive: true })
    acquirePersistentLock(root)
    let caught: CoherentError | null = null
    try {
      acquirePersistentLock(root)
    } catch (e) {
      caught = e as CoherentError
    }
    expect(caught).not.toBeNull()
    expect(caught!.fix).toContain(`coherent session end ${fakeUuid} --keep`)
  })

  it('v0.11.5 — fix message picks most-recent session UUID when multiple dirs exist', async () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-multi-'))
    const oldUuid = 'old-aaaa-bbbb-cccc-dddddddddddd'
    const newUuid = 'new-eeee-ffff-aaaa-bbbbbbbbbbbb'
    mkdirSync(join(root, '.coherent', 'session', oldUuid), { recursive: true })
    // Sleep 10ms so the second dir has a measurably newer mtime.
    await new Promise(r => setTimeout(r, 10))
    mkdirSync(join(root, '.coherent', 'session', newUuid), { recursive: true })
    acquirePersistentLock(root)
    let caught: CoherentError | null = null
    try {
      acquirePersistentLock(root)
    } catch (e) {
      caught = e as CoherentError
    }
    expect(caught).not.toBeNull()
    expect(caught!.fix).toContain(newUuid)
    expect(caught!.fix).not.toContain(oldUuid)
  })

  it('v0.11.5 — falls back to <uuid> placeholder when no session dirs exist (orphan lock)', () => {
    // Edge case: lock file exists but no session dir. User probably
    // killed the session externally or .coherent/session/ was deleted.
    // Don't lie about a UUID we don't have — fall back to the original
    // placeholder + an `ls` hint so the user can confirm.
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-orphan-'))
    acquirePersistentLock(root)
    let caught: CoherentError | null = null
    try {
      acquirePersistentLock(root)
    } catch (e) {
      caught = e as CoherentError
    }
    expect(caught).not.toBeNull()
    expect(caught!.fix).toContain('<uuid>')
    expect(caught!.fix).toContain('ls .coherent/session')
  })

  it('regression (codex P1 #3): second acquire does NOT reclaim lock when PID is absent', () => {
    // The old PID-based code deleted the persistent lock as soon as the
    // recorded PID was gone (ESRCH) — which in skill-mode is ALWAYS, because
    // `coherent session start` exits seconds after writing the lock. This
    // regression fixture simulates that exact scenario by writing a lock
    // with an already-dead PID 1 and confirming the next acquire still
    // throws.
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    const lockPath = join(root, LOCK_FILENAME)
    writeFileSync(lockPath, JSON.stringify({ kind: 'persistent', ts: Date.now() }), 'utf-8')
    expect(() => acquirePersistentLock(root)).toThrow(/Another coherent session is active/)
    // Lock still on disk after the failed second acquire.
    expect(existsSync(lockPath)).toBe(true)
  })

  it('reclaims a stale persistent lock beyond the 60-minute window', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    const lockPath = join(root, LOCK_FILENAME)
    // Stamp a lock 61 min old — past PERSISTENT_LOCK_STALE_MS.
    writeFileSync(lockPath, JSON.stringify({ kind: 'persistent', ts: Date.now() - 61 * 60 * 1000 }), 'utf-8')
    acquirePersistentLock(root)
    const raw = readFileSync(lockPath, 'utf-8')
    const data = JSON.parse(raw)
    // Fresh ts — within the last second.
    expect(Date.now() - data.ts).toBeLessThan(1000)
  })

  it('honors a legacy chat-rail PID lock when it points at the current live process', () => {
    // Mixed-mode compat: chat rail writes `{ pid, ts }` and still relies on
    // PID-liveness. If we trample that, parallel `coherent chat` + `session
    // start` runs would silently interleave.
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    const lockPath = join(root, LOCK_FILENAME)
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8')
    expect(() => acquirePersistentLock(root)).toThrow(/Another coherent process/)
  })

  it('reclaims a legacy lock whose PID is gone (ESRCH)', () => {
    // Legacy behavior preserved for chat-rail compat. An in-process chat
    // crash with a dead PID should be reclaimable on next acquire.
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    const lockPath = join(root, LOCK_FILENAME)
    // PID 999999 — vanishingly unlikely to be a real running process on macOS/Linux.
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now() }), 'utf-8')
    acquirePersistentLock(root)
    const raw = readFileSync(lockPath, 'utf-8')
    const data = JSON.parse(raw)
    expect(data.kind).toBe('persistent')
  })

  it('reclaims a corrupt lockfile rather than wedging the project', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    const lockPath = join(root, LOCK_FILENAME)
    writeFileSync(lockPath, '{garbage not json', 'utf-8')
    acquirePersistentLock(root) // must succeed
    const data = JSON.parse(readFileSync(lockPath, 'utf-8'))
    expect(data.kind).toBe('persistent')
  })
})

describe('releasePersistentLock', () => {
  let root: string
  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true })
  })

  it('unlinks the lockfile', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    acquirePersistentLock(root)
    releasePersistentLock(root)
    expect(existsSync(join(root, LOCK_FILENAME))).toBe(false)
  })

  it('is idempotent when the lock is already gone', () => {
    root = mkdtempSync(join(tmpdir(), 'coherent-lock-'))
    expect(() => releasePersistentLock(root)).not.toThrow()
  })
})
