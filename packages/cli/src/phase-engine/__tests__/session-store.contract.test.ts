import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FileBackedSessionStore } from '../file-backed-session-store.js'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import { SESSION_SCHEMA_VERSION, SessionSchemaMismatchError, type SessionStore } from '../session-store.js'

type StoreFactory = {
  name: string
  make: () => { store: SessionStore; cleanup: () => void }
}

const factories: StoreFactory[] = [
  {
    name: 'InMemorySessionStore',
    make: () => ({ store: new InMemorySessionStore(), cleanup: () => {} }),
  },
  {
    name: 'FileBackedSessionStore',
    make: () => {
      const tmp = mkdtempSync(join(tmpdir(), 'coherent-session-'))
      return {
        store: new FileBackedSessionStore(tmp),
        cleanup: () => rmSync(tmp, { recursive: true, force: true }),
      }
    },
  },
]

describe.each(factories)('SessionStore contract — $name', ({ make }) => {
  let store: SessionStore
  let cleanup: () => void

  beforeEach(() => {
    const h = make()
    store = h.store
    cleanup = h.cleanup
  })

  afterEach(() => cleanup())

  describe('create', () => {
    it('returns a record with uuid, status pending-prep, phase plan, schemaVersion', async () => {
      const rec = await store.create()
      expect(rec.uuid).toMatch(/^[0-9a-f-]{36}$/i)
      expect(rec.phase).toBe('plan')
      expect(rec.status).toBe('pending-prep')
      expect(rec.schemaVersion).toBe(SESSION_SCHEMA_VERSION)
      expect(rec.createdAt).toBe(rec.updatedAt)
    })

    it('generates unique uuids', async () => {
      const a = await store.create()
      const b = await store.create()
      expect(a.uuid).not.toBe(b.uuid)
    })
  })

  describe('read', () => {
    it('returns null for unknown uuid', async () => {
      expect(await store.read('does-not-exist')).toBeNull()
    })

    it('round-trips a created session', async () => {
      const created = await store.create()
      const read = await store.read(created.uuid)
      expect(read).toEqual(created)
    })
  })

  describe('update', () => {
    it('applies patch + advances updatedAt', async () => {
      const rec = await store.create()
      await new Promise(r => setTimeout(r, 5))
      const next = await store.update(rec.uuid, { phase: 'anchor', status: 'awaiting-ai' })
      expect(next.phase).toBe('anchor')
      expect(next.status).toBe('awaiting-ai')
      expect(next.uuid).toBe(rec.uuid)
      expect(next.createdAt).toBe(rec.createdAt)
      expect(next.updatedAt >= rec.updatedAt).toBe(true)
    })

    it('throws for unknown uuid', async () => {
      await expect(store.update('nope', { status: 'done' })).rejects.toThrow(/not found/)
    })

    it('persists across a subsequent read', async () => {
      const rec = await store.create()
      await store.update(rec.uuid, { status: 'done' })
      const read = await store.read(rec.uuid)
      expect(read?.status).toBe('done')
    })
  })

  describe('artifacts', () => {
    it('write + read + has flow', async () => {
      const rec = await store.create()
      expect(await store.hasArtifact(rec.uuid, 'plan.json')).toBe(false)
      await store.writeArtifact(rec.uuid, 'plan.json', JSON.stringify({ pages: ['home'] }))
      expect(await store.hasArtifact(rec.uuid, 'plan.json')).toBe(true)
      expect(await store.readArtifact(rec.uuid, 'plan.json')).toBe('{"pages":["home"]}')
    })

    it('readArtifact returns null for missing artifact', async () => {
      const rec = await store.create()
      expect(await store.readArtifact(rec.uuid, 'anchor.json')).toBeNull()
    })

    it('supports text artifacts', async () => {
      const rec = await store.create()
      await store.writeArtifact(rec.uuid, 'pages-written.txt', '/home\n/login\n')
      expect(await store.readArtifact(rec.uuid, 'pages-written.txt')).toBe('/home\n/login\n')
    })

    it('listArtifacts returns filenames sorted, excludes session.json', async () => {
      const rec = await store.create()
      await store.writeArtifact(rec.uuid, 'plan.json', '{}')
      await store.writeArtifact(rec.uuid, 'anchor.json', '{}')
      await store.writeArtifact(rec.uuid, 'pages-written.txt', '')
      const listed = await store.listArtifacts(rec.uuid)
      expect(listed).toEqual(['anchor.json', 'pages-written.txt', 'plan.json'])
      expect(listed).not.toContain('session.json')
    })

    it('overwrites existing artifacts', async () => {
      const rec = await store.create()
      await store.writeArtifact(rec.uuid, 'plan.json', 'v1')
      await store.writeArtifact(rec.uuid, 'plan.json', 'v2')
      expect(await store.readArtifact(rec.uuid, 'plan.json')).toBe('v2')
    })

    it('rejects unsafe artifact names', async () => {
      const rec = await store.create()
      for (const bad of ['', '../secrets.env', '/abs/path', 'sub/dir.json', '.hidden', 'session.json']) {
        await expect(store.writeArtifact(rec.uuid, bad, 'x')).rejects.toThrow()
      }
    })
  })

  describe('delete', () => {
    it('removes the session + artifacts', async () => {
      const rec = await store.create()
      await store.writeArtifact(rec.uuid, 'plan.json', '{}')
      await store.delete(rec.uuid)
      expect(await store.read(rec.uuid)).toBeNull()
      expect(await store.listArtifacts(rec.uuid)).toEqual([])
    })

    it('is idempotent for unknown uuid', async () => {
      await expect(store.delete('does-not-exist')).resolves.toBeUndefined()
    })
  })

  describe('list', () => {
    it('returns empty for a fresh store', async () => {
      expect(await store.list()).toEqual([])
    })

    it('returns sessions most-recently-updated first', async () => {
      const a = await store.create()
      await new Promise(r => setTimeout(r, 5))
      const b = await store.create()
      await new Promise(r => setTimeout(r, 5))
      await store.update(a.uuid, { phase: 'anchor' })
      const listed = await store.list()
      expect(listed.map(r => r.uuid)).toEqual([a.uuid, b.uuid])
    })
  })
})

describe('SessionSchemaMismatchError', () => {
  it('surfaces found + expected for caller matching', () => {
    const err = new SessionSchemaMismatchError('abc', 99, 1)
    expect(err.name).toBe('SessionSchemaMismatchError')
    expect(err.found).toBe(99)
    expect(err.expected).toBe(1)
    expect(err.uuid).toBe('abc')
  })
})
