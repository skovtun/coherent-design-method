import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  SESSION_SCHEMA_VERSION,
  SessionSchemaMismatchError,
  assertSafeArtifactName,
  type SessionMeta,
  type SessionMetaPatch,
  type SessionStore,
} from './session-store.js'

/**
 * Writes sessions under `<projectRoot>/.coherent/session/<uuid>/`. Session
 * metadata lives in `session.json`; every other file in the dir is an artifact.
 *
 * Concurrency: this store does NOT hold a lock. Callers (`coherent session
 * start/end`) must hold the project-wide lock from `acquireProjectLock()` so
 * only one session writes at a time per project.
 *
 * Durability: metadata writes go through an atomic `write temp → rename` so a
 * crash mid-write never leaves a corrupt `session.json` visible.
 */
export class FileBackedSessionStore implements SessionStore {
  private readonly root: string

  constructor(projectRoot: string) {
    this.root = join(projectRoot, '.coherent', 'session')
  }

  private sessionDir(uuid: string): string {
    return join(this.root, uuid)
  }

  private metaPath(uuid: string): string {
    return join(this.sessionDir(uuid), 'session.json')
  }

  async create(): Promise<SessionMeta> {
    const now = new Date().toISOString()
    const rec: SessionMeta = {
      uuid: randomUUID(),
      phase: 'plan',
      status: 'pending-prep',
      schemaVersion: SESSION_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    }
    await mkdir(this.sessionDir(rec.uuid), { recursive: true })
    await this.writeMeta(rec)
    return { ...rec }
  }

  async read(uuid: string): Promise<SessionMeta | null> {
    const path = this.metaPath(uuid)
    if (!existsSync(path)) return null
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as SessionMeta
    return parsed
  }

  async update(uuid: string, patch: SessionMetaPatch): Promise<SessionMeta> {
    const current = await this.read(uuid)
    if (!current) throw new Error(`Session ${uuid} not found`)
    if (current.schemaVersion !== SESSION_SCHEMA_VERSION) {
      throw new SessionSchemaMismatchError(uuid, current.schemaVersion, SESSION_SCHEMA_VERSION)
    }
    const next: SessionMeta = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await this.writeMeta(next)
    return next
  }

  async writeArtifact(uuid: string, filename: string, content: string): Promise<void> {
    assertSafeArtifactName(filename)
    const dir = this.sessionDir(uuid)
    if (!existsSync(dir)) throw new Error(`Session ${uuid} not found`)
    await atomicWrite(join(dir, filename), content)
    // Refresh updatedAt so list() ordering reflects activity.
    const current = await this.read(uuid)
    if (current) {
      await this.writeMeta({ ...current, updatedAt: new Date().toISOString() })
    }
  }

  async readArtifact(uuid: string, filename: string): Promise<string | null> {
    assertSafeArtifactName(filename)
    const path = join(this.sessionDir(uuid), filename)
    if (!existsSync(path)) return null
    return readFile(path, 'utf-8')
  }

  async hasArtifact(uuid: string, filename: string): Promise<boolean> {
    assertSafeArtifactName(filename)
    return existsSync(join(this.sessionDir(uuid), filename))
  }

  async listArtifacts(uuid: string): Promise<string[]> {
    const dir = this.sessionDir(uuid)
    if (!existsSync(dir)) return []
    const entries = await readdir(dir)
    return entries.filter(n => n !== 'session.json').sort()
  }

  async delete(uuid: string): Promise<void> {
    const dir = this.sessionDir(uuid)
    if (!existsSync(dir)) return
    await rm(dir, { recursive: true, force: true })
  }

  async list(): Promise<SessionMeta[]> {
    if (!existsSync(this.root)) return []
    const entries = await readdir(this.root, { withFileTypes: true })
    const records: SessionMeta[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = await this.read(entry.name)
      if (meta) records.push(meta)
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private async writeMeta(meta: SessionMeta): Promise<void> {
    await mkdir(this.sessionDir(meta.uuid), { recursive: true })
    await atomicWrite(this.metaPath(meta.uuid), JSON.stringify(meta, null, 2))
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, content, 'utf-8')
  // fs/promises.rename is atomic on the same filesystem.
  const { rename } = await import('fs/promises')
  await rename(tmp, path)
}
