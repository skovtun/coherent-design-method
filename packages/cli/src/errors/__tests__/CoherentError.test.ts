import { describe, it, expect } from 'vitest'
import {
  COHERENT_ERROR_CODE_PATTERN,
  COHERENT_ERROR_CODES,
  CoherentError,
  DOCS_URL_BASE,
  docsUrlFor,
  isCoherentError,
} from '../index.js'

describe('COHERENT_ERROR_CODES registry', () => {
  it('exports every code from the canonical v0.9.0 allocation + v0.12.0 + v0.13.1 additions', () => {
    expect(Object.keys(COHERENT_ERROR_CODES).sort()).toEqual([
      'E001_NO_API_KEY',
      'E002_SESSION_LOCKED',
      'E003_PHASE_INGEST_MALFORMED',
      'E004_PROTOCOL_MISMATCH',
      'E005_SESSION_SCHEMA_MISMATCH',
      'E006_SESSION_ARTIFACT_MISSING',
      'E007_NO_AI_REQUIRES_PREPOPULATION',
      'E008_PROJECT_OLDER_THAN_CLI',
    ])
  })

  it('every code string matches the canonical regex', () => {
    for (const code of Object.values(COHERENT_ERROR_CODES)) {
      expect(code).toMatch(COHERENT_ERROR_CODE_PATTERN)
    }
  })

  it('code values are unique (no accidental collisions)', () => {
    const values = Object.values(COHERENT_ERROR_CODES)
    expect(new Set(values).size).toBe(values.length)
  })

  it('docsUrlFor produces the canonical URL shape', () => {
    expect(docsUrlFor(COHERENT_ERROR_CODES.E001_NO_API_KEY)).toBe(`${DOCS_URL_BASE}/E001`)
    expect(docsUrlFor(COHERENT_ERROR_CODES.E006_SESSION_ARTIFACT_MISSING)).toBe(`${DOCS_URL_BASE}/E006`)
  })
})

describe('CoherentError', () => {
  it('subclasses Error and preserves instanceof checks', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E001_NO_API_KEY,
      message: 'No AI key available',
      fix: 'coherent auth set-key sk-ant-...',
    })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(CoherentError)
    expect(err.message).toBe('No AI key available')
    expect(err.name).toBe('CoherentError')
  })

  it('auto-populates docsUrl from the code', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E004_PROTOCOL_MISMATCH,
      message: 'Protocol mismatch',
      fix: 'Upgrade the CLI or the skill markdown.',
    })
    expect(err.docsUrl).toBe(`${DOCS_URL_BASE}/E004`)
  })

  it('honors an explicit docsUrl override', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E001_NO_API_KEY,
      message: 'x',
      fix: 'y',
      docsUrl: 'https://example.test/custom',
    })
    expect(err.docsUrl).toBe('https://example.test/custom')
  })

  it('format() renders the canonical 4-field layout with cause', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E001_NO_API_KEY,
      message: 'No AI key available',
      cause: 'coherent chat makes API calls to Anthropic directly.',
      fix: 'coherent auth set-key sk-ant-...',
    })
    const out = err.format()
    expect(out).toContain('[COHERENT_E001] No AI key available')
    expect(out).toContain('Why: coherent chat makes API calls to Anthropic directly.')
    expect(out).toContain('Fix:')
    expect(out).toContain('  coherent auth set-key sk-ant-...')
    expect(out).toContain(`Docs: ${DOCS_URL_BASE}/E001`)
  })

  it('format() omits the Why block when cause is absent', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E004_PROTOCOL_MISMATCH,
      message: 'Protocol mismatch',
      fix: 'Run `coherent update`.',
    })
    const out = err.format()
    expect(out).not.toMatch(/^Why:/m)
    expect(out).toContain('[COHERENT_E004] Protocol mismatch')
    expect(out).toContain('Fix:')
  })

  it('toString() returns the short [code] message form for stack traces', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E002_SESSION_LOCKED,
      message: 'Another session is active',
      fix: 'coherent session end <uuid>',
    })
    expect(err.toString()).toBe('[COHERENT_E002] Another session is active')
  })
})

describe('isCoherentError', () => {
  it('true for CoherentError instances', () => {
    const err = new CoherentError({
      code: COHERENT_ERROR_CODES.E001_NO_API_KEY,
      message: 'x',
      fix: 'y',
    })
    expect(isCoherentError(err)).toBe(true)
  })

  it('false for plain Error instances', () => {
    expect(isCoherentError(new Error('vanilla'))).toBe(false)
  })

  it('false for non-error values', () => {
    expect(isCoherentError('string')).toBe(false)
    expect(isCoherentError(null)).toBe(false)
    expect(isCoherentError(undefined)).toBe(false)
    expect(isCoherentError({ code: 'COHERENT_E001', message: 'fake' })).toBe(false)
  })
})
