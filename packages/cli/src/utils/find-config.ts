/**
 * Find Design System Config
 *
 * Searches for design-system.config.ts in current directory and parent directories
 * (similar to how git finds .git directory).
 */

import { existsSync } from 'fs'
import { resolve, dirname, parse } from 'path'
import { cwd } from 'process'
import { tmpdir } from 'os'
import chalk from 'chalk'

export interface ProjectInfo {
  root: string
  configPath: string
}

const VOLATILE_DIRS = ['/tmp', '/private/tmp', '/var/tmp']

/**
 * Check if a directory is volatile (e.g. /tmp) where files may be cleaned up by the OS.
 */
export function isVolatileDirectory(dir: string): boolean {
  const resolved = resolve(dir)
  const sysTmp = resolve(tmpdir())
  if (resolved.startsWith(sysTmp)) return true
  return VOLATILE_DIRS.some(v => resolved.startsWith(v))
}

/**
 * Print a warning if the project resides in a volatile directory.
 */
export function warnIfVolatile(projectRoot: string): void {
  if (isVolatileDirectory(projectRoot)) {
    console.log('')
    console.log(chalk.yellow('⚠ WARNING: This project is inside a temporary directory.'))
    console.log(chalk.yellow('  Your OS may automatically delete files from this location.'))
    console.log(chalk.dim(`  Project path: ${projectRoot}`))
    console.log(chalk.dim('  Move your project to a permanent location to avoid data loss:'))
    console.log(chalk.dim(`  cp -r "${projectRoot}" ~/projects/\n`))
  }
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

/**
 * Print a standardized "not a Coherent project" error and exit.
 */
export function exitNotCoherent(): never {
  const resolved = resolve(cwd())
  console.error(chalk.red('❌ Not a Coherent project'))

  if (isVolatileDirectory(resolved)) {
    console.log(chalk.yellow('⚠ This directory is inside /tmp — the OS may have cleaned up your files.'))
    console.log(chalk.dim('  macOS periodically removes files from /tmp. Use a permanent directory next time.'))
  }

  console.log(chalk.dim('Run coherent init first, or cd into a project directory.\n'))
  process.exit(1)
}
