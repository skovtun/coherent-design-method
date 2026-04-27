/**
 * Centralized boundary error renderer for the CLI.
 *
 * Adversarial review (2026-04-27) on the v0.13.0 plan flagged that
 * scattered `instanceof CoherentError` branches at every catch site
 * would copy the same logic 4+ times. Worse, today most boundary catch
 * sites silently destroy the typed error context — `session-lifecycle.
 * ts:206` wraps with `throw new Error(\`Applier "X" failed: ${msg}\`)`,
 * dropping `code`, `fix`, `docsUrl`, `causeText`. The whole point of
 * the CoherentError 4-field schema is moot if the boundary discards it.
 *
 * This helper is the single rendering boundary. Callers do:
 *
 *   try {
 *     await mainCommand()
 *   } catch (err) {
 *     const { stderr, exitCode } = renderCliError(err, { debug: process.env.COHERENT_DEBUG === '1' })
 *     process.stderr.write(stderr)
 *     process.exit(exitCode)
 *   }
 *
 * Behavior:
 * - `isCoherentError(err)` (structural marker, NOT instanceof — handles
 *   cross-package boundary issues) → use `err.format()` plain output
 *   wrapped in `chalk.red` only when stderr is a TTY.
 * - Generic `Error` + `opts.debug` → include stack trace.
 * - Generic `Error` only → message-only.
 * - Unknown shape (string, number, null thrown as error) → stringify
 *   with a clear "[unknown error]" prefix so the operator knows the
 *   thrower violated the Error convention.
 *
 * Always returns; never re-throws. Always returns `exitCode: 1` for
 * errors. Caller decides whether to call `process.exit` or set
 * `process.exitCode` (deferred-exit pattern in chat.ts:1605).
 */

import chalk from 'chalk'
import { isCoherentError } from '../errors/CoherentError.js'

export interface RenderOptions {
  /**
   * When true, generic Error stack traces are included in the output.
   * Read from `COHERENT_DEBUG=1` or `--debug` flag at the call site.
   * Has no effect on CoherentError rendering — those use `format()`
   * which is already the user-facing layout.
   */
  debug?: boolean
  /**
   * Override the TTY check for tests. Default reads
   * `process.stderr.isTTY`. When false, no chalk colors are applied —
   * useful for log-capture and non-interactive environments.
   */
  isTty?: boolean
}

export interface RenderResult {
  /** Multi-line text destined for stderr. Includes trailing newline. */
  stderr: string
  /** Process exit code. Always `1` for any error path. */
  exitCode: number
}

export function renderCliError(err: unknown, opts: RenderOptions = {}): RenderResult {
  const debug = opts.debug ?? false
  const isTty = opts.isTty ?? process.stderr.isTTY ?? false

  // CoherentError path: use the canonical format() layout. Color only
  // when TTY; plain text otherwise (CI logs, support ticket pasting).
  if (isCoherentError(err)) {
    const formatted = err.format()
    const colored = isTty ? chalk.red(formatted) : formatted
    return { stderr: `\n${colored}\n`, exitCode: 1 }
  }

  // Generic Error path: message + optional stack.
  if (err instanceof Error) {
    const lines: string[] = []
    lines.push(`❌ ${err.message}`)
    if (debug && err.stack) {
      lines.push('')
      lines.push(err.stack)
    }
    if (err.cause) {
      lines.push('')
      lines.push(`Caused by: ${err.cause instanceof Error ? err.cause.message : String(err.cause)}`)
    }
    const text = lines.join('\n')
    const colored = isTty ? chalk.red(text) : text
    return { stderr: `\n${colored}\n`, exitCode: 1 }
  }

  // Unknown shape: someone threw a non-Error. Surface honestly.
  const message = `[unknown error] ${typeof err}: ${String(err)}`
  const colored = isTty ? chalk.red(message) : message
  return { stderr: `\n${colored}\n`, exitCode: 1 }
}
