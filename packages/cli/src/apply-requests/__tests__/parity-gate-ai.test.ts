/**
 * Item 3 — DRIFT GATE for AI-dependent ModificationRequest types
 * (skill-rail boundary contract).
 *
 * Companion to `parity-gate.test.ts` (6 deterministic types).
 *
 * What this file pins:
 *
 *   The v0.12.0 silent-drop bug class is structurally fixed. Pre-v0.12,
 *   the skill rail's modification applier handled a SUBSET of AI cases
 *   silently — types like `link-shared` and `promote-and-link` that
 *   require AI to do block extraction at apply time would just no-op.
 *   The user got "delete-page X" success messages but the page was
 *   never deleted because the skill rail diverged from the API rail.
 *
 *   v0.12.0 introduced applyMode='no-new-ai' + isAiCasePrepopulated()
 *   gate. These fixtures verify the gate fires:
 *
 *   - add-page WITHOUT pageCode → E007 (must be pre-populated)
 *   - link-shared → E007 always (NEVER pre-populatable per
 *     dispatch-ai.ts:81-82)
 *   - promote-and-link → E007 always (NEVER pre-populatable per
 *     dispatch-ai.ts:84-85)
 *
 * What this file deliberately does NOT cover:
 *
 *   Happy-path AI parity (add-page WITH pageCode → file written) goes
 *   through legacy applyModification which has heavy downstream side
 *   effects (component install, plan loading, route mapping, auto-fix,
 *   layout stripping). Testing on-disk byte equivalence requires a
 *   fake AI provider + manifest setup — out of scope for this gate.
 *   The deterministic types in parity-gate.test.ts already cover
 *   on-disk parity for the 6 types that don't need AI.
 *
 *   The 5th AI type, `modify-layout-block`, is omitted: testing it in
 *   'no-new-ai' mode requires a non-trivial seeded page with a layout
 *   block to modify, and the legacy applier writes through similar
 *   side-effect machinery as add-page. Deferred to v0.14+ when the
 *   AI bodies move into dispatch-ai.ts (PR2 commit #10) and become
 *   self-contained.
 *
 * Add a fixture when you add a new AI type or change pre-population
 * semantics. Don't shortcut — fixtures are reviewable as JSON diffs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { ComponentManager, DesignSystemManager, PageManager, type ModificationRequest } from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { applyRequests } from '../index.js'
import { isCoherentError } from '../../errors/index.js'
import type { ApplyMode, ApplyRequestsContext } from '../types.js'

interface AiFixture {
  _doc?: string
  mode: ApplyMode
  setup?: {
    seedPage?: { id: string; name: string; route: string }
    seedPageFile?: string
  }
  input: ModificationRequest
  expected: {
    success?: boolean
    messageMatches?: string
    configCheck?: {
      path: string
      value?: unknown
      containsId?: string
      doesNotContainId?: string
    }
    fileExists?: string
    fileContains?: string
    /** Boundary case: dispatch must throw a CoherentError with this code. */
    throwsCode?: string
    /** Boundary case: error message must match this regex. */
    throwsMessageMatches?: string
  }
}

const FIXTURES_DIR = join(__dirname, 'fixtures', 'ai')

function loadFixtures(): Array<{ name: string; data: AiFixture }> {
  const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'))
  return files.map(f => ({
    name: f.replace(/\.json$/, ''),
    data: JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf-8')) as AiFixture,
  }))
}

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-parity-ai-'))
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

describe('Item 3 — drift gate (AI-dependent fixtures)', () => {
  it('loaded all 3 AI boundary fixture files', () => {
    expect(fixtures.map(f => f.name).sort()).toEqual([
      'e007-add-page-no-code',
      'e007-link-shared',
      'e007-promote-and-link',
    ])
  })

  for (const { name, data } of fixtures) {
    it(`${name}: applyRequests output matches expected fixture (mode=${data.mode})`, async () => {
      // Build context with optional setup.
      const seedPages = data.setup?.seedPage ? [data.setup.seedPage] : []
      const ctx = await buildCtx(seedPages)

      // Optional file setup.
      if (data.setup?.seedPageFile) {
        const fullPath = join(projectRoot, data.setup.seedPageFile)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, 'export default function Page(){return null}', 'utf-8')
      }

      // Branch: boundary (throws) vs happy path (success result).
      if (data.expected.throwsCode) {
        let caught: unknown
        try {
          await applyRequests([data.input], ctx, data.mode)
        } catch (e) {
          caught = e
        }
        expect(caught).toBeDefined()
        expect(isCoherentError(caught)).toBe(true)
        if (caught && typeof caught === 'object' && 'code' in caught) {
          expect((caught as { code: string }).code).toBe(data.expected.throwsCode)
        }
        if (data.expected.throwsMessageMatches && caught instanceof Error) {
          expect(caught.message).toMatch(new RegExp(data.expected.throwsMessageMatches))
        }
        return
      }

      // Happy path.
      const results = await applyRequests([data.input], ctx, data.mode)
      expect(results).toHaveLength(1)
      const result = results[0]

      if (data.expected.success !== undefined) {
        expect(result.success).toBe(data.expected.success)
      }

      if (data.expected.messageMatches) {
        expect(result.message).toMatch(new RegExp(data.expected.messageMatches))
      }

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

      if (data.expected.fileExists) {
        expect(existsSync(join(projectRoot, data.expected.fileExists))).toBe(true)
      }

      if (data.expected.fileContains) {
        expect(data.expected.fileExists).toBeDefined() // sanity
        const content = readFileSync(join(projectRoot, data.expected.fileExists!), 'utf-8')
        expect(content).toContain(data.expected.fileContains)
      }
    })
  }
})
