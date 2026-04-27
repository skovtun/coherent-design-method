/**
 * Base class for every user-facing error Coherent throws. Canonical
 * 4-field schema per canonical design doc T17:
 *
 *   code     — stable `COHERENT_E\d{3}` identifier (see `./codes.ts`).
 *   message  — one-line problem, present-tense, no trailing period.
 *   cause    — optional "why" (frame the user's mental model).
 *   fix      — actionable command or step. "Run `coherent auth set-key`"
 *              beats "check your configuration."
 *   docsUrl  — absolute URL — always populated via `docsUrlFor(code)`.
 *
 * The class extends `Error` so existing `catch (e)` sites that check
 * `instanceof Error` keep working. `format()` renders the full 4-field
 * layout for the CLI error printer; `toString()` returns the short
 * `[CODE] message` form for default `console.error` output and stack
 * traces.
 *
 * This module deliberately has zero runtime dependencies beyond
 * `./codes.ts` — it's imported by very low-level paths (`_phase`
 * protocol check, session lifecycle lock acquire) and should not drag
 * in chalk, config loaders, or anything fs-bound.
 */

import { type CoherentErrorCode, docsUrlFor } from './codes.js'

export interface CoherentErrorInit {
  code: CoherentErrorCode
  message: string
  fix: string
  cause?: string
  /** Override the docs URL when the error belongs to a non-canonical slot (tests, never in production). */
  docsUrl?: string
}

export class CoherentError extends Error {
  readonly code: CoherentErrorCode
  readonly fix: string
  readonly docsUrl: string
  /**
   * `cause` overlaps with Node's `ErrorOptions.cause`. We keep our own
   * string field for presentation; if a caller wants to also chain a
   * native cause, they can pass it via `Error`'s options param directly
   * on an instance (not a common path).
   */
  readonly causeText: string | undefined

  constructor(init: CoherentErrorInit) {
    super(init.message)
    this.name = 'CoherentError'
    this.code = init.code
    this.fix = init.fix
    this.causeText = init.cause
    this.docsUrl = init.docsUrl ?? docsUrlFor(init.code)
  }

  /**
   * Multi-line rendering for the CLI error printer. Shape:
   *
   *   [COHERENT_E001] No AI key available
   *
   *   Why: coherent chat makes API calls to Anthropic directly.
   *
   *   Fix:
   *     coherent auth set-key sk-ant-...
   *
   *   Docs: https://getcoherent.design/errors/E001
   *
   * Consumers (the CLI top-level `catch`) wrap this in chalk for color.
   * The base class emits plain text so tests can assert exact strings
   * without stripping ANSI sequences.
   */
  format(): string {
    const lines: string[] = []
    lines.push(`[${this.code}] ${this.message}`)
    lines.push('')
    if (this.causeText) {
      lines.push(`Why: ${this.causeText}`)
      lines.push('')
    }
    lines.push('Fix:')
    lines.push(`  ${this.fix}`)
    lines.push('')
    lines.push(`Docs: ${this.docsUrl}`)
    return lines.join('\n')
  }

  /** Short form for stack traces and default logging. */
  override toString(): string {
    return `[${this.code}] ${this.message}`
  }
}

/**
 * Runtime guard — true iff `err` is a CoherentError shape.
 *
 * v0.13.0 adversarial review (2026-04-27) caught: pre-v0.13.0 this used
 * `err instanceof CoherentError` despite the docblock claiming "structural
 * marker." That `instanceof` check fails when two copies of the errors
 * module are loaded (dependency hoisting, dual install, monorepo
 * workspace boundaries) — the second copy's CoherentError instances
 * don't satisfy the first copy's `instanceof`. This v0.13.0 implementation
 * does an actual structural check that survives cross-package boundaries.
 *
 * Structural shape: any object with
 *   - name === 'CoherentError'
 *   - code matching `/^COHERENT_E\d{3}$/`
 *   - fix (string)
 *   - docsUrl (string)
 *
 * The native `instanceof` check is preserved as a fast-path so the common
 * single-package case skips the structural inspection.
 */
export function isCoherentError(err: unknown): err is CoherentError {
  // Fast path — same module instance.
  if (err instanceof CoherentError) return true
  // Structural path — different module instance (cross-package boundary).
  if (typeof err !== 'object' || err === null) return false
  const candidate = err as Record<string, unknown>
  return (
    candidate.name === 'CoherentError' &&
    typeof candidate.code === 'string' &&
    /^COHERENT_E\d{3}$/.test(candidate.code) &&
    typeof candidate.fix === 'string' &&
    typeof candidate.docsUrl === 'string'
  )
}
