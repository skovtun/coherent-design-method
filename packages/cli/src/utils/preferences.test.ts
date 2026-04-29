import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// preferences.ts honors COHERENT_HOME for test isolation — see file header.
let tmpHome: string
const originalCoherentHome = process.env.COHERENT_HOME

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'coherent-prefs-'))
  process.env.COHERENT_HOME = tmpHome
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  if (originalCoherentHome === undefined) delete process.env.COHERENT_HOME
  else process.env.COHERENT_HOME = originalCoherentHome
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
    const after = setPreference('design.style', 'minimalist, monochrome, editorial')
    expect(after.design?.style).toEqual(['minimalist', 'monochrome', 'editorial'])
  })

  it('setPreference parses comma-separated avoid into array', () => {
    const after = setPreference('design.avoid', 'purple gradients, marketing hero')
    expect(after.design?.avoid).toEqual(['purple gradients', 'marketing hero'])
  })

  it('setPreference stores density as plain string', () => {
    const after = setPreference('design.density', 'compact')
    expect(after.design?.density).toBe('compact')
  })

  it('setPreference with empty value clears that key', () => {
    setPreference('design.density', 'compact')
    const after = setPreference('design.density', '   ')
    expect(after.design?.density).toBeUndefined()
  })

  it('setPreference rejects unsupported key shape (no-op write)', () => {
    setPreference('design.density', 'compact')
    setPreference('not.a.design.key', 'whatever')
    expect(readPreferences().design?.density).toBe('compact')
  })

  it('setPreference accepts unknown design.* keys (forward compat)', () => {
    const after = setPreference('design.tone', 'editorial')
    expect((after.design as Record<string, unknown>)?.tone).toBe('editorial')
  })

  it('clearPreferences with no key wipes the store', () => {
    setPreference('design.density', 'compact')
    setPreference('design.style', 'minimalist')
    const after = clearPreferences()
    expect(after.design).toBeUndefined()
  })

  it('clearPreferences with key removes only that key', () => {
    setPreference('design.density', 'compact')
    setPreference('design.style', 'minimalist')
    const after = clearPreferences('design.density')
    expect(after.design?.density).toBeUndefined()
    expect(after.design?.style).toEqual(['minimalist'])
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
})
