import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const HASHES_FILE = '.coherent/file-hashes.json'

export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8')
  return createHash('sha256').update(content).digest('hex')
}

export async function loadHashes(projectRoot: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(join(projectRoot, HASHES_FILE), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function saveHashes(projectRoot: string, hashes: Record<string, string>): Promise<void> {
  const dir = join(projectRoot, '.coherent')
  await mkdir(dir, { recursive: true })
  await writeFile(join(projectRoot, HASHES_FILE), JSON.stringify(hashes, null, 2) + '\n')
}

export async function isManuallyEdited(filePath: string, storedHash: string): Promise<boolean> {
  try {
    const currentHash = await computeFileHash(filePath)
    return currentHash !== storedHash
  } catch {
    return false
  }
}
