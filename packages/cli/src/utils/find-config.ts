/**
 * Find Design System Config
 * 
 * Searches for design-system.config.ts in current directory and parent directories
 * (similar to how git finds .git directory).
 */

import { existsSync } from 'fs'
import { resolve, dirname, parse } from 'path'
import { cwd } from 'process'

export interface ProjectInfo {
  root: string
  configPath: string
}

/**
 * Find design-system.config.ts starting from startDir and searching upward
 */
export function findConfig(startDir: string = cwd()): ProjectInfo | null {
  try {
    let dir = resolve(startDir)
    const root = parse(dir).root // '/' on Unix, 'C:\\' on Windows

    // Search up the directory tree until we hit filesystem root
    while (dir !== root) {
      const configPath = resolve(dir, 'design-system.config.ts')

      if (existsSync(configPath)) {
        return {
          root: dir,
          configPath,
        }
      }

      // Move to parent directory
      const parentDir = dirname(dir)
      if (parentDir === dir) {
        // Reached root, stop
        break
      }
      dir = parentDir
    }

    return null
  } catch (error: any) {
    // Handle case when directory is inaccessible (e.g., was deleted)
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return null
    }
    throw error
  }
}

/**
 * Get project root or throw error
 */
export function getProjectRoot(startDir?: string): string {
  const project = findConfig(startDir)
  if (!project) {
    throw new Error('Not a Coherent project')
  }
  return project.root
}
