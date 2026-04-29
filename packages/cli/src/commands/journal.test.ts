import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pruneJournalSessions, parseRunRetries } from './journal.js'

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

// v0.15.0 — quality retry telemetry parser
describe('parseRunRetries', () => {
  it('returns null when timestamp is missing', () => {
    const result = parseRunRetries('outcome: success\n', 'test.yaml')
    expect(result).toBeNull()
  })

  it('returns empty retries when block is absent', () => {
    const yaml = 'timestamp: 2026-04-29T10:00:00.000Z\noutcome: success\n'
    const result = parseRunRetries(yaml, 'test.yaml')
    expect(result?.retries).toEqual([])
  })

  it('parses a single resolved retry entry', () => {
    const yaml = `timestamp: 2026-04-29T10:00:00.000Z
qualityRetries:
  - page: "notifications"
    pageType: "app"
    attempts: 1
    resolved: true
    initialErrors:
      - type: "BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE"
        count: 1
    finalErrors: []
durationMs: 5000
`
    const result = parseRunRetries(yaml, 'test.yaml')
    expect(result?.retries).toHaveLength(1)
    expect(result?.retries[0]).toEqual({
      page: 'notifications',
      pageType: 'app',
      attempts: 1,
      resolved: true,
      initialErrors: [{ type: 'BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE', count: 1 }],
      finalErrors: [],
    })
  })

  it('parses unresolved retry with finalErrors populated', () => {
    const yaml = `timestamp: 2026-04-29T10:00:00.000Z
qualityRetries:
  - page: "calendar"
    pageType: "app"
    attempts: 2
    resolved: false
    initialErrors:
      - type: "BUTTON_AS_CELL_NO_VERTICAL_LAYOUT"
        count: 2
    finalErrors:
      - type: "BUTTON_AS_CELL_NO_VERTICAL_LAYOUT"
        count: 1
durationMs: 5000
`
    const result = parseRunRetries(yaml, 'test.yaml')
    expect(result?.retries[0].resolved).toBe(false)
    expect(result?.retries[0].attempts).toBe(2)
    expect(result?.retries[0].finalErrors).toEqual([{ type: 'BUTTON_AS_CELL_NO_VERTICAL_LAYOUT', count: 1 }])
  })

  it('parses multiple retry entries', () => {
    const yaml = `timestamp: 2026-04-29T10:00:00.000Z
qualityRetries:
  - page: "notifications"
    pageType: "app"
    attempts: 1
    resolved: true
    initialErrors:
      - type: "BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE"
        count: 1
    finalErrors: []
  - page: "calendar"
    pageType: "app"
    attempts: 2
    resolved: false
    initialErrors:
      - type: "BUTTON_AS_CELL_NO_VERTICAL_LAYOUT"
        count: 1
    finalErrors:
      - type: "BUTTON_AS_CELL_NO_VERTICAL_LAYOUT"
        count: 1
durationMs: 5000
`
    const result = parseRunRetries(yaml, 'test.yaml')
    expect(result?.retries).toHaveLength(2)
    expect(result?.retries[0].page).toBe('notifications')
    expect(result?.retries[1].page).toBe('calendar')
  })
})
