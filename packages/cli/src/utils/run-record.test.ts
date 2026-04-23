import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  aggregateValidatorIssues,
  findLatestRunRecord,
  markLatestRunOutcome,
  renderRunRecordYaml,
  summarizeValidators,
  writeRunRecord,
  writeRunRecordRel,
  type RunRecord,
} from './run-record.js'

const baseRecord = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  timestamp: '2026-04-23T14:40:00.000Z',
  coherentVersion: '0.8.2',
  intent: 'build a CRM dashboard',
  options: { atmosphere: null, atmosphereOverride: false, dryRun: false },
  atmosphere: null,
  pagesWritten: [],
  sharedComponentsWritten: [],
  durationMs: 1000,
  outcome: 'success',
  ...overrides,
})

describe('renderRunRecordYaml', () => {
  it('emits the canonical YAML header', () => {
    const out = renderRunRecordYaml(baseRecord())
    expect(out).toContain('# coherent chat run — generation outcome record')
    expect(out).toContain('timestamp: 2026-04-23T14:40:00.000Z')
    expect(out).toContain('coherentVersion: "0.8.2"')
    expect(out).toContain('intent: "build a CRM dashboard"')
    expect(out).toContain('outcome: success')
  })

  it('escapes quotes and backslashes in intent + option values', () => {
    const out = renderRunRecordYaml(
      baseRecord({
        intent: 'say "hello" to the \\user',
        options: { atmosphere: 'with "quote"' },
      }),
    )
    expect(out).toContain('intent: "say \\"hello\\" to the \\\\user"')
    expect(out).toContain('atmosphere: "with \\"quote\\""')
  })

  it('writes atmosphere block when set', () => {
    const out = renderRunRecordYaml(
      baseRecord({
        atmosphere: {
          background: 'dark-zinc',
          heroLayout: 'split-text-image',
          spacing: 'tight',
          accents: 'monochrome',
          fontStyle: 'sans',
          primaryHint: 'zinc',
          moodPhrase: 'premium and focused',
        },
      }),
    )
    expect(out).toContain('atmosphere:')
    expect(out).toContain('  background: "dark-zinc"')
    expect(out).toContain('  primaryHint: "zinc"')
    expect(out).toContain('  moodPhrase: "premium and focused"')
  })

  it('writes `atmosphere: null` when not set', () => {
    const out = renderRunRecordYaml(baseRecord({ atmosphere: null }))
    expect(out).toContain('atmosphere: null')
    expect(out).not.toContain('background:')
  })

  it('renders empty pagesWritten / sharedComponentsWritten as []', () => {
    const out = renderRunRecordYaml(baseRecord())
    expect(out).toContain('pagesWritten: []')
    expect(out).toContain('sharedComponentsWritten: []')
  })

  it('renders file paths as a YAML list when populated', () => {
    const out = renderRunRecordYaml(
      baseRecord({
        pagesWritten: ['app/page.tsx', 'app/dashboard/page.tsx'],
        sharedComponentsWritten: ['components/shared/header.tsx'],
      }),
    )
    expect(out).toContain('pagesWritten:')
    expect(out).toContain('  - "app/page.tsx"')
    expect(out).toContain('  - "app/dashboard/page.tsx"')
    expect(out).toContain('sharedComponentsWritten:')
    expect(out).toContain('  - "components/shared/header.tsx"')
  })

  it('emits optional options only when truthy / defined', () => {
    const out = renderRunRecordYaml(
      baseRecord({ options: { atmosphere: 'dark-terminal', atmosphereOverride: true, dryRun: true } }),
    )
    expect(out).toContain('atmosphere: "dark-terminal"')
    expect(out).toContain('atmosphereOverride: true')
    expect(out).toContain('dryRun: true')
    expect(out).not.toContain('page:')
    expect(out).not.toContain('component:')
  })

  it('appends error line on error outcome', () => {
    const out = renderRunRecordYaml(baseRecord({ outcome: 'error', error: 'rate limited' }))
    expect(out).toContain('outcome: error')
    expect(out).toContain('error: "rate limited"')
  })

  it('never appends error line on success outcome', () => {
    const out = renderRunRecordYaml(baseRecord({ outcome: 'success' }))
    expect(out).not.toContain('error:')
  })

  it('ends with a trailing newline', () => {
    const out = renderRunRecordYaml(baseRecord())
    expect(out.endsWith('\n')).toBe(true)
  })
})

