import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { __internal, listPhaseArtifacts, sessionEnd, sessionStart, type ArtifactApplier } from '../session-lifecycle.js'
import type { RunRecord } from '../../utils/run-record.js'
import { createMinimalConfig } from '../../utils/minimal-config.js'

const {
  INTENT_ARTIFACT,
  OPTIONS_ARTIFACT,
  CONFIG_SNAPSHOT_ARTIFACT,
  HASHES_BEFORE_ARTIFACT,
  PLAN_INPUT_ARTIFACT,
  RUN_RECORD_ARTIFACT,
} = __internal

// Real `DesignSystemConfig` (zod-valid) so sessionStart can parse it and
// seed plan-input.json. Previous inline stub was shape-adjacent but failed
// schema validation, which masked the (now-fixed) missing plan-input.json
// seeding bug in the skill-mode rail.
const MINIMAL_CONFIG = `export const config = ${JSON.stringify(createMinimalConfig('Test'), null, 2)} as const\n`

function setupProject(): string {
  const projectRoot = mkdtempSync(join(tmpdir(), 'coherent-session-lifecycle-'))
  writeFileSync(join(projectRoot, 'design-system.config.ts'), MINIMAL_CONFIG)
  return projectRoot
}

describe('sessionStart', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('creates a session, acquires persistent lock, writes initial snapshots', async () => {
    projectRoot = setupProject()
    const result = await sessionStart({
      projectRoot,
      intent: 'add pricing page',
      options: { atmosphere: 'swiss-grid' },
    })

    expect(result.uuid).toMatch(/^[0-9a-f-]{36}$/i)
    expect(result.sessionDir).toBe(join(projectRoot, '.coherent', 'session', result.uuid))
    expect(existsSync(result.sessionDir)).toBe(true)

    expect(existsSync(join(projectRoot, '.coherent.lock'))).toBe(true)

    expect(readFileSync(join(result.sessionDir, INTENT_ARTIFACT), 'utf-8')).toBe('add pricing page')
    const options = JSON.parse(readFileSync(join(result.sessionDir, OPTIONS_ARTIFACT), 'utf-8'))
    expect(options).toEqual({ atmosphere: 'swiss-grid' })

    // Raw file contents preserved byte-for-byte.
    const configSnapshot = readFileSync(join(result.sessionDir, CONFIG_SNAPSHOT_ARTIFACT), 'utf-8')
    expect(configSnapshot).toContain('"name": "Test"')
    expect(configSnapshot).toContain('as const')

    // hashes file exists even when no hashes were persisted yet — it's an empty {} snapshot.
    const hashes = JSON.parse(readFileSync(join(result.sessionDir, HASHES_BEFORE_ARTIFACT), 'utf-8'))
    expect(typeof hashes).toBe('object')

    // plan-input.json must be seeded so `coherent _phase prep plan` finds a
    // real input. Shape: { message: string, config: DesignSystemConfig }.
    const planInput = JSON.parse(readFileSync(join(result.sessionDir, PLAN_INPUT_ARTIFACT), 'utf-8'))
    expect(planInput.message).toBe('add pricing page')
    expect(planInput.config).toBeDefined()
    expect(planInput.config.name).toBe('Test')
    expect(Array.isArray(planInput.config.components)).toBe(true)
  })

  it('rejects a non-Coherent project', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'coherent-not-a-project-'))
    await expect(sessionStart({ projectRoot })).rejects.toThrow(/Not a Coherent project/)
  })

  it('releases the lock if snapshot persistence fails', async () => {
    projectRoot = setupProject()
    // Inject a store whose create() throws — forces the catch branch inside
    // sessionStart to release the lock.
    const badStore = {
      async create() {
        throw new Error('store-down')
      },
    } as unknown as Parameters<typeof sessionStart>[0]['store']
    await expect(sessionStart({ projectRoot, store: badStore })).rejects.toThrow('store-down')
    expect(existsSync(join(projectRoot, '.coherent.lock'))).toBe(false)
  })

  it('refuses to start a second session while one is active', async () => {
    projectRoot = setupProject()
    await sessionStart({ projectRoot })
    await expect(sessionStart({ projectRoot })).rejects.toThrow(/Another coherent session is active/)
  })
})

