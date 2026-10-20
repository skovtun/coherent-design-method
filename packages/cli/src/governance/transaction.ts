/**
 * Edit transactions with byte-exact rollback.
 *
 * The older backup (utils/backup.ts) restores copied files but never removes
 * files created after the snapshot and only covers app/ + components/. An edit
 * that adds a variant file or a new component therefore could not be undone.
 *
 * A transaction hashes the project tree (git-visible files, or a walk minus
 * build/vendor dirs outside git) and copies it, except secrets and oversized
 * files. Rollback touches only the files the transaction owns:
 * - committed: exactly its recorded changes, refused when any of them changed since;
 * - open (crashed or rejected edit): only its declared write set.
 * Anything else the user edited meanwhile (IDE, another tool) is left alone.
 *
 * One open transaction per project; its declared write set is persisted so a
 * restarted process (CLI, MCP server) can recover it.
 */
import { createHash, randomBytes } from 'crypto'
import { execFileSync } from 'child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'fs'
import { dirname, isAbsolute, join, posix, relative, sep } from 'path'

// `.gstack/` is a browser tool's state, written while an edit runs: not part of the app.
const SKIP = new Set(['node_modules', '.next', '.git', '.coherent', 'dist', 'build', 'out', '.turbo', '.gstack'])
const TX_DIR = '.coherent/tx'
// Written by tsc/next, or by the coding agent's host (Claude Code's local permissions),
// not by an edit: never part of the edit's write set. The rest of `.claude/`, `.cursor/rules/`
// and the like are project files and stay governed.
const SKIP_FILES = /(^|\/)(\.DS_Store|next-env\.d\.ts|[^/]*\.tsbuildinfo)$|^\.claude\/settings\.local\.json$/
// Hashed (so a change is detected) but never copied into .coherent/tx.
const SECRET = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx))$/i
const MAX_FILE = 5 * 1024 * 1024
const MAX_TOTAL = 200 * 1024 * 1024

const toPosix = (p: string) => p.split(sep).join('/')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const skipped = (f: string) => SKIP.has(f.split('/')[0]) || SKIP_FILES.test(f)

/**
 * Normalize a project-relative path from a model or a caller and refuse
 * anything that points outside the project or into vendor/tool dirs.
 * Pure: no filesystem access. Returns the normalized POSIX path.
 */
export function normalizeRelPath(p: string): string {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw new Error(`Unsafe path: ${JSON.stringify(p)}`)
  const n = posix.normalize(p.replace(/\\/g, '/'))
  if (isAbsolute(p) || n.startsWith('/') || /^[a-z]:/i.test(n) || n === '..' || n.startsWith('../') || n === '.')
    throw new Error(`Unsafe path (outside the project): ${p}`)
  if (SKIP.has(n.split('/')[0])) throw new Error(`Unsafe path (tool/vendor directory): ${p}`)
  return n
}

/** normalizeRelPath plus a check that no symlink on the way leads outside `root`. */
export function safeRelPath(root: string, p: string): string {
  const n = normalizeRelPath(p)
  const realRoot = realpathSync(root)
  let probe = join(root, n)
  if (existsSync(probe) && lstatSync(probe).isSymbolicLink()) throw new Error(`Unsafe path (symlink): ${p}`)
  while (!existsSync(probe)) probe = dirname(probe)
  const real = realpathSync(probe)
  if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`Unsafe path (escapes via symlink): ${p}`)
  return n
}

function gitFiles(root: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString('utf-8')
    return out.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = lstatSync(full)
    if (st.isDirectory()) walk(root, full, out)
    else if (st.isFile()) out.push(toPosix(relative(root, full)))
  }
  return out
}

function listTree(root: string, extra: string[] = []): string[] {
  // In a git repo, .gitignore already names build output, caches and local
  // secrets; outside git fall back to a walk minus well-known dirs. A
  // transaction's own planned paths are always included, ignored or not.
  const files = [...new Set([...(gitFiles(root) ?? walk(root)), ...extra])]
  return files.filter(f => {
    if (skipped(f)) return false
    const full = join(root, f)
    // Symlinks are neither hashed nor copied: following one could read outside the project.
    return existsSync(full) && lstatSync(full).isFile()
  })
}

export function hashTree(root: string, extra: string[] = []): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of listTree(root, extra).sort()) out[f] = sha(readFileSync(join(root, f)))
  return out
}

export interface TxChanges {
  created: string[]
  modified: string[]
  deleted: string[]
}

export type TxStatus = 'open' | 'committed' | 'rolled_back'
export type Verdict =
  | 'verified'
  | 'partially_verified'
  | 'verified_without_visual'
  | 'blocked_by_preexisting_failure'
  | 'failed'

