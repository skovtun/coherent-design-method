/**
 * Atomic file write: writes to a temp file first, then renames.
 * Prevents data corruption if the process crashes mid-write.
 */

import { writeFile, rename, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { randomBytes } from 'crypto'

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmpPath, content, 'utf-8')
  await rename(tmpPath, filePath)
}
