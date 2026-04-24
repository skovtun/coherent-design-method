import { randomUUID } from 'crypto'
import {
  SESSION_SCHEMA_VERSION,
  SessionSchemaMismatchError,
  assertSafeArtifactName,
  type SessionMeta,
  type SessionMetaPatch,
  type SessionStore,
} from './session-store.js'

/**
 * In-memory {@link SessionStore}. Used by tests + the parity harness.
 *
 * Not a drop-in FileBackedSessionStore replacement — process exit drops all
 * state. Do not wire into the real CLI.
 */
export class InMemorySessionStore implements SessionStore {
  private meta = new Map<string, SessionMeta>()
  private artifacts = new Map<string, Map<string, string>>()

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
    this.meta.set(rec.uuid, rec)
    this.artifacts.set(rec.uuid, new Map())
    return { ...rec }
  }

  async read(uuid: string): Promise<SessionMeta | null> {
    const rec = this.meta.get(uuid)
    return rec ? { ...rec } : null
  }

  async update(uuid: string, patch: SessionMetaPatch): Promise<SessionMeta> {
    const rec = this.meta.get(uuid)
    if (!rec) throw new Error(`Session ${uuid} not found`)
    if (rec.schemaVersion !== SESSION_SCHEMA_VERSION) {
      throw new SessionSchemaMismatchError(uuid, rec.schemaVersion, SESSION_SCHEMA_VERSION)
    }
    const next: SessionMeta = {
      ...rec,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    this.meta.set(uuid, next)
    return { ...next }
  }

  async writeArtifact(uuid: string, filename: string, content: string): Promise<void> {
    assertSafeArtifactName(filename)
    const rec = this.meta.get(uuid)
    if (!rec) throw new Error(`Session ${uuid} not found`)
    const bucket = this.artifacts.get(uuid)!
    bucket.set(filename, content)
    rec.updatedAt = new Date().toISOString()
  }

  async readArtifact(uuid: string, filename: string): Promise<string | null> {
    assertSafeArtifactName(filename)
    return this.artifacts.get(uuid)?.get(filename) ?? null
  }

  async hasArtifact(uuid: string, filename: string): Promise<boolean> {
    assertSafeArtifactName(filename)
    return this.artifacts.get(uuid)?.has(filename) ?? false
  }

  async listArtifacts(uuid: string): Promise<string[]> {
    const bucket = this.artifacts.get(uuid)
    return bucket ? [...bucket.keys()].sort() : []
  }

  async delete(uuid: string): Promise<void> {
    this.meta.delete(uuid)
    this.artifacts.delete(uuid)
  }

  async list(): Promise<SessionMeta[]> {
    return [...this.meta.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(r => ({ ...r }))
  }
}
