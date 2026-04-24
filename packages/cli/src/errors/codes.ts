/**
 * Coherent error code registry — the canonical list of user-facing errors
 * that the CLI throws. Every code is stable across releases: once allocated,
 * a code is never re-assigned to a different error, even when the error
 * itself is removed (we leave a tombstone comment instead).
 *
 * The registry is append-only. When you add a new user-facing error path,
 * pick the next free `E0NN` slot in numeric order, add a line to the
 * registry below, export its constants here, and link it from
 * `docs/error-codes.md`. The URL pattern is `https://getcoherent.design/
 * errors/E0NN` — one page per code, anchored on the code string.
 *
 * Shape of a CoherentError (see `./CoherentError.ts`):
 *   - code: string    — "COHERENT_E001" through "COHERENT_E020" today.
 *   - message: string — one-line problem description (no trailing period).
 *   - cause?: string  — optional "why" (frame the user's mental model).
 *   - fix: string     — actionable command or step. Not advice.
 *   - docsUrl: string — absolute URL the user can open to read more.
 *
 * The CLI's error printer renders these four fields consistently so the
 * user sees the same layout no matter where in the codebase the throw
 * originated. See `CoherentError.format()`.
 */

export const DOCS_URL_BASE = 'https://getcoherent.design/errors'

/** Regex the CI lint test uses to verify the code string shape. */
export const COHERENT_ERROR_CODE_PATTERN = /^COHERENT_E\d{3}$/

/**
 * Every code exported below, keyed by its slot number. Keep this list in
 * sync with `docs/error-codes.md` — when you add a new code, write its
 * docs entry in the same commit.
 *
 * v0.9.0 initial allocation (locked by canonical design doc):
 */
export const COHERENT_ERROR_CODES = {
  /** `coherent chat` reached the AI-provider step without any credentials. */
  E001_NO_API_KEY: 'COHERENT_E001',
  /** `coherent session start` hit an active persistent lock. */
  E002_SESSION_LOCKED: 'COHERENT_E002',
  /** `coherent _phase <name> ingest` received malformed stdin (empty or unparseable). */
  E003_PHASE_INGEST_MALFORMED: 'COHERENT_E003',
  /** `coherent _phase` was invoked with `--protocol` that doesn't match `PHASE_ENGINE_PROTOCOL`. */
  E004_PROTOCOL_MISMATCH: 'COHERENT_E004',
  /** `session.json.schemaVersion` is incompatible with this CLI build. */
  E005_SESSION_SCHEMA_MISMATCH: 'COHERENT_E005',
  /** Skill auto-resume: session says `awaiting-ingest` but the expected input artifact is missing. */
  E006_SESSION_ARTIFACT_MISSING: 'COHERENT_E006',
} as const

export type CoherentErrorCode = (typeof COHERENT_ERROR_CODES)[keyof typeof COHERENT_ERROR_CODES]

/**
 * Build the canonical docs URL for a code. Tests + the error printer both
 * go through this helper so the pattern is defined in exactly one place.
 */
export function docsUrlFor(code: CoherentErrorCode): string {
  // COHERENT_E001 → E001
  const slug = code.replace(/^COHERENT_/, '')
  return `${DOCS_URL_BASE}/${slug}`
}
