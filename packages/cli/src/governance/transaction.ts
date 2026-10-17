/**
 * Edit transactions with byte-exact rollback.
 *
 * The older backup (utils/backup.ts) restores copied files but never removes
 * files created after the snapshot and only covers app/ + components/. An edit
 * that adds a variant file or a new component therefore could not be undone.
 * A transaction snapshots the whole project tree (minus build/vendor dirs),
 * and rollback restores modified + deleted files, deletes created ones, then
 * re-hashes to prove the tree matches the snapshot.
 */
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join, relative, sep } from 'path'

const SKIP = new Set(['node_modules', '.next', '.git', '.coherent', 'dist', 'build', 'out', '.turbo'])
const TX_DIR = '.coherent/tx'
// Written by tsc/next themselves, not by an edit: never part of the edit's write set.
const SKIP_FILES = /(^|\/)(\.DS_Store|next-env\.d\.ts|[^/]*\.tsbuildinfo)$/

const toPosix = (p: string) => p.split(sep).join('/')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function listTree(root: string, dir = root, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || SKIP_FILES.test(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) listTree(root, full, out)
    else if (st.isFile()) out.push(toPosix(relative(root, full)))
  }
  return out
}

export function hashTree(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of listTree(root)) out[f] = sha(readFileSync(join(root, f)))
  return out
}

export interface TxChanges {
  created: string[]
  modified: string[]
  deleted: string[]
}

export interface TxRecord {
  id: string
  label: string
  startedAt: string
  before: Record<string, string>
  after?: Record<string, string>
  changes?: TxChanges
}

const txPath = (root: string, id: string) => join(root, TX_DIR, id)

export function beginTransaction(root: string, label: string): TxRecord {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
  const dir = txPath(root, id)
  const before = hashTree(root)
  for (const f of Object.keys(before)) {
    const dest = join(dir, 'files', f)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(join(root, f)))
  }
  const rec: TxRecord = { id, label, startedAt: new Date().toISOString(), before }
  writeFileSync(join(dir, 'tx.json'), JSON.stringify(rec, null, 2))
  return rec
}

export function diffTrees(before: Record<string, string>, after: Record<string, string>): TxChanges {
  const created = Object.keys(after).filter(f => !(f in before))
  const deleted = Object.keys(before).filter(f => !(f in after))
  const modified = Object.keys(after).filter(f => f in before && before[f] !== after[f])
  return { created: created.sort(), modified: modified.sort(), deleted: deleted.sort() }
}

export function commitTransaction(root: string, rec: TxRecord): TxRecord {
  const after = hashTree(root)
  const done = { ...rec, after, changes: diffTrees(rec.before, after) }
  writeFileSync(join(txPath(root, rec.id), 'tx.json'), JSON.stringify(done, null, 2))
  return done
}

export function loadTransaction(root: string, id: string): TxRecord {
  return JSON.parse(readFileSync(join(txPath(root, id), 'tx.json'), 'utf-8'))
}

export function listTransactions(root: string): string[] {
  const dir = join(root, TX_DIR)
  return existsSync(dir)
    ? readdirSync(dir)
        .filter(d => existsSync(join(dir, d, 'tx.json')))
        .sort()
    : []
}

function pruneEmptyDirs(root: string, file: string) {
  let d = dirname(join(root, file))
  while (d.startsWith(root + sep) && existsSync(d) && readdirSync(d).length === 0) {
    rmdirSync(d)
    d = dirname(d)
  }
}

/**
 * Restore the tree to the transaction's `before` state. Works whether or not
 * the transaction was committed (a crashed edit is rolled back the same way).
 * Throws if the restored tree does not hash-match the snapshot.
 */
export function rollbackTransaction(root: string, id: string, opts: { force?: boolean } = {}): TxChanges {
  const rec = loadTransaction(root, id)
  const now = hashTree(root)
  if (rec.after && !opts.force) {
    // Anything changed since this edit (a later edit, a hand edit) would be
    // silently discarded by restoring the snapshot.
    const later = diffTrees(rec.after, now)
    const n = later.created.length + later.modified.length + later.deleted.length
    if (n) {
      const files = [...later.modified, ...later.created, ...later.deleted].slice(0, 5).join(', ')
      throw new Error(
        `${n} file(s) changed after edit ${id} (${files}). Undo newer edits first, or pass --force to discard them.`,
      )
    }
  }
  const undo = diffTrees(rec.before, now)
  for (const f of undo.created) {
    rmSync(join(root, f), { force: true })
    pruneEmptyDirs(root, f)
  }
  for (const f of [...undo.modified, ...undo.deleted]) {
    const dest = join(root, f)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(join(txPath(root, id), 'files', f)))
  }
  const check = diffTrees(rec.before, hashTree(root))
  const drift = [...check.created, ...check.modified, ...check.deleted]
  if (drift.length)
    throw new Error(`Rollback of ${id} left ${drift.length} file(s) different: ${drift.slice(0, 5).join(', ')}`)
  return undo
}
