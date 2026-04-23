import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { memoryShowCommand, memoryDiffCommand } from './memory.js'

const MINIMAL_CONFIG = `export const config = {
  meta: { name: 'Test', version: '0.1.0' },
  tokens: { color: {}, typography: {}, spacing: {} },
  components: [],
} as const
`

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '')
}

describe('memoryShowCommand', () => {
  let dir: string
  let logs: string[]
  let origLog: typeof console.log

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-mem-show-'))
    writeFileSync(join(dir, 'design-system.config.ts'), MINIMAL_CONFIG)
    logs = []
    origLog = console.log
    console.log = (...args: unknown[]) => logs.push(stripAnsi(args.map(String).join(' ')))
  })

  afterEach(() => {
    console.log = origLog
    rmSync(dir, { recursive: true, force: true })
  })

  const out = () => logs.join('\n')

  it('prints an empty-state for all three sections when nothing exists', async () => {
    await memoryShowCommand({ _projectRoot: dir })
    const o = out()
    expect(o).toContain('Coherent memory for this project')
    expect(o).toContain('Design memory')
    expect(o).toContain('no decisions yet')
    expect(o).toContain('Recent runs')
    expect(o).toContain('(none')
  })

  it('reads shared components from coherent.components.json (not design-system.config)', async () => {
    writeFileSync(
      join(dir, 'coherent.components.json'),
      JSON.stringify({
        shared: [
          {
            id: 'CID-001',
            name: 'StatCard',
            type: 'widget',
            file: 'components/shared/stat-card.tsx',
            usedIn: ['app/(app)/dashboard/page.tsx', 'app/(app)/analytics/page.tsx'],
          },
          {
            id: 'CID-002',
            name: 'Header',
            type: 'layout',
            file: 'components/shared/header.tsx',
            usedIn: [],
          },
        ],
        nextId: 3,
      }),
    )
    await memoryShowCommand({ _projectRoot: dir })
    const o = out()
    expect(o).toContain('Shared components')
    expect(o).toContain('CID-001')
    expect(o).toContain('StatCard')
    expect(o).toContain('(widget, used on 2 pages)')
    expect(o).toContain('CID-002')
    expect(o).toContain('Header')
    expect(o).toContain('(layout, used on 0 pages)')
  })

  it('shows "(none yet)" when manifest exists but has no shared components', async () => {
    writeFileSync(join(dir, 'coherent.components.json'), JSON.stringify({ shared: [], nextId: 1 }))
    await memoryShowCommand({ _projectRoot: dir })
    expect(out()).toContain('(none yet)')
  })

  it('prints decisions.md content when present', async () => {
    mkdirSync(join(dir, '.coherent/wiki'), { recursive: true })
    writeFileSync(
      join(dir, '.coherent/wiki/decisions.md'),
      '# Design Decisions\n\n## 2026-04-23\n\n### Home (/)\n- Container: max-w-6xl mx-auto\n- Palette: bg-primary, text-foreground\n',
    )
    await memoryShowCommand({ _projectRoot: dir })
    const o = out()
    expect(o).toContain('Design Decisions')
    expect(o).toContain('Container: max-w-6xl mx-auto')
    expect(o).toContain('Palette: bg-primary, text-foreground')
    expect(o).not.toContain('no decisions yet')
  })

  it('lists recent run records newest-first', async () => {
    mkdirSync(join(dir, '.coherent/runs'), { recursive: true })
    // Older run
    writeFileSync(
      join(dir, '.coherent/runs', '2026-04-20T10-00-00Z.yaml'),
      [
        '# coherent chat run — generation outcome record',
        'timestamp: 2026-04-20T10:00:00.000Z',
        'coherentVersion: "0.8.2"',
        'intent: "build a CRM dashboard"',
        'outcome: success',
        'durationMs: 1500',
        'atmosphere: null',
        'pagesWritten: []',
        'sharedComponentsWritten: []',
        '',
      ].join('\n'),
    )
    // Newer run
    writeFileSync(
      join(dir, '.coherent/runs', '2026-04-23T09-00-00Z.yaml'),
      [
        '# coherent chat run — generation outcome record',
        'timestamp: 2026-04-23T09:00:00.000Z',
        'coherentVersion: "0.8.2"',
        'intent: "regenerate pricing"',
        'outcome: error',
        'durationMs: 900',
        'atmosphere:',
        '  background: "dark-zinc"',
        'pagesWritten: []',
        'sharedComponentsWritten: []',
        'error: "rate limited"',
        '',
      ].join('\n'),
    )

    await memoryShowCommand({ _projectRoot: dir })
    const o = out()

    expect(o).toContain('Recent runs')
    expect(o).toContain('regenerate pricing')
    expect(o).toContain('build a CRM dashboard')
    expect(o).toContain('dark-zinc')

    // Newest-first ordering: the newer timestamp appears before the older one
    const idxNewer = o.indexOf('regenerate pricing')
    const idxOlder = o.indexOf('build a CRM dashboard')
    expect(idxNewer).toBeGreaterThan(-1)
    expect(idxOlder).toBeGreaterThan(-1)
    expect(idxNewer).toBeLessThan(idxOlder)
  })

  it('caps run record listing at 5 entries', async () => {
    mkdirSync(join(dir, '.coherent/runs'), { recursive: true })
    for (let i = 0; i < 7; i++) {
      const iso = `2026-04-2${String((i % 9) + 1)}T10-00-00Z`
      writeFileSync(
        join(dir, '.coherent/runs', `${iso}.yaml`),
        [
          '# coherent chat run',
          `timestamp: 2026-04-2${(i % 9) + 1}T10:00:00.000Z`,
          'coherentVersion: "0.8.2"',
          `intent: "run number ${i}"`,
          'outcome: success',
          'durationMs: 100',
          'atmosphere: null',
          'pagesWritten: []',
          'sharedComponentsWritten: []',
          '',
        ].join('\n'),
      )
    }
    await memoryShowCommand({ _projectRoot: dir })
    const o = out()
    const matches = o.match(/run number \d/g) || []
    expect(matches.length).toBeLessThanOrEqual(5)
  })
})

