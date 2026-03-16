/**
 * Write Design System pages to project (full or shared-only).
 * Used by: components shared add (dopiska), ds regenerate (full).
 */

import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { DesignSystemGenerator } from '@getcoherent/core'
import type { DesignSystemConfig } from '@getcoherent/core'

const SHARED_DS_KEYS = [
  'app/design-system/shared/page.tsx',
  'app/design-system/shared/[id]/page.tsx',
  'app/api/design-system/shared-components/route.ts',
  'app/api/design-system/shared-components/[id]/route.ts',
]

export interface WriteDsFilesOptions {
  /** If true, only write shared-components related files (for zero-friction dopiska). */
  sharedOnly?: boolean
}

/**
 * Write Design System generated files to projectRoot.
 * When sharedOnly: true, only writes the 4 shared-related files (and does not touch layout/home/etc).
 */
export async function writeDesignSystemFiles(
  projectRoot: string,
  config: DesignSystemConfig,
  options?: WriteDsFilesOptions,
): Promise<string[]> {
  const generator = new DesignSystemGenerator(config)
  const files = generator.generateStructure()
  const toWrite = options?.sharedOnly ? new Map([...files].filter(([path]) => SHARED_DS_KEYS.includes(path))) : files
  const written: string[] = []
  for (const [relativePath, content] of toWrite) {
    const fullPath = join(projectRoot, relativePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
    written.push(relativePath)
  }
  return written
}