export interface TxRecord {
  id: string
  label: string
  startedAt: string
  /** Missing on records written before transactions had a state: treated as committed. */
  status?: TxStatus
  pid?: number
  /** Declared write set (normalized). Rollback of an open transaction touches only these. */
  allowed?: string[]
  before: Record<string, string>
  /** Hashed but not copied (secrets, oversized): cannot be restored. */
  unsaved?: string[]
  after?: Record<string, string>
  changes?: TxChanges
  verdict?: Verdict
}

export interface RollbackResult {
  restored: TxChanges
  /** Changed since the transaction began but not owned by it, left as they are. */
  untouched: string[]
  /** Owned by the transaction but never copied (secrets, oversized). */
  unrestorable: string[]
}

const txPath = (root: string, id: string) => join(root, TX_DIR, id)
const statusOf = (r: TxRecord): TxStatus => r.status ?? 'committed'
const save = (root: string, r: TxRecord) =>
  writeFileSync(join(txPath(root, r.id), 'tx.json'), JSON.stringify(r, null, 2))

export function loadTransaction(root: string, id: string): TxRecord {
  if (!/^[\w.-]+$/.test(id)) throw new Error(`Invalid transaction id: ${id}`)
  const p = join(txPath(root, id), 'tx.json')
  if (!existsSync(p)) throw new Error(`No edit transaction ${id}`)
  return JSON.parse(readFileSync(p, 'utf-8'))
}

/** Transaction ids, oldest first. `active` drops rolled-back ones. */
export function listTransactions(root: string, opts: { active?: boolean } = {}): string[] {
  const dir = join(root, TX_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(d => existsSync(join(dir, d, 'tx.json')))
    .filter(d => !opts.active || statusOf(loadTransaction(root, d)) !== 'rolled_back')
    .sort()
}

export function openTransaction(root: string): TxRecord | null {
  for (const id of listTransactions(root).reverse()) {
    const r = loadTransaction(root, id)
    if (statusOf(r) === 'open') return r
  }
  return null
}

export function beginTransaction(root: string, label: string, allowed: string[]): TxRecord {
  const open = openTransaction(root)
  if (open)
    throw new Error(
      `Edit ${open.id} is still open (started ${open.startedAt}, pid ${open.pid ?? '?'}). ` +
        `Roll it back with: coherent edit --undo ${open.id}`,
    )
  const write = [...new Set(allowed.map(p => safeRelPath(root, p)))].sort()
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
  const dir = txPath(root, id)
  mkdirSync(join(root, TX_DIR), { recursive: true })
  // Snapshots hold project source; keep them out of the user's commits.
  writeFileSync(join(root, TX_DIR, '.gitignore'), '*\n')
  const before = hashTree(root, write)
  const unsaved: string[] = []
  let total = 0
  for (const f of Object.keys(before)) {
    const src = join(root, f)
    const size = lstatSync(src).size
    if (SECRET.test(f) || size > MAX_FILE) {
      unsaved.push(f)
      continue
    }
    total += size
    if (total > MAX_TOTAL) {
      rmSync(dir, { recursive: true, force: true })
      throw new Error(`Project too large to snapshot (> ${MAX_TOTAL / 1024 / 1024} MB of source files)`)
    }
    const dest = join(dir, 'files', f)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, readFileSync(src))
  }
  const rec: TxRecord = {
    id,
    label,
    startedAt: new Date().toISOString(),
    status: 'open',
    pid: process.pid,
    allowed: write,
    before,
    unsaved,
  }
  save(root, rec)
  return rec
}

/**
 * Add paths to an open transaction's write set. `create` paths are new: rollback
 * deletes them, even if already written. A `modify` path that exists but was
 * not in the snapshot (git-ignored) is snapshotted now, so rollback restores
 * it to this state instead of deleting it.
 */
export function extendTransaction(root: string, id: string, add: { modify: string[]; create: string[] }): TxRecord {
  const rec = loadTransaction(root, id)
  if (statusOf(rec) !== 'open') throw new Error(`Edit ${id} is ${statusOf(rec)}, not open`)
  const fresh = (ps: string[]) => ps.map(p => safeRelPath(root, p)).filter(p => !(rec.allowed ?? []).includes(p))
  const modify = fresh(add.modify)
  const create = fresh(add.create)
  const before = { ...rec.before }
  const unsaved = [...(rec.unsaved ?? [])]
  for (const f of modify) {
    const src = join(root, f)
    if (f in before || !existsSync(src) || !lstatSync(src).isFile()) continue
    before[f] = sha(readFileSync(src))
    if (SECRET.test(f) || lstatSync(src).size > MAX_FILE) unsaved.push(f)
    else {
      const dest = join(txPath(root, id), 'files', f)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, readFileSync(src))
    }
  }
  const next = { ...rec, allowed: [...(rec.allowed ?? []), ...modify, ...create].sort(), before, unsaved }
  save(root, next)
  return next
}

