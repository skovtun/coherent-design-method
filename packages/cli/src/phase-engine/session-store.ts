/**
 * SessionStore — typed interface for per-session state in the phase-engine.
 *
 * Two rails use it:
 *  - `coherent chat` drives phases in-process; state round-trips to disk via
 *    FileBackedSessionStore so mid-flow crashes resume safely.
 *  - Skill-mode CLI (`coherent _phase`) always persists because each invocation
 *    is a separate process. Only FileBackedSessionStore applies there.
 *
 * Tests use InMemorySessionStore.
 *
 * Artifacts are referenced by full filename (e.g., `plan.json`, `pages-written.txt`).
 * Callers handle JSON encoding. The store is a typed file tree, not a schema layer.
 */

/**
 * Lifecycle states for a single phase cycle.
 *
 *  - `pending-prep`: session created, phase not yet prepped (no prompt built).
 *  - `awaiting-ai`: prompt built + written, waiting for AI response
 *    (relevant only in skill-mode where AI runs out-of-process).
 *  - `awaiting-ingest`: AI response written, waiting for ingest to parse +
 *    persist artifacts.
 *  - `done`: phase complete; runner advances to next phase.
 */
export type SessionStatus = 'pending-prep' | 'awaiting-ai' | 'awaiting-ingest' | 'done'

/**
 * Bump when the shape of SessionMeta or on-disk layout changes incompatibly.
 * Sessions with mismatched schemaVersion are rejected, not auto-migrated —
 * sessions are ephemeral (7d TTL), not user artifacts worth preserving.
 */
export const SESSION_SCHEMA_VERSION = 1

export interface SessionMeta {
  /** Opaque unique id, e.g. crypto.randomUUID(). */
  uuid: string
  /** Current phase identifier (`plan`, `anchor`, `components`, `page`, `extract-style`, `log-run`). */
  phase: string
  /** Current status within `phase`. */
  status: SessionStatus
  /** Schema version of this session record. */
  schemaVersion: number
  /** ISO timestamp at `create()`. */
  createdAt: string
  /** ISO timestamp at most recent `update()` or artifact write. */
  updatedAt: string
}

/**
 * Patch shape for `update()`. uuid/createdAt/schemaVersion are immutable.
 */
export type SessionMetaPatch = Partial<Pick<SessionMeta, 'phase' | 'status'>>

export interface SessionStore {
  /** Create a new session. Returns the full SessionMeta record. */
  create(): Promise<SessionMeta>

  /** Read session metadata. Returns null if the session doesn't exist. */
  read(uuid: string): Promise<SessionMeta | null>

  /**
   * Apply a metadata patch + refresh `updatedAt`. Throws if the session is
   * missing or if the stored schemaVersion doesn't match {@link SESSION_SCHEMA_VERSION}.
   */
  update(uuid: string, patch: SessionMetaPatch): Promise<SessionMeta>

  /** Write an artifact file. `filename` is the full name (`plan.json`, `pages-written.txt`). */
  writeArtifact(uuid: string, filename: string, content: string): Promise<void>

  /** Read an artifact file. Returns null if the artifact doesn't exist. */
  readArtifact(uuid: string, filename: string): Promise<string | null>

  /** Check existence of an artifact without reading it. */
  hasArtifact(uuid: string, filename: string): Promise<boolean>

  /** List every artifact filename in this session. Does not include `session.json`. */
  listArtifacts(uuid: string): Promise<string[]>

  /** Remove the session directory (or memory entry) entirely. Idempotent. */
  delete(uuid: string): Promise<void>

  /** List all sessions known to the store, most-recently-updated first. */
  list(): Promise<SessionMeta[]>
}

/**
 * Thrown when a persisted session's schemaVersion doesn't match the
 * current CLI's {@link SESSION_SCHEMA_VERSION}. Intentionally typed so callers
 * can match-and-clear rather than auto-migrate.
 */
export class SessionSchemaMismatchError extends Error {
  readonly uuid: string
  readonly found: number
  readonly expected: number
  constructor(uuid: string, found: number, expected: number) {
    super(
      `Session ${uuid} has schemaVersion ${found}; this CLI expects ${expected}. ` +
        `Delete the session directory and start fresh.`,
    )
    this.name = 'SessionSchemaMismatchError'
    this.uuid = uuid
    this.found = found
    this.expected = expected
  }
}

/**
 * Enforced on every `writeArtifact` / `readArtifact` / `hasArtifact` call in
 * both file-backed and in-memory stores so they share the same rejection
 * contract. Blocks path traversal on disk *and* keeps the in-memory store
 * behavior-identical for the parity harness.
 *
 * `session.json` is reserved — it's the metadata file, not an artifact.
 */
export function assertSafeArtifactName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || name.startsWith('.')) {
    throw new Error(`Invalid artifact name: ${JSON.stringify(name)}`)
  }
  if (name === 'session.json') {
    throw new Error(`"session.json" is reserved for session metadata`)
  }
}
