/**
 * Session lifecycle — pre-AI (`sessionStart`) and post-AI (`sessionEnd`) frame
 * for the skill-mode rail.
 *
 * Lane B → D bridge (v0.9.0): this module owns the lifecycle frame only. Artifact
 * application is delegated to pluggable appliers passed by the caller — Lane D
 * wires the real appliers (config-delta, page-*.json, components-generated, hash
 * sync, manifest.usedIn) into `sessionEnd`. The in-process `coherent chat` rail
 * keeps its current inline logic unchanged; this module is consumed only by the
 * skill-mode subcommands (`coherent session start/end`).
 *
 * Invariants:
 *  - `sessionStart` persists enough context (`config-snapshot.json`,
 *    `hashes-before.json`, `intent.txt`, `options.json`) that `sessionEnd` can
 *    run in a completely different process (skill-mode multi-process rail).
 *  - Lock is persistent across processes — callers hold it until `sessionEnd`.
 *  - Session directory is the single source of truth between start and end.
 */

import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { CLI_VERSION, DesignSystemManager } from '@getcoherent/core'
import { acquirePersistentLock, releasePersistentLock } from '../utils/files.js'
import { loadHashes } from '../utils/file-hashes.js'
import { writeRunRecordRel } from '../utils/run-record.js'
import type { RunRecord, RunRecordOptions } from '../utils/run-record.js'
import { routeToFsPath } from '../commands/chat/utils.js'
import { FileBackedSessionStore } from './file-backed-session-store.js'
import type { SessionMeta, SessionStore } from './session-store.js'

export interface SessionStartInput {
  projectRoot: string
  /** Raw user intent — persisted as `intent.txt` for later phases + audit. */
  intent?: string
  /** Caller options (atmosphere, page, dryRun, etc). Persisted as `options.json`. */
  options?: Record<string, unknown>
  /** Inject for tests. Defaults to FileBackedSessionStore(projectRoot). */
  store?: SessionStore
}

export interface SessionStartResult {
  uuid: string
  sessionDir: string
  startedAt: string
}

export interface SessionEndInput {
  projectRoot: string
  uuid: string
  /** If true, the session dir survives `sessionEnd` (for debugging). Default false. */
  keepSession?: boolean
  /**
   * Pluggable artifact appliers. Each runs in order; Lane D will supply the real
   * ones (config-delta, page-*.json, components-generated, hash-sync, globals,
   * backup). V0.9.0 Lane-B-bridge callers typically pass `[]`.
   */
  appliers?: ArtifactApplier[]
  /** Inject for tests. Defaults to FileBackedSessionStore(projectRoot). */
  store?: SessionStore
}

/**
 * One unit of post-AI work: reads artifacts from the session, mutates project
 * state, returns a list of human-readable strings describing what it did.
 * Non-fatal failures are swallowed by the applier itself (return `[]`); fatal
 * failures throw so `sessionEnd` can surface them.
 */
export interface ArtifactApplier {
  name: string
  apply(ctx: ArtifactApplierContext): Promise<string[]>
}

export interface ArtifactApplierContext {
  projectRoot: string
  uuid: string
  sessionDir: string
  store: SessionStore
  meta: SessionMeta
}

export interface SessionEndResult {
  uuid: string
  endedAt: string
  /** Flat list of "what got applied" strings, one per applier × artifact. */
  applied: string[]
  /**
   * Absolute path to the run-record written under `.coherent/runs/` if the
   * session produced one; `null` otherwise.
   */
  runRecordPath: string | null
}

const INTENT_ARTIFACT = 'intent.txt'
const OPTIONS_ARTIFACT = 'options.json'
const CONFIG_SNAPSHOT_ARTIFACT = 'config-snapshot.json'
const HASHES_BEFORE_ARTIFACT = 'hashes-before.json'
const PLAN_INPUT_ARTIFACT = 'plan-input.json'
const RUN_RECORD_ARTIFACT = 'run-record.json'

/**
 * Acquire the persistent project lock, create a session, snapshot initial state.
 * Returns the session UUID — caller passes it to `sessionEnd` (or writes it to
 * stdout for the skill-mode CLI so a downstream `_phase` or `session end` can
 * find it).
 *
 * Throws if the project is already locked by a live process, if the project
 * root is not a Coherent project, or if persistence fails.
 */
