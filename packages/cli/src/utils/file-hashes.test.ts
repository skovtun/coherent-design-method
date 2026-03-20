import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { computeFileHash, loadHashes, saveHashes, isManuallyEdited } from './file-hashes.js'

describe('file-hashes', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hashes-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('computes consistent SHA-256 hash for a file', async () => {
    const filePath = join(tempDir, 'test.tsx')
    writeFileSync(filePath, 'export default function Page() { return <div>Hello</div> }')
    const hash1 = await computeFileHash(filePath)
    const hash2 = await computeFileHash(filePath)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('saves and loads hashes', async () => {
    const hashes = { 'components/shared/header.tsx': 'abc123' }
    await saveHashes(tempDir, hashes)
    const loaded = await loadHashes(tempDir)
    expect(loaded).toEqual(hashes)
  })

  it('returns empty object when no hashes file exists', async () => {
    const loaded = await loadHashes(tempDir)
    expect(loaded).toEqual({})
  })

  it('detects manually edited file', async () => {
    const filePath = join(tempDir, 'page.tsx')
    writeFileSync(filePath, 'original content')
    const hash = await computeFileHash(filePath)
    writeFileSync(filePath, 'edited content')
    const edited = await isManuallyEdited(filePath, hash)
    expect(edited).toBe(true)
  })

  it('returns false for unmodified file', async () => {
    const filePath = join(tempDir, 'page.tsx')
    writeFileSync(filePath, 'original content')
    const hash = await computeFileHash(filePath)
    const edited = await isManuallyEdited(filePath, hash)
    expect(edited).toBe(false)
  })
})
