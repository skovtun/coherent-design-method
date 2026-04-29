import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// preferences.ts honors COHERENT_TEST_HOME for test isolation — see file header.
let tmpHome: string
const originalCoherentHome = process.env.COHERENT_TEST_HOME

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'coherent-prefs-'))
  process.env.COHERENT_TEST_HOME = tmpHome
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  if (originalCoherentHome === undefined) delete process.env.COHERENT_TEST_HOME
  else process.env.COHERENT_TEST_HOME = originalCoherentHome
})

import {
  clearPreferences,
  getPreferencesPath,
  readPreferences,
  renderPreferencesBlock,
  setPreference,
  writePreferences,
} from './preferences.js'

describe('preferences store', () => {
  it('homedir override resolves to tmp dir for the test', () => {
    expect(getPreferencesPath()).toContain(tmpHome)
  })

  it('readPreferences returns empty object when file missing', () => {
    expect(readPreferences()).toEqual({ version: 1 })
  })

  it('readPreferences tolerates a malformed JSON file (returns empty)', () => {
    const path = getPreferencesPath()
    mkdirSync(join(tmpHome, '.coherent'), { recursive: true })
    writeFileSync(path, 'not-json', 'utf-8')
    expect(readPreferences()).toEqual({ version: 1 })
  })

  it('writePreferences creates the .coherent directory and file', () => {
    const ok = writePreferences({ version: 1, design: { density: 'compact' } })
    expect(ok).toBe(true)
    expect(existsSync(getPreferencesPath())).toBe(true)
    expect(readPreferences()).toEqual({ version: 1, design: { density: 'compact' } })
  })

  it('setPreference parses comma-separated style into array', () => {
    const { prefs, written } = setPreference('design.style', 'minimalist, monochrome, editorial')
    expect(written).toBe(true)
    expect(prefs.design?.style).toEqual(['minimalist', 'monochrome', 'editorial'])
  })

  it('setPreference parses comma-separated avoid into array', () => {
    const { prefs } = setPreference('design.avoid', 'purple gradients, marketing hero')
    expect(prefs.design?.avoid).toEqual(['purple gradients', 'marketing hero'])
  })

  it('setPreference stores density as plain string', () => {
    const { prefs } = setPreference('design.density', 'compact')
    expect(prefs.design?.density).toBe('compact')
  })

  it('setPreference with empty value clears that key', () => {
    setPreference('design.density', 'compact')
    const { prefs } = setPreference('design.density', '   ')
    expect(prefs.design?.density).toBeUndefined()
  })

  it('setPreference rejects unsupported key shape (no write)', () => {
    setPreference('design.density', 'compact')
    const { written } = setPreference('not.a.design.key', 'whatever')
    expect(written).toBe(false)
    expect(readPreferences().design?.density).toBe('compact')
  })

  it('setPreference accepts unknown design.* keys (forward compat)', () => {
    const { prefs } = setPreference('design.tone', 'editorial')
    expect((prefs.design as Record<string, unknown>)?.tone).toBe('editorial')
  })

  it('clearPreferences with no key wipes the store', () => {
    setPreference('design.density', 'compact')
    setPreference('design.style', 'minimalist')
    const { prefs, written } = clearPreferences()
    expect(written).toBe(true)
    expect(prefs.design).toBeUndefined()
  })

  it('clearPreferences with key removes only that key', () => {
    setPreference('design.density', 'compact')
    setPreference('design.style', 'minimalist')
    const { prefs } = clearPreferences('design.density')
    expect(prefs.design?.density).toBeUndefined()
    expect(prefs.design?.style).toEqual(['minimalist'])
  })

  // v0.15.4 — write failure surfacing
  it('setPreference returns written:false when filesystem fails', () => {
    // Point COHERENT_TEST_HOME at a path that cannot be created (a file, not a dir).
    const blockerFile = join(tmpHome, 'blocker')
    writeFileSync(blockerFile, '', 'utf-8')
    process.env.COHERENT_TEST_HOME = blockerFile // file at this path → mkdir fails
    const { written } = setPreference('design.density', 'compact')
    expect(written).toBe(false)
  })

  it('renderPreferencesBlock returns empty string for empty prefs', () => {
    expect(renderPreferencesBlock({ version: 1 })).toBe('')
    expect(renderPreferencesBlock({ version: 1, design: {} })).toBe('')
  })

  it('renderPreferencesBlock formats all known fields', () => {
    const block = renderPreferencesBlock({
      version: 1,
      design: {
        style: ['minimalist', 'monochrome'],
        density: 'compact',
        avoid: ['purple gradients'],
        notes: 'lean toward editorial',
      },
    })
    expect(block).toContain('## USER DESIGN PREFERENCES')
    expect(block).toContain('Style preference: minimalist, monochrome')
    expect(block).toContain('UI density: compact')
    expect(block).toContain('Avoid: purple gradients')
    expect(block).toContain('Notes: lean toward editorial')
  })

  it('renderPreferencesBlock skips empty/missing fields', () => {
    const block = renderPreferencesBlock({
      version: 1,
      design: { density: 'compact' },
    })
    expect(block).toContain('UI density: compact')
    expect(block).not.toContain('Style preference')
    expect(block).not.toContain('Avoid')
    expect(block).not.toContain('Notes')
  })

  // v0.15.5 — codex flagged that unknown design.* keys were stored
  // and shown but silently NOT injected into the prompt.
  it('renderPreferencesBlock includes unknown string design.* keys (forward-compat)', () => {
    const block = renderPreferencesBlock({
      version: 1,
      design: { tone: 'editorial', mood: 'dim' } as Record<string, unknown>,
    })
    expect(block).toContain('## USER DESIGN PREFERENCES')
    expect(block).toContain('Tone: editorial')
    expect(block).toContain('Mood: dim')
  })

  it('renderPreferencesBlock includes unknown string-array design.* keys', () => {
    const block = renderPreferencesBlock({
      version: 1,
      design: { typefaces: ['inter', 'serif'] } as Record<string, unknown>,
    })
    expect(block).toContain('Typefaces: inter, serif')
  })

  it('renderPreferencesBlock skips unknown keys with non-string/non-array-of-string values', () => {
    const block = renderPreferencesBlock({
      version: 1,
      design: {
        weirdNumber: 42,
        weirdObject: { nested: 'thing' },
        emptyString: '',
        mixedArray: ['ok', 7],
      } as Record<string, unknown>,
    })
    expect(block).toBe('') // none of the unknown keys are renderable
  })

  it('setPreference persists unknown keys to the file (forward-compat)', () => {
    setPreference('design.tone', 'editorial')
    const after = readPreferences()
    expect((after.design as Record<string, unknown>)?.tone).toBe('editorial')
    // and they survive a render
    expect(renderPreferencesBlock(after)).toContain('Tone: editorial')
  })
})