/** A file's text as the transaction's snapshot holds it; null when it was not snapshotted (new, secret, oversized). */
export function snapshotText(root: string, id: string, file: string): string | null {
  const p = join(txPath(root, id), 'files', safeRelPath(root, file))
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

export function diffTrees(before: Record<string, string>, after: Record<string, string>): TxChanges {
  const created = Object.keys(after).filter(f => !(f in before))
  const deleted = Object.keys(before).filter(f => !(f in after))
  const modified = Object.keys(after).filter(f => f in before && before[f] !== after[f])
  return { created: created.sort(), modified: modified.sort(), deleted: deleted.sort() }
}

/** What changed since the transaction began, without closing it. */
export function pendingChanges(root: string, rec: TxRecord): TxChanges {
  return diffTrees(rec.before, hashTree(root, rec.allowed))
}

export function commitTransaction(root: string, rec: TxRecord, verdict?: Verdict): TxRecord {
  const cur = loadTransaction(root, rec.id)
  if (statusOf(cur) !== 'open') throw new Error(`Edit ${rec.id} is ${statusOf(cur)}, not open`)
  const after = hashTree(root, cur.allowed)
  const done: TxRecord = { ...cur, status: 'committed', after, changes: diffTrees(cur.before, after), verdict }
  save(root, done)
  return done
}

function pruneEmptyDirs(root: string, file: string) {
  let d = dirname(join(root, file))
  while (d.startsWith(root + sep) && existsSync(d) && readdirSync(d).length === 0) {
    rmdirSync(d)
    d = dirname(d)
  }
}

/**
 * Restore the files this transaction owns to their `before` state and verify
 * them byte-for-byte. A committed transaction refuses when any of its files
 * changed since (a later edit or a hand edit would be lost) unless forced.
 */
export function rollbackTransaction(root: string, id: string, opts: { force?: boolean } = {}): RollbackResult {
  const rec = loadTransaction(root, id)
  const status = statusOf(rec)
  if (status === 'rolled_back') throw new Error(`Edit ${id} was already rolled back`)
  const now = hashTree(root, rec.allowed)
  const since = diffTrees(rec.before, now)
  const changedNow = [...since.created, ...since.modified, ...since.deleted]

  let owned: Set<string>
  if (status === 'committed' && rec.changes) {
    const c = rec.changes
    owned = new Set([...c.created, ...c.modified, ...c.deleted])
    if (!opts.force && rec.after) {
      const after = rec.after
      const conflicts = [...owned].filter(f => now[f] !== after[f])
      if (conflicts.length)
        throw new Error(
          `${conflicts.length} file(s) of edit ${id} changed after it (${conflicts.slice(0, 5).join(', ')}). ` +
            'Undo newer edits first, or pass --force to discard those changes.',
        )
    }
  } else {
    // Open (crashed or rejected): only the declared write set is ours. A record
    // without one predates write sets; it can only be restored wholesale.
    owned = new Set(rec.allowed ?? changedNow)
  }

  const unsaved = new Set(rec.unsaved ?? [])
  const restored: TxChanges = { created: [], modified: [], deleted: [] }
  const unrestorable: string[] = []
  for (const f of since.created.filter(f => owned.has(f))) {
    rmSync(join(root, f), { force: true })
    pruneEmptyDirs(root, f)
    restored.created.push(f)
  }
  for (const [list, kind] of [
    [since.modified, 'modified'],
    [since.deleted, 'deleted'],
  ] as const) {
    for (const f of list.filter(f => owned.has(f))) {
      if (unsaved.has(f)) {
        unrestorable.push(f)
        continue
      }
      const dest = join(root, f)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, readFileSync(join(txPath(root, id), 'files', f)))
      restored[kind].push(f)
    }
  }
  const check = hashTree(root, rec.allowed)
  const drift = [...owned].filter(f => !unsaved.has(f) && check[f] !== rec.before[f])
  if (drift.length)
    throw new Error(`Rollback of ${id} left ${drift.length} file(s) different: ${drift.slice(0, 5).join(', ')}`)
  save(root, { ...rec, status: 'rolled_back' })
  return { restored, untouched: changedNow.filter(f => !owned.has(f)), unrestorable }
}
