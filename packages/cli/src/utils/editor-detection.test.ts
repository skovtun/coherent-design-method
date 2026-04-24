import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectEditors, editorLabel } from './editor-detection.js'

describe('detectEditors', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'coherent-editor-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns empty detection for a bare directory', () => {
    const r = detectEditors(root)
    expect(r.detected).toEqual([])
    expect(r.withAdapter).toEqual([])
    expect(r.v2Target).toEqual([])
  })

  it('classifies .claude as v1 adapter', () => {
    mkdirSync(join(root, '.claude'))
    const r = detectEditors(root)
    expect(r.detected).toEqual(['claude-code'])
    expect(r.withAdapter).toEqual(['claude-code'])
    expect(r.v2Target).toEqual([])
  })

  it('classifies .cursor as v2 target', () => {
    mkdirSync(join(root, '.cursor'))
    const r = detectEditors(root)
    expect(r.detected).toEqual(['cursor'])
    expect(r.withAdapter).toEqual([])
    expect(r.v2Target).toEqual(['cursor'])
  })

  it('detects all four editor markers together', () => {
    mkdirSync(join(root, '.claude'))
    mkdirSync(join(root, '.cursor'))
    mkdirSync(join(root, '.continue'))
    mkdirSync(join(root, '.windsurf'))
    const r = detectEditors(root)
    expect(r.detected.sort()).toEqual(['claude-code', 'continue', 'cursor', 'windsurf'])
    expect(r.withAdapter).toEqual(['claude-code'])
    expect(r.v2Target.sort()).toEqual(['continue', 'cursor', 'windsurf'])
  })

  it('ignores unrelated directories', () => {
    mkdirSync(join(root, '.vscode'))
    mkdirSync(join(root, 'node_modules'))
    const r = detectEditors(root)
    expect(r.detected).toEqual([])
  })
})

describe('editorLabel', () => {
  it('returns human-readable names', () => {
    expect(editorLabel('claude-code')).toBe('Claude Code')
    expect(editorLabel('cursor')).toBe('Cursor')
    expect(editorLabel('continue')).toBe('Continue')
    expect(editorLabel('windsurf')).toBe('Windsurf')
  })
})
