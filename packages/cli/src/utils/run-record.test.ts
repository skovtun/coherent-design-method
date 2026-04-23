import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { renderRunRecordYaml, writeRunRecord, writeRunRecordRel, type RunRecord } from './run-record.js'

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
