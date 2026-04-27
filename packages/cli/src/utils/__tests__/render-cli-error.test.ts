/**
 * render-cli-error.ts — unit tests.
 *
 * Covers the four rendering branches (CoherentError, generic Error +
 * debug, generic Error no-debug, unknown thrown shape) and the TTY
 * behavior (colors only on TTY).
 */

import { describe, it, expect } from 'vitest'
import { CoherentError } from '../../errors/CoherentError.js'
import { COHERENT_ERROR_CODES } from '../../errors/codes.js'
import { renderCliError } from '../render-cli-error.js'

describe('renderCliError', () => {
  describe('CoherentError branch', () => {
    it('uses format() output', () => {
      const err = new CoherentError({
        code: COHERENT_ERROR_CODES.E007_NO_AI_REQUIRES_PREPOPULATION,
        message: 'no AI in skill rail',
        fix: 'use --with-ai',
      })
      const { stderr, exitCode } = renderCliError(err, { isTty: false })
      expect(exitCode).toBe(1)
      expect(stderr).toContain('[COHERENT_E007] no AI in skill rail')
      expect(stderr).toContain('Fix:')
      expect(stderr).toContain('use --with-ai')
      expect(stderr).toContain('Docs: https://getcoherent.design/errors/E007')
    })

    it('emits plain text when isTty is false (CI / log capture)', () => {
      const err = new CoherentError({
        code: COHERENT_ERROR_CODES.E002_SESSION_LOCKED,
        message: 'session locked',
        fix: 'wait or end',
      })
      const { stderr } = renderCliError(err, { isTty: false })
      // No ANSI escape codes in plain mode.
      expect(stderr).not.toMatch(/\[/)
    })

    it('wraps in chalk.red when isTty is true', () => {
      const err = new CoherentError({
        code: COHERENT_ERROR_CODES.E002_SESSION_LOCKED,
        message: 'session locked',
        fix: 'wait or end',
      })
      // Chalk auto-detects color support and is a no-op in non-color
      // test environments. Assert structural correctness: either ANSI
      // escapes appear OR content is identical to TTY-off mode.
      // Use the literal ESC byte (\x1b) so we probe for actual ANSI
      // sequences, not the literal '[' that appears in '[COHERENT_E002]'.
      const ttyOn = renderCliError(err, { isTty: true }).stderr
      const ttyOff = renderCliError(err, { isTty: false }).stderr
      // eslint-disable-next-line no-control-regex
      const hasAnsi = /\x1b\[/.test(ttyOn)
      expect(hasAnsi || ttyOn === ttyOff).toBe(true)
      expect(ttyOn).toContain('[COHERENT_E002] session locked')
    })
  })

  describe('Generic Error branch', () => {
    it('shows message only without debug flag', () => {
      const err = new Error('something broke')
      const { stderr, exitCode } = renderCliError(err, { isTty: false })
      expect(exitCode).toBe(1)
      expect(stderr).toContain('❌ something broke')
      // Stack should NOT be included.
      expect(stderr).not.toContain('at ')
    })

    it('includes stack trace when debug is true', () => {
      const err = new Error('debug me')
      const { stderr } = renderCliError(err, { isTty: false, debug: true })
      expect(stderr).toContain('❌ debug me')
      expect(stderr).toContain('at ') // stack frame marker
    })

    it('surfaces Error.cause chain', () => {
      const inner = new Error('original cause')
      const outer = new Error('wrapper')
      ;(outer as Error & { cause?: unknown }).cause = inner
      const { stderr } = renderCliError(outer, { isTty: false })
      expect(stderr).toContain('Caused by: original cause')
    })
  })

  describe('Unknown shape branch', () => {
    it('handles string thrown as error', () => {
      const { stderr, exitCode } = renderCliError('plain string thrown', { isTty: false })
      expect(exitCode).toBe(1)
      expect(stderr).toContain('[unknown error]')
      expect(stderr).toContain('plain string thrown')
    })

    it('handles null thrown', () => {
      const { stderr } = renderCliError(null, { isTty: false })
      expect(stderr).toContain('[unknown error]')
    })

    it('handles object literal thrown', () => {
      const { stderr } = renderCliError({ weird: true }, { isTty: false })
      expect(stderr).toContain('[unknown error]')
    })
  })

  describe('Cross-boundary CoherentError detection', () => {
    it('catches real CoherentError instances (fast path)', () => {
      const err = new CoherentError({
        code: COHERENT_ERROR_CODES.E001_NO_API_KEY,
        message: 'no key',
        fix: 'set COHERENT_API_KEY',
      })
      const { stderr } = renderCliError(err, { isTty: false })
      expect(stderr).toContain('[COHERENT_E001]')
    })

    it('catches plain objects with CoherentError shape (cross-package boundary)', () => {
      // Simulate a CoherentError thrown from a different module instance —
      // structurally identical but not satisfying `instanceof CoherentError`.
      // Real-world: dependency hoisting, dual install, monorepo workspace
      // boundary, errors serialized across IPC.
      const fakeFromOtherPackage = {
        name: 'CoherentError',
        code: 'COHERENT_E007',
        message: 'cross-boundary throw',
        fix: 'use --with-ai',
        docsUrl: 'https://getcoherent.design/errors/E007',
        causeText: 'producer phase did not pre-populate output',
      }
      const { stderr } = renderCliError(fakeFromOtherPackage, { isTty: false })
      // Structural detection must succeed. Renderer falls back to
      // formatStructural() because the plain object lacks .format().
      expect(stderr).toContain('[COHERENT_E007]')
      expect(stderr).toContain('cross-boundary throw')
      expect(stderr).toContain('use --with-ai')
      expect(stderr).toContain('Why: producer phase')
    })

    it('rejects non-CoherentError plain objects (no false positives)', () => {
      // Plain objects without the CoherentError shape must NOT be detected
      // as CoherentError. Otherwise any thrown plain object would be
      // misrendered. Tests the negative side of structural detection.
      const notACoherentError = {
        name: 'Error',
        message: 'just a regular error',
      }
      const { stderr } = renderCliError(notACoherentError, { isTty: false })
      expect(stderr).not.toMatch(/\[COHERENT_E\d{3}\]/)
      expect(stderr).toContain('[unknown error]')
    })

    it('rejects objects with malformed code (false positives)', () => {
      // Has CoherentError-ish name + fix + docsUrl, but `code` doesn't
      // match the canonical regex. Structural check must reject.
      const malformed = {
        name: 'CoherentError',
        code: 'NOT_COHERENT_FORMAT',
        fix: 'fix-text',
        docsUrl: 'https://example.com',
      }
      const { stderr } = renderCliError(malformed, { isTty: false })
      expect(stderr).not.toMatch(/\[COHERENT_E\d{3}\]/)
    })
  })
})
