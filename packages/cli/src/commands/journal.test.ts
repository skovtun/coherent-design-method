import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pruneJournalSessions } from './journal.js'

describe('pruneJournalSessions', () => {
  let projectRoot: string
  let sessionsDir: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-journal-prune-'))
    sessionsDir = join(projectRoot, '.coherent', 'fix-sessions')
    mkdirSync(sessionsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  const writeSession = (name: string, body = 'timestamp: 2026-04-20T000000Z\n') =>
    writeFileSync(join(sessionsDir, name), body)

  it('deletes sessions older than cutoff, keeps recent ones', () => {
    writeSession('2026-03-01T000000Z.yaml') // older
    writeSession('2026-04-15T000000Z.yaml') // recent
    writeSession('2026-04-20T000000Z.yaml') // today

    const now = new Date('2026-04-20T12:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now })

    expect(result.scanned).toBe(3)
    expect(result.kept).toBe(2)
    expect(result.deleted).toEqual(['2026-03-01T000000Z.yaml'])
    expect(existsSync(join(sessionsDir, '2026-03-01T000000Z.yaml'))).toBe(false)
    expect(existsSync(join(sessionsDir, '2026-04-15T000000Z.yaml'))).toBe(true)
  })

  it('dry-run reports what would be deleted without touching files', () => {
    writeSession('2025-01-01T000000Z.yaml')
    writeSession('2026-04-20T000000Z.yaml')

    const now = new Date('2026-04-20T12:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now, dryRun: true })

    expect(result.deleted).toEqual(['2025-01-01T000000Z.yaml'])
    expect(existsSync(join(sessionsDir, '2025-01-01T000000Z.yaml'))).toBe(true)
    expect(readdirSync(sessionsDir)).toHaveLength(2)
  })

  it('keeps files with unparseable timestamps (conservative)', () => {
    writeSession('some-arbitrary-name.yaml')
    writeSession('also-weird.yaml')

    const now = new Date('2026-04-20T12:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now })

    expect(result.scanned).toBe(2)
    expect(result.kept).toBe(2)
    expect(result.deleted).toHaveLength(0)
  })

  it('ignores non-yaml files in the sessions directory', () => {
    writeFileSync(join(sessionsDir, 'README.md'), '# notes')
    writeSession('2025-01-01T000000Z.yaml')

    const now = new Date('2026-04-20T12:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now })

    expect(result.scanned).toBe(1)
    expect(result.deleted).toEqual(['2025-01-01T000000Z.yaml'])
    expect(existsSync(join(sessionsDir, 'README.md'))).toBe(true)
  })

  it('returns empty result when sessions directory does not exist', () => {
    rmSync(sessionsDir, { recursive: true, force: true })
    const result = pruneJournalSessions(projectRoot, 30)

    expect(result.scanned).toBe(0)
    expect(result.kept).toBe(0)
    expect(result.deleted).toHaveLength(0)
  })

  it('handles hyphenated timestamp format (2026-04-20T12-00-00Z)', () => {
    writeSession('2025-01-01T12-00-00Z.yaml')
    writeSession('2026-04-20T12-00-00Z.yaml')

    const now = new Date('2026-04-20T13:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now })

    expect(result.deleted).toEqual(['2025-01-01T12-00-00Z.yaml'])
    expect(existsSync(join(sessionsDir, '2026-04-20T12-00-00Z.yaml'))).toBe(true)
  })

  it('keepDays boundary — file exactly at cutoff is kept', () => {
    writeSession('2026-03-21T000000Z.yaml')

    const now = new Date('2026-04-20T00:00:00Z')
    const result = pruneJournalSessions(projectRoot, 30, { now })

    expect(result.kept).toBe(1)
    expect(result.deleted).toHaveLength(0)
  })
})
