import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

vi.mock('../providers/index.js', () => ({
  getComponentProvider: () => ({
    listNames: () => ['button', 'card', 'input', 'dialog'],
    installBatch: vi.fn(async (ids: string[], projectRoot: string) => {
      const results = new Map()
      for (const id of ids) {
        mkdirSync(path.join(projectRoot, 'components', 'ui'), { recursive: true })
        writeFileSync(path.join(projectRoot, 'components', 'ui', `${id}.tsx`), `export function ${id}() {}`)
        results.set(id, { success: true, componentDef: { id } })
      }
      return results
    }),
  }),
}))

import { migrateAction } from './migrate.js'

describe('coherent migrate', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'migrate-'))
    mkdirSync(path.join(tmpDir, 'components', 'ui'), { recursive: true })
    writeFileSync(path.join(tmpDir, 'design-system.config.ts'), 'export default {}')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('lists migratable components in dry-run', async () => {
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'export function Button() {}')
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'card.tsx'), 'export function Card() {}')

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')))

    await migrateAction({ dryRun: true, projectRoot: tmpDir })

    const output = logs.join('\n')
    expect(output).toContain('button')
    expect(output).toContain('card')
    expect(output).toContain('dry-run')
  })

  it('creates backup before migration', async () => {
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'button.tsx'), 'export function Button() {}')

    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await migrateAction({ yes: true, projectRoot: tmpDir })

    const backupsDir = path.join(tmpDir, '.coherent', 'backups')
    expect(existsSync(backupsDir)).toBe(true)
    const backups = readdirSync(backupsDir)
    expect(backups.length).toBe(1)
    expect(backups[0]).toMatch(/^pre-migrate-/)
  })

  it('rollback restores from backup', async () => {
    const uiDir = path.join(tmpDir, 'components', 'ui')
    writeFileSync(path.join(uiDir, 'button.tsx'), 'original content')

    const backupBase = path.join(tmpDir, '.coherent', 'backups', 'pre-migrate-test')
    mkdirSync(path.join(backupBase, 'components-ui'), { recursive: true })
    writeFileSync(path.join(backupBase, 'components-ui', 'button.tsx'), 'original content')

    mkdirSync(path.join(tmpDir, '.coherent'), { recursive: true })
    writeFileSync(path.join(tmpDir, '.coherent', 'migration-in-progress'), JSON.stringify({ backup: backupBase }))

    writeFileSync(path.join(uiDir, 'button.tsx'), 'modified content')

    vi.spyOn(console, 'log').mockImplementation(() => {})

    await migrateAction({ rollback: true, projectRoot: tmpDir })

    expect(readFileSync(path.join(uiDir, 'button.tsx'), 'utf-8')).toBe('original content')
    expect(existsSync(path.join(tmpDir, '.coherent', 'migration-in-progress'))).toBe(false)
  })

  it('prevents concurrent migration', async () => {
    mkdirSync(path.join(tmpDir, '.coherent'), { recursive: true })
    writeFileSync(
      path.join(tmpDir, '.coherent', 'migration-in-progress'),
      JSON.stringify({ backup: '/tmp/old-backup' }),
    )

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')))

    await migrateAction({ projectRoot: tmpDir })

    expect(logs.join('\n')).toContain('already in progress')
  })

  it('reports nothing to migrate when no managed components exist', async () => {
    writeFileSync(path.join(tmpDir, 'components', 'ui', 'custom-widget.tsx'), 'export function CustomWidget() {}')

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')))

    await migrateAction({ projectRoot: tmpDir })

    expect(logs.join('\n')).toContain('up to date')
  })
})
