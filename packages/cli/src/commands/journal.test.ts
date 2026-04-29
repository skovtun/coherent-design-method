import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pruneJournalSessions, parseRunRetries, aggregateRetries, type ParsedRetry } from './journal.js'

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

// v0.15.4 — codex flagged that the inline retry aggregator was using
// page-level `resolved` for every initial validator, which conflated
// per-validator outcomes. Test the extracted aggregateRetries() with
// the exact mixed scenario codex described.
describe('aggregateRetries (v0.15.4 per-validator resolution)', () => {
  const makeRetry = (over: Partial<ParsedRetry>): ParsedRetry => ({
    page: 'p',
    pageType: 'app',
    attempts: 1,
    resolved: false,
    initialErrors: [],
    finalErrors: [],
    ...over,
  })

  it('returns empty when no retries', () => {
    expect(aggregateRetries([])).toEqual([])
  })

  it('counts a single resolved retry correctly', () => {
    const rows = aggregateRetries([
      makeRetry({
        initialErrors: [{ type: 'A', count: 1 }],
        finalErrors: [],
        attempts: 1,
        resolved: true,
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'A', pageCount: 1, resolvedPageCount: 1, avgAttempts: 1 })
  })

  it('counts a single unresolved retry correctly', () => {
    const rows = aggregateRetries([
      makeRetry({
        initialErrors: [{ type: 'A', count: 1 }],
        finalErrors: [{ type: 'A', count: 1 }],
        attempts: 2,
        resolved: false,
      }),
    ])
    expect(rows[0]).toMatchObject({ pageCount: 1, resolvedPageCount: 0, avgAttempts: 2 })
  })

  // The exact codex-flagged scenario: page started with A+B,
  // ended with only B. A must be resolved, B must be unresolved.
  // Old aggregator used page-level resolved=false → both unresolved.
  it('mixed initial/final: per-validator resolution is correct', () => {
    const rows = aggregateRetries([
      makeRetry({
        initialErrors: [
          { type: 'A', count: 1 },
          { type: 'B', count: 1 },
        ],
        finalErrors: [{ type: 'B', count: 1 }], // A resolved, B persisted
        attempts: 2,
        resolved: false, // page-level: there are still errors, so not "fully resolved"
      }),
    ])
    const a = rows.find(r => r.type === 'A')!
    const b = rows.find(r => r.type === 'B')!
    expect(a.resolvedPageCount).toBe(1) // A no longer in finalErrors
    expect(b.resolvedPageCount).toBe(0) // B still in finalErrors
    expect(a.pageCount).toBe(1)
    expect(b.pageCount).toBe(1)
  })

  it('aggregates the same validator across multiple pages', () => {
    const rows = aggregateRetries([
      makeRetry({ page: 'p1', initialErrors: [{ type: 'A', count: 1 }], finalErrors: [], attempts: 1 }),
      makeRetry({
        page: 'p2',
        initialErrors: [{ type: 'A', count: 2 }],
        finalErrors: [{ type: 'A', count: 1 }],
        attempts: 2,
      }),
    ])
    const a = rows[0]
    expect(a.type).toBe('A')
    expect(a.pageCount).toBe(2)
    expect(a.resolvedPageCount).toBe(1) // only p1 cleared A
    expect(a.totalRetryCount).toBe(3) // 1 + 2 initial counts
    expect(a.avgAttempts).toBe(1.5)
  })

  it('deduplicates same validator type within one retry entry', () => {
    // Two initialErrors entries for the same type (e.g., grouped by line).
    // Should count the page once, not twice.
    const rows = aggregateRetries([
      makeRetry({
        initialErrors: [
          { type: 'A', count: 1 },
          { type: 'A', count: 2 },
        ],
        finalErrors: [],
        attempts: 1,
      }),
    ])
    expect(rows[0].pageCount).toBe(1)
  })
})