describe('sessionEnd', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('runs appliers in order, releases lock, deletes session dir', async () => {
    projectRoot = setupProject()
    const { uuid, sessionDir } = await sessionStart({ projectRoot, intent: 'x' })

    const order: string[] = []
    const a: ArtifactApplier = {
      name: 'a',
      async apply() {
        order.push('a')
        return ['did-a']
      },
    }
    const b: ArtifactApplier = {
      name: 'b',
      async apply() {
        order.push('b')
        return ['did-b-1', 'did-b-2']
      },
    }

    const result = await sessionEnd({ projectRoot, uuid, appliers: [a, b] })

    expect(order).toEqual(['a', 'b'])
    expect(result.applied).toEqual(['a: did-a', 'b: did-b-1', 'b: did-b-2'])
    expect(existsSync(sessionDir)).toBe(false)
    expect(existsSync(join(projectRoot, '.coherent.lock'))).toBe(false)
  })

  it('surfaces applier failures with the applier name', async () => {
    projectRoot = setupProject()
    const { uuid } = await sessionStart({ projectRoot })

    const bad: ArtifactApplier = {
      name: 'bad',
      async apply() {
        throw new Error('boom')
      },
    }

    await expect(sessionEnd({ projectRoot, uuid, appliers: [bad] })).rejects.toThrow(/Applier "bad" failed: boom/)
    // Session dir should still exist (not deleted on applier error) so caller can inspect.
    expect(existsSync(join(projectRoot, '.coherent', 'session', uuid))).toBe(true)
    // Lock stays held on error — caller decides whether to retry or force-unlock.
    expect(existsSync(join(projectRoot, '.coherent.lock'))).toBe(true)
  })

  it('writes run record to .coherent/runs/ if session contains run-record.json', async () => {
    projectRoot = setupProject()
    const { uuid, sessionDir } = await sessionStart({ projectRoot })

    const runRecord: RunRecord = {
      timestamp: '2026-04-23T20:00:00.000Z',
      coherentVersion: '0.9.0',
      intent: 'session-lifecycle test',
      options: {
        atmosphere: null,
        atmosphereOverride: false,
        page: null,
        component: null,
        newComponent: null,
        dryRun: false,
      },
      atmosphere: null,
      pagesWritten: [],
      sharedComponentsWritten: [],
      durationMs: 123,
      outcome: 'success',
    }
    writeFileSync(join(sessionDir, RUN_RECORD_ARTIFACT), JSON.stringify(runRecord))

    const result = await sessionEnd({ projectRoot, uuid })

    expect(result.runRecordPath).toBeTruthy()
    expect(result.runRecordPath!).toMatch(/\.coherent\/runs\//)
    expect(existsSync(result.runRecordPath!)).toBe(true)
  })

  it('keeps session dir when keepSession: true', async () => {
    projectRoot = setupProject()
    const { uuid, sessionDir } = await sessionStart({ projectRoot })
    await sessionEnd({ projectRoot, uuid, keepSession: true })
    expect(existsSync(sessionDir)).toBe(true)
  })

  it('throws when the session does not exist', async () => {
    projectRoot = setupProject()
    await expect(sessionEnd({ projectRoot, uuid: 'does-not-exist' })).rejects.toThrow(/Session .* not found/)
  })

  describe('run-record composition fallback (codex R2 P1 #6)', () => {
    it('composes run-record.json from session artifacts when no phase seeded one', async () => {
      projectRoot = setupProject()
      const { uuid, sessionDir } = await sessionStart({
        projectRoot,
        intent: 'build a landing page',
        options: { atmosphere: 'swiss-grid', dryRun: false },
      })

      // Seed one page artifact with real pageCode + one components-generated
      // entry, mirroring what the 6-phase rail would produce.
      writeFileSync(
        join(sessionDir, 'page-home.json'),
        JSON.stringify({
          id: 'home',
          name: 'Home',
          route: '/',
          pageType: 'marketing',
          request: {
            type: 'add-page',
            target: 'home',
            changes: { id: 'home', name: 'Home', route: '/', pageCode: 'export default function Home(){}' },
          },
        }),
      )
      writeFileSync(
        join(sessionDir, 'components-generated.json'),
        JSON.stringify({
          components: [{ name: 'Hero', code: 'export function Hero(){}', file: 'components/shared/hero.tsx' }],
        }),
      )

      // No run-record.json — composeRunRecord should fill the gap.
      const result = await sessionEnd({ projectRoot, uuid, keepSession: true })

      expect(result.runRecordPath).toBeTruthy()
      expect(result.runRecordPath!).toMatch(/\.coherent\/runs\//)
      expect(existsSync(result.runRecordPath!)).toBe(true)

      // Session-dir copy survives the --keep path.
      const sessionCopy = join(sessionDir, RUN_RECORD_ARTIFACT)
      expect(existsSync(sessionCopy)).toBe(true)
      const composed = JSON.parse(readFileSync(sessionCopy, 'utf-8')) as RunRecord
      expect(composed.intent).toBe('build a landing page')
      expect(composed.options).toMatchObject({ atmosphere: 'swiss-grid', dryRun: false })
      expect(composed.pagesWritten).toEqual(['app/page.tsx'])
      expect(composed.sharedComponentsWritten).toEqual(['components/shared/hero.tsx'])
      expect(composed.outcome).toBe('success')
      expect(typeof composed.coherentVersion).toBe('string')
      expect(composed.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('still honors a pre-written run-record.json if upstream seeded one', async () => {
      projectRoot = setupProject()
      const { uuid, sessionDir } = await sessionStart({ projectRoot })

      const pre: RunRecord = {
        timestamp: '2026-04-23T20:00:00.000Z',
        coherentVersion: '0.9.0',
        intent: 'pre-seeded intent',
        options: { dryRun: false },
        atmosphere: null,
        pagesWritten: ['app/prebuilt/page.tsx'],
        sharedComponentsWritten: [],
        durationMs: 42,
        outcome: 'success',
      }
      writeFileSync(join(sessionDir, RUN_RECORD_ARTIFACT), JSON.stringify(pre))

      const result = await sessionEnd({ projectRoot, uuid, keepSession: true })

      expect(result.runRecordPath).toBeTruthy()
      // The composed-fallback branch should NOT overwrite the pre-seeded
      // record — composition is strictly a fallback.
      const sessionCopy = readFileSync(join(sessionDir, RUN_RECORD_ARTIFACT), 'utf-8')
      expect(JSON.parse(sessionCopy).intent).toBe('pre-seeded intent')
    })

    it('skips pages with empty pageCode in pagesWritten', async () => {
      projectRoot = setupProject()
      const { uuid, sessionDir } = await sessionStart({ projectRoot })

      writeFileSync(
        join(sessionDir, 'page-home.json'),
        JSON.stringify({
          id: 'home',
          name: 'Home',
          route: '/',
          pageType: 'marketing',
          request: {
            type: 'add-page',
            target: 'home',
            changes: { id: 'home', name: 'Home', route: '/', pageCode: 'export default function Home(){}' },
          },
        }),
      )
      writeFileSync(
        join(sessionDir, 'page-empty.json'),
        JSON.stringify({
          id: 'empty',
          name: 'Empty',
          route: '/empty',
          pageType: 'app',
          request: {
            type: 'add-page',
            target: 'empty',
            changes: { id: 'empty', name: 'Empty', route: '/empty', pageCode: '' },
          },
        }),
      )

      const result = await sessionEnd({ projectRoot, uuid, keepSession: true })
      expect(result.runRecordPath).toBeTruthy()
      const composed = JSON.parse(readFileSync(join(sessionDir, RUN_RECORD_ARTIFACT), 'utf-8')) as RunRecord
      expect(composed.pagesWritten).toEqual(['app/page.tsx'])
    })
  })
})

describe('listPhaseArtifacts', () => {
  let projectRoot: string
  afterEach(() => {
    if (projectRoot && existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('excludes session.json and the start-time snapshots', async () => {
    projectRoot = setupProject()
    const { uuid, sessionDir } = await sessionStart({
      projectRoot,
      intent: 'x',
      options: { page: 'pricing' },
    })
    writeFileSync(join(sessionDir, 'plan.json'), '{}')
    writeFileSync(join(sessionDir, 'page-pricing.json'), '{}')

    const phaseArtifacts = await listPhaseArtifacts(projectRoot, uuid)
    expect(phaseArtifacts.sort()).toEqual(['page-pricing.json', 'plan.json'])
  })
})
