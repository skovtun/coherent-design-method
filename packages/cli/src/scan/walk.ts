/**
 * File traversal for `coherent scan`. Adapted from `commands/check.ts`
 * `findTsxFiles` pattern. Recursive, sync, skips dotfiles + standard
 * vendored/build dirs. Performance budget: <30s on 152-file logbaza per
 * PLAN.md gate.
 */

import { readdirSync, statSync } from 'fs'
import { resolve } from 'path'

const DEFAULT_EXCLUDES = new Set(['node_modules', 'vendor', 'storage', 'bootstrap', '.git', 'dist', 'build'])

export interface WalkOptions {
  extensions: string[]
  excludes?: Set<string>
}

export function walk(rootDir: string, opts: WalkOptions): string[] {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES
  const results: string[] = []
  walkInto(rootDir, opts.extensions, excludes, results)
  return results
}

function walkInto(dir: string, extensions: string[], excludes: Set<string>, results: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (excludes.has(entry)) continue
    const full = resolve(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkInto(full, extensions, excludes, results)
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      results.push(full)
    }
  }
}
