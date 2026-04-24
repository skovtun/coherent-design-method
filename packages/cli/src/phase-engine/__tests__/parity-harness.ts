/**
 * Parity harness infrastructure.
 *
 * Supports the Tier 1 parity test (`parity.test.ts`) that locks byte-identical
 * output between the chat rail and the skill rail for the 3 canonical intents
 * defined in the v0.9.0 test plan.
 *
 * Contents:
 *  - `loadFixture(slug)` — read `fixtures/parity/<slug>/` into memory.
 *  - `snapshotTree(dir)` — recursively read every file in `dir` into a sorted
 *    `{relPath → bytes-or-utf8}` map. Deterministic, order-stable.
 *  - `normalizeTree(tree)` — strip run-to-run variance (timestamps, UUIDs) so
 *    two trees produced by the same inputs compare clean.
 *  - `diffTrees(a, b)` — return a list of divergence strings (empty = parity).
 *  - `runRailB(opts)` — drive the skill rail end-to-end in an isolated tmpfs
 *    project: sessionStart → runPipeline(phases) with MockProvider replay →
 *    sessionEnd(appliers). Returns the post-run file tree.
 *  - `runRailA(opts)` — STUBBED. Awaits the `chat.ts` facade refactor
 *    (Lane D Task 2). Once chat.ts becomes a thin wrapper over runPipeline,
 *    this function replays the same fixture through the chat facade with the
 *    same MockProvider and returns an equivalent tree.
 *
 * Keeping both rails in one helper means the parity test is a 3-line
 * assertion per intent: `expect(diffTrees(a, b)).toEqual([])`.
 */

import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ArtifactApplier } from '../session-lifecycle.js'

export interface ParityFixture {
  slug: string
  intent: string
  recordedResponses: string[]
  /** Path to the `expected-output/` directory — caller snapshots it. */
  expectedOutputDir: string
}

export interface FileTree {
  /** Relative path (POSIX slashes) → file contents as utf-8 string. */
  [relPath: string]: string
}

