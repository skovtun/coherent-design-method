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
import { acquirePersistentLock, releasePersistentLock } from '../utils/files.js'
import { loadHashes } from '../utils/file-hashes.js'
import { writeRunRecordRel } from '../utils/run-record.js'
import type { RunRecord } from '../utils/run-record.js'
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

  for (const applier of appliers) {
    try {
      const results = await applier.apply({ projectRoot, uuid, sessionDir, store, meta })
      for (const r of results) applied.push(`${applier.name}: ${r}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Applier "${applier.name}" failed: ${msg}`)
    }
  }

  let runRecordPath: string | null = null
  const runRecordRaw = await store.readArtifact(uuid, RUN_RECORD_ARTIFACT)
  if (runRecordRaw) {
    try {
      const parsed = JSON.parse(runRecordRaw) as RunRecord
      const rel = writeRunRecordRel(projectRoot, parsed)
      runRecordPath = rel ? resolve(projectRoot, rel) : null
    } catch {
      // run-record is best-effort — a malformed artifact shouldn't fail the session.
    }
  }

  try {
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

export const __internal = {
  INTENT_ARTIFACT,
  OPTIONS_ARTIFACT,
  CONFIG_SNAPSHOT_ARTIFACT,
  HASHES_BEFORE_ARTIFACT,
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
    RUN_RECORD_ARTIFACT,
  ])
  return entries.filter(n => !reserved.has(n)).sort()
}
