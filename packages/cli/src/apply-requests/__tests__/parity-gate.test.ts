/**
 * PR1 #9 — DRIFT GATE.
 *
 * Loads the 6 deterministic fixtures from `fixtures/deterministic/*.json`
 * and runs each through `applyRequests` (the API rail's path). Asserts
 * the on-disk + in-memory state matches the documented expected shape.
 *
 * Why this is THE drift gate:
 *
 *   - dispatchDeterministic was ported VERBATIM from the legacy switch
 *     in commands/chat/modification-handler.ts. Same code, same result.
 *   - The skill rail's modificationApplier (phase-engine/appliers.ts) is
 *     scheduled to be replaced by `applyRequests(handled, ctx, 'no-new-
 *     ai')` in PR1 #10. After that swap, both rails route through the
 *     SAME dispatchDeterministic by construction — no source-level diff
 *     to drift.
 *   - These fixtures pin the contract dispatchDeterministic produces.
 *     Any future change that breaks one rail breaks this gate first.
 *
 * Add a fixture when you add a new request type. Don't shortcut by
 * inlining the request in a unit test — fixtures are reviewable as JSON
 * diffs and survive code reorganization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import {
  ComponentManager,
  DesignSystemManager,
  PageManager,
  saveManifest,
  type ModificationRequest,
} from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { applyRequests } from '../index.js'
import type { ApplyRequestsContext } from '../types.js'

interface Fixture {
  _doc?: string
  setup?: {
    seedPage?: { id: string; name: string; route: string }
    seedPageFile?: string
    seedComponent?: { id: string; name: string; file: string; code: string }
  }
  input: ModificationRequest
  expected: {
    success: boolean
    messageMatches?: string
    modifiedContains?: string
    configCheck?: {
      path: string
      value?: unknown
      containsId?: string
      doesNotContainId?: string
    }
    manifestCheck?: {
      doesNotContainId?: string
    }
    fileRemoved?: string
  }
}

const FIXTURES_DIR = join(__dirname, 'fixtures', 'deterministic')

function loadFixtures(): Array<{ name: string; data: Fixture }> {
  const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'))
  return files.map(f => ({
    name: f.replace(/\.json$/, ''),
    data: JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf-8')) as Fixture,
  }))
}

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-parity-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

async function buildCtx(
  seedPages: Array<{ id: string; name: string; route: string }> = [],
): Promise<ApplyRequestsContext> {
  const config = createMinimalConfig('Test')
  const now = new Date().toISOString()
  const filtered = seedPages.filter(p => p.route !== '/')
  config.pages = [
    ...config.pages,
    ...filtered.map(p => ({
      id: p.id,
      name: p.name,
      route: p.route,
      layout: 'centered' as const,
      sections: [],
      title: p.name,
      description: '',
      requiresAuth: false,
      noIndex: false,
      createdAt: now,
      updatedAt: now,
    })),
  ]
  const configPath = join(projectRoot, 'design-system.config.ts')
  writeFileSync(configPath, `export const config = ${JSON.stringify(config, null, 2)} as const\n`)
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  const cm = new ComponentManager(dsm.getConfig())
  const pm = new PageManager(dsm.getConfig(), cm)
  return { dsm, cm, pm, projectRoot }
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

const fixtures = loadFixtures()

describe('PR1 #9 — drift gate (6 deterministic fixtures)', () => {
  it('loaded all 6 fixture files', () => {
    expect(fixtures.map(f => f.name).sort()).toEqual([
      'add-component',
      'delete-component',
      'delete-page',
      'modify-component',
      'update-navigation',
      'update-token',
    ])
  })

  for (const { name, data } of fixtures) {
    it(`${name}: applyRequests output matches expected fixture`, async () => {
      // Build context with optional setup.
      const seedPages = data.setup?.seedPage ? [data.setup.seedPage] : []
      const ctx = await buildCtx(seedPages)

      // Optional file/component setup.
      if (data.setup?.seedPageFile) {
        const fullPath = join(projectRoot, data.setup.seedPageFile)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, 'export default function Page(){return null}', 'utf-8')
      }
      if (data.setup?.seedComponent) {
        const sc = data.setup.seedComponent
        const fullPath = join(projectRoot, sc.file)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, sc.code, 'utf-8')
        await saveManifest(projectRoot, {
          shared: [
            {
              id: sc.id,
              name: sc.name,
              type: 'section',
              file: sc.file,
              usedIn: [],
              createdAt: new Date().toISOString(),
              dependencies: [],
            },
          ],
          nextId: 2,
        })
      }

      // Run through the entry.
      const results = await applyRequests([data.input], ctx, 'with-ai')
      expect(results).toHaveLength(1)
      const result = results[0]

      // Success/failure assertion.
      expect(result.success).toBe(data.expected.success)

      // Message-match (regex-friendly).
      if (data.expected.messageMatches) {
        expect(result.message).toMatch(new RegExp(data.expected.messageMatches))
      }

      // Modified-list contains.
      if (data.expected.modifiedContains) {
        expect(result.modified).toContain(data.expected.modifiedContains)
      }

      // Config check via dot-path.
      if (data.expected.configCheck) {
        const cfg = ctx.dsm.getConfig()
        const value = getByPath(cfg, data.expected.configCheck.path)
        if (data.expected.configCheck.value !== undefined) {
          expect(value).toBe(data.expected.configCheck.value)
        }
        if (data.expected.configCheck.containsId) {
          expect(Array.isArray(value)).toBe(true)
          expect((value as Array<{ id: string }>).map(x => x.id)).toContain(data.expected.configCheck.containsId)
        }
        if (data.expected.configCheck.doesNotContainId) {
          expect(Array.isArray(value)).toBe(true)
          expect((value as Array<{ id: string }>).map(x => x.id)).not.toContain(
            data.expected.configCheck.doesNotContainId,
          )
        }
      }

      // Manifest check.
      if (data.expected.manifestCheck) {
        const manifest = JSON.parse(readFileSync(join(projectRoot, 'coherent.components.json'), 'utf-8')) as {
          shared: Array<{ id: string }>
        }
        if (data.expected.manifestCheck.doesNotContainId) {
          expect(manifest.shared.map(e => e.id)).not.toContain(data.expected.manifestCheck.doesNotContainId)
        }
      }

      // File removed.
      if (data.expected.fileRemoved) {
        expect(existsSync(join(projectRoot, data.expected.fileRemoved))).toBe(false)
      }
    })
  }
})
