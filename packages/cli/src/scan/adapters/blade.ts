/**
 * Blade adapter — delegates to grep-blade L1 extractors. Internal type
 * per D1 softening (PLAN.md). When TSX adapter lands at Phase E, the
 * `StackAdapter` interface graduates to public API.
 */

import { extractBlade } from '../grep-blade.js'
import type { StackAdapter, EvidenceRow } from './types.js'

export const bladeAdapter: StackAdapter = {
  name: 'blade',
  filePatterns: ['.blade.php'],
  excludes: ['node_modules', 'vendor', 'storage', 'bootstrap', '.git', 'dist', 'build'],
  extract(filePath: string, contents: string): EvidenceRow[] {
    return extractBlade(filePath, contents)
  },
}