export async function sessionStart(input: SessionStartInput): Promise<SessionStartResult> {
  const { projectRoot, intent = '', options = {} } = input

  const configPath = resolve(projectRoot, 'design-system.config.ts')
  if (!existsSync(configPath)) {
    throw new Error(`Not a Coherent project: ${projectRoot} (no design-system.config.ts)`)
  }

  acquirePersistentLock(projectRoot)

  try {
    const store = input.store ?? new FileBackedSessionStore(projectRoot)
    const meta = await store.create()

    await store.writeArtifact(meta.uuid, INTENT_ARTIFACT, intent)
    await store.writeArtifact(meta.uuid, OPTIONS_ARTIFACT, JSON.stringify(options, null, 2))

    // Snapshot the raw config file (not the validated object) so `sessionEnd`
    // can diff it against the post-run state. Validation happens in the phases
    // that consume it; the snapshot must preserve pre-run bytes exactly.
    const configRaw = await readFile(configPath, 'utf-8')
    await store.writeArtifact(meta.uuid, CONFIG_SNAPSHOT_ARTIFACT, configRaw)

    const hashes = await loadHashes(projectRoot)
    await store.writeArtifact(meta.uuid, HASHES_BEFORE_ARTIFACT, JSON.stringify(hashes, null, 2))

    // Seed plan-input.json so the first skill-mode call (`coherent _phase prep
    // plan`) finds a real input. Without this, the skill rail dies on step 1
    // with `plan: missing required artifact "plan-input.json"`. The plan phase
    // expects `{ message: string, config: DesignSystemConfig }` — we have both:
    // `intent` is the user's request, and the config was just snapshotted.
    // We load the parsed config object here (not the raw file) because
    // `PlanInput.config` is typed as `DesignSystemConfig`, not a string.
    const dsm = new DesignSystemManager(configPath)
    await dsm.load()
    const parsedConfig = dsm.getConfig()
    const planInput = { message: intent, config: parsedConfig }
    await store.writeArtifact(meta.uuid, PLAN_INPUT_ARTIFACT, JSON.stringify(planInput, null, 2))

    return {
      uuid: meta.uuid,
      sessionDir: sessionDirPath(projectRoot, meta.uuid),
      startedAt: meta.createdAt,
    }
  } catch (e) {
    // Release the lock if session creation failed after acquisition — otherwise
    // the project is locked with no owner.
    releasePersistentLock(projectRoot)
    throw e
  }
}

/**
 * Run any registered artifact appliers, write the run record if one was produced,
 * release the persistent lock, delete the session dir. Idempotent on missing
 * session (throws) but designed to run exactly once per session UUID.
 */
