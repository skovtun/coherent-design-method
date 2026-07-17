import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { DEFAULT_MODEL, MODEL_PREFERENCE_ORDER, resolveModel, isModelNotFoundError } from './model.js'

/**
 * Model IDs Anthropic has retired. A request to any of these returns 404
 * not_found_error. `claude-sonnet-4-20250514` was pinned as Coherent's default
 * and retired on 2026-06-15 — every `coherent chat` on the API rail 404'd for a
 * month before anyone noticed. Append to this list as models retire.
 */
const RETIRED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-sonnet-20240229',
]

describe('DEFAULT_MODEL', () => {
  it('is not a retired model', () => {
    expect(RETIRED_MODELS).not.toContain(DEFAULT_MODEL)
  })

  it('is first in the fallback preference order', () => {
    expect(MODEL_PREFERENCE_ORDER[0]).toBe(DEFAULT_MODEL)
  })

  it('offers no retired model as a fallback', () => {
    for (const model of MODEL_PREFERENCE_ORDER) {
      expect(RETIRED_MODELS).not.toContain(model)
    }
  })
})

describe('resolveModel', () => {
  const original = process.env.CLAUDE_MODEL

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_MODEL
    else process.env.CLAUDE_MODEL = original
  })

  it('prefers the explicit argument over env and the pin', () => {
    process.env.CLAUDE_MODEL = 'claude-opus-4-8'
    expect(resolveModel('claude-haiku-4-5')).toBe('claude-haiku-4-5')
  })

  it('falls back to CLAUDE_MODEL when no explicit model is given', () => {
    process.env.CLAUDE_MODEL = 'claude-opus-4-8'
    expect(resolveModel()).toBe('claude-opus-4-8')
  })

  it('falls back to the pin when nothing is set', () => {
    delete process.env.CLAUDE_MODEL
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })
})

describe('isModelNotFoundError', () => {
  it('matches the API 404 not_found_error shape', () => {
    expect(isModelNotFoundError({ status: 404, error: { type: 'not_found_error' } })).toBe(true)
  })
  it('ignores other errors', () => {
    expect(isModelNotFoundError({ status: 404, error: { type: 'other' } })).toBe(false)
    expect(isModelNotFoundError({ status: 429, error: { type: 'rate_limit_error' } })).toBe(false)
    expect(isModelNotFoundError(new Error('boom'))).toBe(false)
    expect(isModelNotFoundError(null)).toBe(false)
    expect(isModelNotFoundError(undefined)).toBe(false)
  })
})

/**
 * The month-long outage was possible because the model ID was hardcoded in four
 * places: Tool 2's copy got updated during the R10 saga while `coherent chat`'s
 * was forgotten. This test makes that divergence impossible to reintroduce —
 * new call sites must import from `utils/model.ts`.
 */
describe('no stray hardcoded model IDs', () => {
  const SRC = join(__dirname, '..')
  /** Files allowed to name a model literally, each for a deliberate reason. */
  const ALLOWED = new Set([
    join(SRC, 'utils', 'model.ts'), // the pin itself
    join(SRC, 'utils', 'model.test.ts'), // this file
    join(SRC, 'scan', 'cluster', 'constants.ts'), // Tool 2: pinned to its eval-calibrated model on purpose
    join(SRC, 'scan', 'cluster', 'cost-banner.test.ts'), // asserts on Tool 2's pinned model
  ])

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : walk(path)
      return path.endsWith('.ts') ? [path] : []
    })
  }

  /**
   * Drop comments so the rule targets code literals, not prose — docstrings and
   * incident notes legitimately name models. Only whole comment lines and block
   * comments are removed (never a trailing `//` after code), so a stray literal
   * can't hide behind a mangled `https://` URL.
   */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter(line => {
        const t = line.trim()
        return !t.startsWith('//') && !t.startsWith('*')
      })
      .join('\n')
  }

  it('every model literal lives in utils/model.ts (or a documented exception)', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (ALLOWED.has(file)) continue
      const code = stripComments(readFileSync(file, 'utf-8'))
      // A real model id in a string literal — not prose, not `claude-code`.
      const matches = code.match(/['"`]claude-(?:sonnet|opus|haiku|fable|mythos)-[a-z0-9.-]+['"`]/g)
      if (matches) offenders.push(`${file.replace(SRC, '')}: ${matches.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