describe('memoryDiffCommand', () => {
  let dir: string
  let origLog: typeof console.log
  let origErr: typeof console.error

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coherent-mem-diff-'))
    origLog = console.log
    origErr = console.error
    console.log = () => {}
    console.error = () => {}
  })

  afterEach(() => {
    console.log = origLog
    console.error = origErr
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws when decisions.md does not exist (with _throwOnError)', async () => {
    await expect(memoryDiffCommand(undefined, { _projectRoot: dir, _throwOnError: true })).rejects.toThrow(
      'No design memory',
    )
  })

  it('throws when project is not a git repo (with _throwOnError)', async () => {
    mkdirSync(join(dir, '.coherent/wiki'), { recursive: true })
    writeFileSync(join(dir, '.coherent/wiki/decisions.md'), '# Design Decisions\n')
    await expect(memoryDiffCommand(undefined, { _projectRoot: dir, _throwOnError: true })).rejects.toThrow(
      'Not a git repo',
    )
  })

  it('returns silently with "No changes" when decisions.md is committed and unchanged', async () => {
    mkdirSync(join(dir, '.coherent/wiki'), { recursive: true })
    writeFileSync(join(dir, '.coherent/wiki/decisions.md'), '# Design Decisions\n\n## 2026-04-23\n- fact\n')

    // Init real git repo + commit
    const gitRun = (args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf-8' })
    gitRun(['init', '-q'])
    gitRun(['config', 'user.email', 'test@example.com'])
    gitRun(['config', 'user.name', 'Test'])
    gitRun(['add', '-A'])
    gitRun(['commit', '-q', '-m', 'init'])

    const captured: string[] = []
    console.log = (...args: unknown[]) => captured.push(stripAnsi(args.map(String).join(' ')))
    await memoryDiffCommand(undefined, { _projectRoot: dir, _throwOnError: true })
    expect(captured.join('\n')).toContain('No changes')
  })

  it('prints a diff when decisions.md has uncommitted changes', async () => {
    mkdirSync(join(dir, '.coherent/wiki'), { recursive: true })
    writeFileSync(join(dir, '.coherent/wiki/decisions.md'), '# Design Decisions\n\n## 2026-04-23\n- original\n')
    const gitRun = (args: string[]) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf-8' })
    gitRun(['init', '-q'])
    gitRun(['config', 'user.email', 'test@example.com'])
    gitRun(['config', 'user.name', 'Test'])
    gitRun(['add', '-A'])
    gitRun(['commit', '-q', '-m', 'init'])

    // Mutate decisions.md after commit
    writeFileSync(join(dir, '.coherent/wiki/decisions.md'), '# Design Decisions\n\n## 2026-04-23\n- changed\n')

    const captured: string[] = []
    console.log = (...args: unknown[]) => captured.push(stripAnsi(args.map(String).join(' ')))
    await memoryDiffCommand(undefined, { _projectRoot: dir, _throwOnError: true })
    const joined = captured.join('\n')
    expect(joined).toContain('Decisions diff')
    expect(joined).toMatch(/-\s*original/)
    expect(joined).toMatch(/\+\s*-?\s*changed/)
  })
})
