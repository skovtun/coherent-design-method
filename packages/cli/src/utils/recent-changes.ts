/**
 * Recent changes history for status command
 * Stored in .coherent/recent-changes.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'

export interface RecentChange {
  type: string
  description: string
  timestamp: string // ISO
}

const MAX_ENTRIES = 20
const FILENAME = 'recent-changes.json'

function getChangesPath(projectRoot: string): string {
  return resolve(projectRoot, '.coherent', FILENAME)
}

/**
 * Read recent changes (newest first)
 */
export function readRecentChanges(projectRoot: string): RecentChange[] {
  const path = getChangesPath(projectRoot)
  if (!existsSync(path)) {
    return []
  }
  try {
    const data = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(data) as RecentChange[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Append one or more changes (newest at start of array)
 */
export function appendRecentChanges(projectRoot: string, changes: RecentChange[]): void {
  const dir = dirname(getChangesPath(projectRoot))
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const path = getChangesPath(projectRoot)
  const existing = readRecentChanges(projectRoot)
  const combined = [...changes, ...existing].slice(0, MAX_ENTRIES)
  writeFileSync(path, JSON.stringify(combined, null, 2), 'utf-8')
}

/**
 * Format timestamp as "X minutes ago" / "X hours ago" / "X days ago"
 */
export function formatTimeAgo(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return date.toLocaleDateString()
}
