import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createBackup, listBackups, restoreBackup } from './backup.js'

describe('backup', () => {
  const testDir = join(tmpdir(), 'coherent-backup-test-' + Date.now())

  beforeEach(() => {
    mkdirSync(join(testDir, 'app'), { recursive: true })
    mkdirSync(join(testDir, 'components'), { recursive: true })
    writeFileSync(join(testDir, 'design-system.config.ts'), 'export const config = {}')
    writeFileSync(join(testDir, 'package.json'), '{"name":"test"}')
    writeFileSync(join(testDir, 'app', 'page.tsx'), 'export default function Home() { return <div>Home</div> }')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('creates a backup with critical files', () => {
    const backupPath = createBackup(testDir)
    expect(backupPath).not.toBeNull()
    expect(existsSync(join(backupPath!, 'design-system.config.ts'))).toBe(true)
    expect(existsSync(join(backupPath!, 'package.json'))).toBe(true)
    expect(existsSync(join(backupPath!, 'app', 'page.tsx'))).toBe(true)
  })

  it('lists backups in reverse chronological order', () => {
    createBackup(testDir)
    const backups = listBackups(testDir)
    expect(backups.length).toBe(1)
    expect(backups[0].files).toBeGreaterThan(0)
  })

  it('restores a backup correctly', () => {
    createBackup(testDir)

    writeFileSync(join(testDir, 'app', 'page.tsx'), 'CORRUPTED')

    const backups = listBackups(testDir)
    const ok = restoreBackup(testDir, backups[0].name)
    expect(ok).toBe(true)

    const restored = readFileSync(join(testDir, 'app', 'page.tsx'), 'utf-8')
    expect(restored).toContain('Home')
  })

  it('returns empty list when no backups exist', () => {
    const backups = listBackups(testDir)
    expect(backups).toEqual([])
  })

  it('returns false when restoring non-existent backup', () => {
    const ok = restoreBackup(testDir, 'non-existent')
    expect(ok).toBe(false)
  })
})