export interface RunRailOptions {
  fixture: ParityFixture
  /** Where to write the scratch project. Defaults to an OS tmpdir. */
  tmpDir?: string
  /** Appliers registered with `sessionEnd`. Lane D wires real ones; harness default is `[]`. */
  appliers?: ArtifactApplier[]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = resolve(HERE, 'fixtures', 'parity')

/**
 * Read fixture metadata + recorded responses into memory. Throws a clear error
 * if the fixture is missing — the test author needs to know which slug to
 * record, not get a cryptic ENOENT.
 */
export function loadFixture(slug: string): ParityFixture {
  const dir = join(FIXTURES_DIR, slug)
  try {
    const intent = readFileSync(join(dir, 'intent.txt'), 'utf-8').trim()
    const raw = readFileSync(join(dir, 'recorded-responses.json'), 'utf-8')
    const recordedResponses = JSON.parse(raw) as string[]
    if (!Array.isArray(recordedResponses)) {
      throw new Error(`${slug}/recorded-responses.json must be a JSON array of strings`)
    }
    return {
      slug,
      intent,
      recordedResponses,
      expectedOutputDir: join(dir, 'expected-output'),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Parity fixture "${slug}" not ready: ${msg}. ` +
        `Expected at ${dir}. See fixtures/parity/README.md for recording protocol.`,
    )
  }
}

/**
 * Recursive tree snapshot. Returns a deterministic, sorted map whose keys are
 * POSIX-relative paths and values are file contents. Skips .DS_Store,
 * node_modules, and the session dir itself (by convention under `.coherent/session`).
 */
export function snapshotTree(dir: string): FileTree {
  const out: FileTree = {}
  walk(dir, dir, out)
  return sortTree(out)
}

function walk(root: string, cur: string, acc: FileTree): void {
  let entries: string[]
  try {
    entries = readdirSync(cur)
  } catch {
    return
  }
  entries.sort()
  for (const name of entries) {
    if (name === '.DS_Store' || name === 'node_modules' || name === '.git') continue
    const abs = join(cur, name)
    const rel = relative(root, abs).split(sep).join('/')
    if (rel.startsWith('.coherent/session')) continue
    const st = statSync(abs)
    if (st.isDirectory()) {
      walk(root, abs, acc)
    } else if (st.isFile()) {
      acc[rel] = readFileSync(abs, 'utf-8')
    }
  }
}

function sortTree(tree: FileTree): FileTree {
  const out: FileTree = {}
  for (const key of Object.keys(tree).sort()) {
    out[key] = tree[key]!
  }
  return out
}

/**
 * Strip per-run variance so two trees produced from the same inputs compare
 * clean. Today: ISO-8601 timestamps and session UUIDs in run records / logs.
 * Extend as parity cases surface new divergence sources.
 */
export function normalizeTree(tree: FileTree): FileTree {
  const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  const out: FileTree = {}
  for (const [k, v] of Object.entries(tree)) {
    out[k] = v.replace(ISO, '<TS>').replace(UUID, '<UUID>')
  }
  return out
}

/**
 * Diff two normalized trees. Returns a list of human-readable divergence
 * strings. Empty list = parity.
 */
export function diffTrees(a: FileTree, b: FileTree): string[] {
  const diffs: string[] = []
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of [...keys].sort()) {
    const va = a[k]
    const vb = b[k]
    if (va === undefined) diffs.push(`+ ${k} (only in B)`)
    else if (vb === undefined) diffs.push(`- ${k} (only in A)`)
    else if (va !== vb) diffs.push(`~ ${k} (content diverges, ${va.length} vs ${vb.length} bytes)`)
  }
  return diffs
}

/**
 * Create an isolated tmpfs project root suitable for `sessionStart`. Caller is
 * responsible for seeding `design-system.config.ts` + any scaffolding the
 * phases under test require. Returns the absolute path.
 */
export function mkScratchRoot(prefix = 'coherent-parity-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * Skill-rail driver — STUB.
 *
 * Wiring planned (Lane D Task 1):
 *  1. `mkScratchRoot()`, seed minimal coherent project.
 *  2. `sessionStart({ projectRoot, intent: fixture.intent })` → uuid.
 *  3. Build `MockProvider`, enqueue fixture.recordedResponses in order.
 *  4. Resolve the full 6-phase list via `phase-registry.resolvePhase`.
 *  5. `runPipeline({ phases, provider: mock, sessionId: uuid, store })`.
 *  6. `sessionEnd({ projectRoot, uuid, appliers })`.
 *  7. Return `snapshotTree(projectRoot)`.
 *
 * Not wired yet because the harness is shipping ahead of its first real
 * fixture — activating it would require handcrafting or recording responses,
 * which is deferred to follow-up commits.
 */
export async function runRailB(_opts: RunRailOptions): Promise<FileTree> {
  throw new Error(
    'runRailB: not implemented. Wire up once the first parity fixture is recorded. ' + 'See fixtures/parity/README.md.',
  )
}

/**
 * Chat-rail driver — STUB.
 *
 * Blocked on Lane D Task 2: `chat.ts` is still a 1569-line monolith. Once it
 * becomes a thin facade over `runPipeline`, this driver replays the same
 * fixture through that facade with the same MockProvider. The same seven
 * steps listed in `runRailB` apply — minus step 4 (chat builds the phase list
 * internally) and plus whatever spinner/heartbeat hooks chat.ts ends up
 * registering.
 */
export async function runRailA(_opts: RunRailOptions): Promise<FileTree> {
  throw new Error(
    'runRailA: blocked on chat.ts facade refactor (Lane D Task 2). ' +
      'Until chat.ts uses runPipeline, there is no shared entry point to drive.',
  )
}

/**
 * Convenience: load a directory from disk as a tree (same normalization rules
 * as `snapshotTree`). Used to read `expected-output/` golden fixtures.
 */
export async function loadExpectedTree(dir: string): Promise<FileTree> {
  const tree = snapshotTree(dir)
  // Force-read through async path so callers can await; keeps the surface
  // symmetric with `runRailA`/`runRailB`. Intentionally a no-op awaiter.
  await Promise.resolve()
  return tree
}

/** Small guard for `readFile` in tests that need byte-exact comparison. */
export async function readUtf8(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}
