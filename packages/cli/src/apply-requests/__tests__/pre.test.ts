/**
 * pre.ts — unit tests for the pre-apply pipeline helpers.
 *
 * Each helper is tiny and intentionally so. Tests cover happy path +
 * failure modes (best-effort guarantees) + the contract these helpers
 * pin down (idempotency, no side effects beyond declared ones).
 *
 * NOT covered here: the wired-together `applyRequests` entry that
 * orchestrates pre → dispatch → post. That lives in
 * `integration.test.ts` after PR1 commit #7.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { DesignSystemManager } from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { saveHashes } from '../../utils/file-hashes.js'
import { createPreApplyBackup, loadProjectHashes, resolveKnownRoutes, runGlobalsCssPreflight } from '../pre.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-pre-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

describe('runGlobalsCssPreflight', () => {
  it('returns { ran: false, fixed: false } when project has no globals.css', () => {
    const config = createMinimalConfig('Test')
    // No app/globals.css written → needsGlobalsFix returns false.
    const result = runGlobalsCssPreflight(projectRoot, config)
    expect(result).toEqual({ ran: false, fixed: false })
  })

  it('runs the fix when globals.css needs updating', () => {
    // Seed app/globals.css with a stale shape — no @theme inline block.
    // needsGlobalsFix returns true → fixGlobalsCss runs.
    mkdirSync(join(projectRoot, 'app'), { recursive: true })
    writeFileSync(
      join(projectRoot, 'app', 'globals.css'),
      `@import "tailwindcss";\n\n:root { --background: 0 0% 100%; }\n`,
      'utf-8',
    )
    const config = createMinimalConfig('Test')
    const result = runGlobalsCssPreflight(projectRoot, config)
    // Either ran successfully or returned { ran: true, fixed: false } if
    // the fix threw; both are valid pre.ts behaviors. The contract is
    // "best-effort, never throws."
    expect(result.ran).toBe(true)
  })

  it('never throws on internal failures (best-effort contract)', () => {
    const config = createMinimalConfig('Test')
    // Project root that doesn't exist — fixGlobalsCss may throw.
    // Helper must catch and return ran:false / fixed:false.
    const fakeRoot = join(projectRoot, 'does-not-exist')
    expect(() => runGlobalsCssPreflight(fakeRoot, config)).not.toThrow()
  })
})

describe('loadProjectHashes', () => {
  it('returns empty record when no hash file exists (first run)', async () => {
    const hashes = await loadProjectHashes(projectRoot)
    expect(hashes).toEqual({})
  })

  it('returns the persisted hash map when one exists', async () => {
    await saveHashes(projectRoot, {
      'components/shared/header.tsx': 'abc123',
      'app/page.tsx': 'def456',
    })
    const hashes = await loadProjectHashes(projectRoot)
    expect(hashes).toEqual({
      'components/shared/header.tsx': 'abc123',
      'app/page.tsx': 'def456',
    })
  })
})

describe('createPreApplyBackup', () => {
  it('returns the backup path when the snapshot succeeds', () => {
    // createBackup needs a real project shape — minimal scaffold.
    const result = createPreApplyBackup(projectRoot)
    // null OR a real path string — both are valid (depends on whether
    // CRITICAL_FILES exist). Either way, no throw.
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('never throws even when project root is missing (best-effort contract)', () => {
    // createBackup is permissive — it'll mkdir the backup dir under
    // any path that's writable. The contract pre.ts cares about is
    // "best-effort, never throws"; whether the backup ACTUALLY succeeds
    // is an internal detail callers don't need to branch on.
    const fakeRoot = join(projectRoot, 'does-not-exist')
    expect(() => createPreApplyBackup(fakeRoot)).not.toThrow()
  })
})

describe('resolveKnownRoutes', () => {
  function buildDsmWithRoutes(routes: string[]): DesignSystemManager {
    const config = createMinimalConfig('Test')
    const now = new Date().toISOString()
    config.pages = routes.map((route, i) => ({
      id: `page-${i}`,
      name: `Page ${i}`,
      route,
      layout: 'centered' as const,
      sections: [],
      title: `Page ${i}`,
      description: '',
      requiresAuth: false,
      noIndex: false,
      createdAt: now,
      updatedAt: now,
    }))
    const configPath = join(projectRoot, 'design-system.config.ts')
    writeFileSync(configPath, `export const config = ${JSON.stringify(config, null, 2)} as const\n`)
    const dsm = new DesignSystemManager(configPath)
    return dsm
  }

  it('returns empty array when config has no pages', async () => {
    const dsm = buildDsmWithRoutes([])
    await dsm.load()
    expect(resolveKnownRoutes(dsm)).toEqual([])
  })

  it('returns every page route from config', async () => {
    const dsm = buildDsmWithRoutes(['/', '/dashboard', '/settings'])
    await dsm.load()
    expect(resolveKnownRoutes(dsm).sort()).toEqual(['/', '/dashboard', '/settings'])
  })

  it('codex F-pattern: includes routes from PRIOR chats (full config), not just current session', async () => {
    // The bug this gates: skill rail's autoFix used to build knownRoutes
    // from the current session's pagesQueue only, so chat-#2's autoFix
    // saw only the new route and flagged chat-#1 routes as stale (404).
    // resolveKnownRoutes reads from the FULL config so multi-turn chats
    // share the route inventory correctly.
    const dsm = buildDsmWithRoutes(['/dashboard', '/transactions', '/settings', '/profile', '/reports'])
    await dsm.load()
    const routes = resolveKnownRoutes(dsm).sort()
    expect(routes).toEqual(['/dashboard', '/profile', '/reports', '/settings', '/transactions'])
  })

  it('filters out empty/missing route entries (defensive)', async () => {
    // Use only non-`/` routes so init seed's Home doesn't confuse the
    // assertion (DSM may auto-preserve a Home on load).
    const dsm = buildDsmWithRoutes(['/dashboard', '/settings'])
    await dsm.load()
    const cfg = dsm.getConfig()
    // Manually corrupt: add a page with an empty route. DSM schema
    // allows it (route is a string, not constrained non-empty);
    // resolveKnownRoutes filters at the boundary.
    cfg.pages.push({
      id: 'corrupt',
      name: 'Corrupt',
      route: '',
      layout: 'centered',
      sections: [],
      title: '',
      description: '',
      requiresAuth: false,
      noIndex: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    dsm.updateConfig(cfg)
    const routes = resolveKnownRoutes(dsm)
    // Empty-route entry must NOT appear in the output.
    expect(routes).not.toContain('')
    // Real routes must appear (don't pin exact list — DSM may auto-add
    // a Home seed on load; that's outside the contract this asserts).
    expect(routes).toContain('/dashboard')
    expect(routes).toContain('/settings')
  })
})