describe('writeRunRecord', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-run-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates .coherent/runs/ and writes timestamped YAML', () => {
    const path = writeRunRecord(dir, baseRecord())
    expect(path).not.toBeNull()
    expect(existsSync(path!)).toBe(true)
    expect(path!.endsWith('.yaml')).toBe(true)
    const files = readdirSync(join(dir, '.coherent', 'runs'))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^2026-04-23T14-40-00Z\.yaml$/)
  })

  it('written content round-trips to the renderer', () => {
    const record = baseRecord({ intent: 'x', pagesWritten: ['a.tsx'] })
    const path = writeRunRecord(dir, record)!
    const content = readFileSync(path, 'utf-8')
    expect(content).toBe(renderRunRecordYaml(record))
  })

  it('writeRunRecordRel returns a path relative to projectRoot', () => {
    const rel = writeRunRecordRel(dir, baseRecord())
    expect(rel).not.toBeNull()
    expect(rel!.startsWith('.coherent/runs/')).toBe(true)
    expect(rel!.endsWith('.yaml')).toBe(true)
  })
})

describe('aggregateValidatorIssues', () => {
  it('returns empty for no issues', () => {
    expect(aggregateValidatorIssues([])).toEqual([])
  })

  it('groups identical type + severity into a count', () => {
    const result = aggregateValidatorIssues([
      { type: 'BROKEN_INTERNAL_LINK', severity: 'warning' },
      { type: 'BROKEN_INTERNAL_LINK', severity: 'warning' },
      { type: 'BROKEN_INTERNAL_LINK', severity: 'warning' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'BROKEN_INTERNAL_LINK', severity: 'warning', count: 3 })
  })

  it('keeps different types separate', () => {
    const result = aggregateValidatorIssues([
      { type: 'TABLE_COL_MISMATCH', severity: 'error' },
      { type: 'BROKEN_INTERNAL_LINK', severity: 'warning' },
    ])
    expect(result).toHaveLength(2)
  })

  it('keeps same type at different severity separate', () => {
    const result = aggregateValidatorIssues([
      { type: 'HARDCODED_COLOR', severity: 'error' },
      { type: 'HARDCODED_COLOR', severity: 'warning' },
    ])
    expect(result).toHaveLength(2)
    const severities = result.map(r => r.severity)
    expect(severities).toContain('error')
    expect(severities).toContain('warning')
  })

  it('sorts errors first, warnings second, infos last; alphabetical within severity', () => {
    const result = aggregateValidatorIssues([
      { type: 'Z_INFO', severity: 'info' },
      { type: 'B_WARN', severity: 'warning' },
      { type: 'A_WARN', severity: 'warning' },
      { type: 'C_ERROR', severity: 'error' },
    ])
    expect(result.map(r => r.type)).toEqual(['C_ERROR', 'A_WARN', 'B_WARN', 'Z_INFO'])
  })
})

describe('summarizeValidators', () => {
  it('returns undefined for empty input', () => {
    expect(summarizeValidators(undefined)).toBeUndefined()
    expect(summarizeValidators([])).toBeUndefined()
  })

  it('sums counts by severity across all pages', () => {
    const summary = summarizeValidators([
      {
        page: 'app/page.tsx',
        issues: [
          { type: 'A', severity: 'error', count: 2 },
          { type: 'B', severity: 'warning', count: 3 },
        ],
      },
      {
        page: 'app/dashboard/page.tsx',
        issues: [
          { type: 'A', severity: 'error', count: 1 },
          { type: 'C', severity: 'info', count: 5 },
        ],
      },
    ])
    expect(summary).toEqual({ errors: 3, warnings: 3, infos: 5 })
  })
})

describe('renderRunRecordYaml — validators', () => {
  const withValidators = baseRecord({
    validators: [
      {
        page: 'app/page.tsx',
        issues: [{ type: 'BROKEN_INTERNAL_LINK', severity: 'warning', count: 2 }],
      },
    ],
    validatorSummary: { errors: 0, warnings: 2, infos: 0 },
  })

  it('renders validators block with per-page issues', () => {
    const out = renderRunRecordYaml(withValidators)
    expect(out).toContain('validators:')
    expect(out).toContain('  - page: "app/page.tsx"')
    expect(out).toContain('    issues:')
    expect(out).toContain('      - type: "BROKEN_INTERNAL_LINK"')
    expect(out).toContain('        severity: warning')
    expect(out).toContain('        count: 2')
  })

  it('renders validatorSummary block', () => {
    const out = renderRunRecordYaml(withValidators)
    expect(out).toContain('validatorSummary:')
    expect(out).toContain('  errors: 0')
    expect(out).toContain('  warnings: 2')
    expect(out).toContain('  infos: 0')
  })

  it('renders `validators: []` when absent', () => {
    const out = renderRunRecordYaml(baseRecord())
    expect(out).toContain('validators: []')
    expect(out).not.toContain('validatorSummary:')
  })

  it('renders `issues: []` for a page with no findings', () => {
    const out = renderRunRecordYaml(
      baseRecord({
        validators: [{ page: 'app/clean/page.tsx', issues: [] }],
      }),
    )
    expect(out).toContain('  - page: "app/clean/page.tsx"')
    expect(out).toContain('    issues: []')
  })
})

describe('findLatestRunRecord / markLatestRunOutcome', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-mark-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns null when .coherent/runs/ does not exist', () => {
    expect(findLatestRunRecord(dir)).toBeNull()
    expect(markLatestRunOutcome(dir, 'kept')).toBeNull()
  })

  it('finds the most recent run and marks it as kept', () => {
    // Older run
    const older = writeRunRecord(dir, baseRecord({ timestamp: '2026-04-20T10:00:00.000Z', outcome: 'success' }))!
    // Newer run
    const newer = writeRunRecord(dir, baseRecord({ timestamp: '2026-04-23T10:00:00.000Z', outcome: 'success' }))!
    // Force mtime ordering deterministically (mkdtemp writes can be same-ms)
    const now = Date.now()
    require('fs').utimesSync(older, (now - 1000) / 1000, (now - 1000) / 1000)
    require('fs').utimesSync(newer, now / 1000, now / 1000)

    const latest = findLatestRunRecord(dir)
    expect(latest).toBe(newer)

    const result = markLatestRunOutcome(dir, 'kept')
    expect(result).not.toBeNull()
    expect(result!.previous).toBe('success')
    expect(result!.rel).toMatch(/^\.coherent\/runs\//)

    const updated = readFileSync(newer, 'utf-8')
    expect(updated).toContain('outcome: kept')
    expect(updated).not.toMatch(/outcome:\s+success/)

    // Older file untouched
    const olderContent = readFileSync(older, 'utf-8')
    expect(olderContent).toContain('outcome: success')
  })

  it('marks as rejected and preserves all other fields', () => {
    const path = writeRunRecord(
      dir,
      baseRecord({
        intent: 'build a dashboard',
        outcome: 'success',
        pagesWritten: ['app/page.tsx'],
      }),
    )!
    const result = markLatestRunOutcome(dir, 'rejected')
    expect(result).not.toBeNull()
    expect(result!.previous).toBe('success')

    const updated = readFileSync(path, 'utf-8')
    expect(updated).toContain('outcome: rejected')
    expect(updated).toContain('intent: "build a dashboard"')
    expect(updated).toContain('  - "app/page.tsx"')
  })

  it('is idempotent — marking twice produces identical file on second call', () => {
    writeRunRecord(dir, baseRecord({ outcome: 'success' }))!
    markLatestRunOutcome(dir, 'kept')
    const path = findLatestRunRecord(dir)!
    const first = readFileSync(path, 'utf-8')
    markLatestRunOutcome(dir, 'kept')
    const second = readFileSync(path, 'utf-8')
    expect(second).toBe(first)
  })
})