export async function sessionEnd(input: SessionEndInput): Promise<SessionEndResult> {
  const { projectRoot, uuid, keepSession = false, appliers = [] } = input
  const store = input.store ?? new FileBackedSessionStore(projectRoot)

  const meta = await store.read(uuid)
  if (!meta) {
    throw new Error(`Session ${uuid} not found. Run \`coherent session start\` first.`)
  }

  const sessionDir = sessionDirPath(projectRoot, uuid)
  const applied: string[] = []

  // Codex R3 P1 #8: the persistent lock MUST be released on every exit
  // path from this function — including applier throws. Previously the
  // release lived in a tail `finally` that only ran after `store.delete`,
  // so any applier failure left `.coherent.lock` on disk indefinitely
  // (or until the 60-min stale timeout) and blocked every subsequent
  // `coherent session start` on the project. One bad run wedged the
  // whole project for the user. Outer try/finally now guarantees
  // release; the session dir is preserved on error (we skip
  // `store.delete`) so the failed-session artifacts remain for
  // post-mortem inspection.
  let runRecordPath: string | null = null
  try {
    for (const applier of appliers) {
      try {
        const results = await applier.apply({ projectRoot, uuid, sessionDir, store, meta })
        for (const r of results) applied.push(`${applier.name}: ${r}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`Applier "${applier.name}" failed: ${msg}`)
      }
    }

    let runRecordRaw = await store.readArtifact(uuid, RUN_RECORD_ARTIFACT)

    // Codex R2 P1 #6: no phase currently seeds `run-record.json` in the skill
    // rail, so compose one here from session artifacts when missing. Keeps
    // `.coherent/runs/<timestamp>.yaml` parity with the chat rail so "did
    // memory help?" telemetry and run-history tooling see both rails
    // equivalently.
    if (!runRecordRaw) {
      const composed = await composeRunRecord(projectRoot, store, uuid, meta)
      if (composed) {
        runRecordRaw = JSON.stringify(composed)
        // Persist the composed record back to the session dir so the
        // `--keep` flag preserves a full post-mortem, not a half-empty one.
        await store.writeArtifact(uuid, RUN_RECORD_ARTIFACT, runRecordRaw)
      }
    }

    if (runRecordRaw) {
      try {
        const parsed = JSON.parse(runRecordRaw) as RunRecord
        const rel = writeRunRecordRel(projectRoot, parsed)
        runRecordPath = rel ? resolve(projectRoot, rel) : null
      } catch {
        // run-record is best-effort — a malformed artifact shouldn't fail the session.
      }
    }

    if (!keepSession) {
      await store.delete(uuid)
    }
  } finally {
    releasePersistentLock(projectRoot)
  }

  return {
    uuid,
    endedAt: new Date().toISOString(),
    applied,
    runRecordPath,
  }
}

function sessionDirPath(projectRoot: string, uuid: string): string {
  return join(projectRoot, '.coherent', 'session', uuid)
}

/**
 * Assemble a `RunRecord` from session state when no phase seeded one. Used
 * as a fallback inside `sessionEnd` so the skill rail still produces a
 * `.coherent/runs/<timestamp>.yaml` artifact — same shape the chat rail
 * emits.
 *
 * Returns `null` only if the intent artifact is unreadable. Everything else
 * (pages, components, options, atmosphere) degrades to empty / null so the
 * record always passes `RunRecord` validation.
 */
async function composeRunRecord(
  projectRoot: string,
  store: SessionStore,
  uuid: string,
  meta: SessionMeta,
): Promise<RunRecord | null> {
  const intentRaw = await store.readArtifact(uuid, INTENT_ARTIFACT)
  if (intentRaw === null) return null

  const optionsRaw = await store.readArtifact(uuid, OPTIONS_ARTIFACT)
  let options: RunRecordOptions = {}
  if (optionsRaw) {
    try {
      options = JSON.parse(optionsRaw) as RunRecordOptions
    } catch {
      // ignore — options is best-effort context
    }
  }

  const pagesWritten: string[] = []
  const sharedComponentsWritten: string[] = []

  const entries = await listPhaseArtifacts(projectRoot, uuid)

  // Derive pagesWritten from page-*.json artifacts whose request carries
  // a non-empty pageCode. Same gate the pages applier uses to decide what
  // actually lands on disk.
  for (const name of entries) {
    if (!/^page-[^/]+\.json$/.test(name)) continue
    const raw = await store.readArtifact(uuid, name)
    if (!raw) continue
    try {
      const page = JSON.parse(raw) as {
        route?: string
        pageType?: 'marketing' | 'app' | 'auth'
        request?: { changes?: { pageCode?: string } } | null
      }
      const pageCode = page.request?.changes?.pageCode?.trim()
      if (!pageCode || !page.route) continue
      const fsPath = routeToFsPath(projectRoot, page.route, page.pageType === 'auth')
      pagesWritten.push(fsPath.replace(projectRoot + '/', ''))
    } catch {
      // malformed page-*.json — skip, don't break run-record composition
    }
  }

  // Derive sharedComponentsWritten from components-generated.json.
  const componentsRaw = await store.readArtifact(uuid, 'components-generated.json')
  if (componentsRaw) {
    try {
      const parsed = JSON.parse(componentsRaw) as {
        components?: Array<{ name?: string; code?: string; file?: string }>
      }
      for (const c of parsed.components ?? []) {
        if (!c.code || !c.name || !c.file) continue
        sharedComponentsWritten.push(c.file)
      }
    } catch {
      // malformed — skip
    }
  }

  const startedAtMs = Date.parse(meta.createdAt)
  const durationMs = Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : 0

  return {
    timestamp: meta.createdAt,
    coherentVersion: CLI_VERSION,
    intent: intentRaw,
    options,
    atmosphere: null,
    pagesWritten,
    sharedComponentsWritten,
    durationMs,
    outcome: 'success',
  }
}

export const __internal = {
  INTENT_ARTIFACT,
  OPTIONS_ARTIFACT,
  CONFIG_SNAPSHOT_ARTIFACT,
  HASHES_BEFORE_ARTIFACT,
  PLAN_INPUT_ARTIFACT,
  RUN_RECORD_ARTIFACT,
}

// Re-export type for consumers of discovered artifacts.
export type SessionArtifactName = string

/**
 * Helper for callers/appliers — list artifacts written by phases into the
 * session, skipping the ones `sessionStart` wrote itself.
 */
export async function listPhaseArtifacts(projectRoot: string, uuid: string): Promise<string[]> {
  const dir = sessionDirPath(projectRoot, uuid)
  if (!existsSync(dir)) return []
  const entries = await readdir(dir)
  const reserved = new Set<string>([
    'session.json',
    INTENT_ARTIFACT,
    OPTIONS_ARTIFACT,
    CONFIG_SNAPSHOT_ARTIFACT,
    HASHES_BEFORE_ARTIFACT,
    PLAN_INPUT_ARTIFACT,
    RUN_RECORD_ARTIFACT,
  ])
  return entries.filter(n => !reserved.has(n)).sort()
}
