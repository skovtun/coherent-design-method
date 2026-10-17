/**
 * Edit sessions: the host-neutral governance core behind `coherent edit` (CLI,
 * where Coherent's own model writes) and the MCP tools (agent mode, where the
 * host agent writes with its own tools).
 *
 *   beginEdit   declare the write set → impact, baselines (type errors, identity
 *               leaks, "before" renders), open a transaction
 *   (anyone writes the declared files)
 *   verifyEdit  fast: write set + new type errors + new leaks, transaction stays open
 *               final: + production build, renders, pixel diff → verdict; commits
 *               unless failed (a failed edit stays open to repair or roll back)
 *   rollbackEdit
 *
 * Everything a later process needs is persisted next to the transaction
 * (session.json), so a restarted MCP server or CLI picks the session up.
 */
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { buildGraph, type Impact, type ProjectGraph } from './graph.js'
import { scanLeaks, type Leak } from './privacy.js'
import { withImpact, type EditScope } from './router.js'
import {
  beginTransaction,
  commitTransaction,
  extendTransaction,
  hashTree,
  listTransactions,
  loadTransaction,
  openTransaction,
  pendingChanges,
  rollbackTransaction,
  safeRelPath,
  type RollbackResult,
  type TxChanges,
  type Verdict,
} from './transaction.js'
import {
  captureRoutes,
  concreteUrl,
  diffMany,
  loadPreviewParams,
  normalizeBrowserError,
  PreviewBuildError,
  shotsForTree,
  typecheck,
  type Shot,
} from './verify.js'

export const MAX_AFFECTED = 12
export const MAX_CONTROLS = 2

export interface Target {
  route: string
  url: string
  expected: 'change' | 'same'
}

export interface EditSession {
  version: 1
  txId: string
  request: string
  scope: EditScope
  modify: string[]
  create: string[]
  impact: Impact
  targets: Target[]
  /** Affected routes no render covers (dynamic without preview params, past the cap, added by an amend). */
  unverifiedRoutes: string[]
  baselineTypeErrors: string[]
  typecheckSkipped?: string
  leaksBefore: Leak[]
  visual: boolean
  /** Render against this running server instead of an own production build. */
  url?: string
  beforeShots: Shot[]
  visualSkipped?: string
  /** The project failed to build (or typecheck) before the edit. */
  preexistingFailure: boolean
}

export interface VisualResult {
  route: string
  viewport: string
  diff: number
  expected: 'change' | 'same'
  pass: boolean
}

/**
 * Browser errors the edit introduced, per route: after-render errors beyond
 * the count of the same normalized message before the edit.
 */
export function newBrowserErrors(before: Shot[], after: Shot[]): { route: string; viewport: string; error: string }[] {
  const out: { route: string; viewport: string; error: string }[] = []
  for (const a of after) {
    const b = before.find(x => x.route === a.route && x.viewport === a.viewport)
    if (!b) continue
    const left = new Map<string, number>()
    for (const e of b.errors ?? []) left.set(normalizeBrowserError(e), (left.get(normalizeBrowserError(e)) ?? 0) + 1)
    for (const e of a.errors ?? []) {
      const k = normalizeBrowserError(e)
      const n = left.get(k) ?? 0
      if (n > 0) left.set(k, n - 1)
      else out.push({ route: a.route, viewport: a.viewport, error: e.split('\n')[0].slice(0, 300) })
    }
  }
  return out
}

export interface VerifyResult {
  txId: string
  level: 'fast' | 'final'
  status: 'open' | 'committed'
  /** Final level only. */
  verdict?: Verdict
  /** Fast level: no problem found so far. Final level: verdict is not "failed". */
  ok: boolean
  /** Human-readable reasons, written for the agent that has to act on them. */
  problems: string[]
  changes: TxChanges
  outOfPlan: string[]
  typeErrors: string[]
  baselineTypeErrors: number
  typecheckSkipped?: string
  introducedLeaks: Leak[]
  visual?: VisualResult[]
  visualSkipped?: string
  /** Console/page errors (hydration, runtime) that appeared with this edit. */
  newBrowserErrors: { route: string; viewport: string; error: string }[]
  /** Rendered routes that already logged errors before the edit. */
  preexistingBrowserErrors: number
  unverifiedRoutes: string[]
  landed: boolean
  buildError?: string
}

const sessionPath = (root: string, id: string) => join(root, '.coherent', 'tx', id, 'session.json')
const saveSession = (root: string, s: EditSession) =>
  writeFileSync(sessionPath(root, s.txId), JSON.stringify(s, null, 2))

export function loadSession(root: string, id: string): EditSession {
  loadTransaction(root, id) // validates the id
  const p = sessionPath(root, id)
  if (!existsSync(p)) throw new Error(`Edit ${id} has no session (not started with beginEdit)`)
  return JSON.parse(readFileSync(p, 'utf-8'))
}

const errorLeaks = (root: string) => scanLeaks(buildGraph(root)).filter(l => l.identity.severity === 'error')

/**
 * Leaks the edit added: per file and identity, occurrences beyond the count
 * before the edit. Counting (not matching line text) keeps a restyled line
 * that still carries a pre-existing identity from reading as a new leak.
 */
export function introducedLeaksOf(before: Leak[], after: Leak[], touched: Set<string>): Leak[] {
  const key = (l: Leak) => `${l.file}\0${l.identity.value}`
  const had = new Map<string, number>()
  for (const l of before) had.set(key(l), (had.get(key(l)) ?? 0) + 1)
  const out: Leak[] = []
  const seen = new Map<string, number>()
  for (const l of after) {
    if (!touched.has(l.file)) continue
    const n = (seen.get(key(l)) ?? 0) + 1
    seen.set(key(l), n)
    if (n > (had.get(key(l)) ?? 0)) out.push(l)
  }
  return out
}

/** TypeScript errors the edit introduced: positions shift with edits, so compare without them. */
export function newTypeErrors(baseline: string[], after: string[]): string[] {
  const norm = (e: string) => e.replace(/\(\d+,\d+\)/, '').trim()
  const left = new Map<string, number>()
  for (const e of baseline) left.set(norm(e), (left.get(norm(e)) ?? 0) + 1)
  return after.filter(e => {
    const n = left.get(norm(e)) ?? 0
    if (n > 0) {
      left.set(norm(e), n - 1)
      return false
    }
    return true
  })
}

// Planned paths are hashed even when git ignores them, so an edit to one changes the key.
const treeKey = (root: string, extra: string[]) =>
  createHash('sha256')
    .update(JSON.stringify(hashTree(root, extra)))
    .digest('hex')
    .slice(0, 16)

const ownPages = (modify: string[], graph: ProjectGraph) =>
  modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)

/** Routes the edit may change: the transitive impact of modified files plus pages edited directly. */
export function affectedRoutes(modify: string[], impact: Impact, graph: ProjectGraph): string[] {
  return [...new Set([...impact.routes, ...ownPages(modify, graph)])].sort()
}

export function planTargets(
  root: string,
  graph: ProjectGraph,
  scope: EditScope,
  modify: string[],
  impact: Impact,
): { targets: Target[]; unverifiedRoutes: string[] } {
  const affected = affectedRoutes(modify, impact, graph)
  const params = loadPreviewParams(root)
  const pages = Object.values(graph.nodes)
    .filter(n => n.kind === 'page')
    .map(n => n.route!)
  const controls = pages.filter(r => !affected.includes(r) && concreteUrl(r, params)).slice(0, MAX_CONTROLS)
  const edited = ownPages(modify, graph)
  const targets = [
    // A variant is opt-in: only the pages the edit touches may change; every
    // other consumer of the component is a control that must render identically.
    ...affected.map(r => ({
      route: r,
      expected: scope === 'variant' && !edited.includes(r) ? ('same' as const) : ('change' as const),
    })),
    ...controls.map(r => ({ route: r, expected: 'same' as const })),
  ]
    .map(t => ({ ...t, url: concreteUrl(t.route, params) }))
    .filter((t): t is Target => !!t.url)
    .slice(0, MAX_AFFECTED + MAX_CONTROLS)
  return { targets, unverifiedRoutes: affected.filter(r => !targets.some(t => t.route === r)) }
}

function shoot(root: string, s: Pick<EditSession, 'url' | 'modify' | 'create'>, targets: Target[], key: string) {
  return s.url
    ? captureRoutes(s.url, targets, join(root, '.coherent', 'shots', `url-${Date.now()}-${key}`))
    : shotsForTree(root, treeKey(root, [...s.modify, ...s.create]), targets)
}

export interface BeginInput {
  request: string
  scope: EditScope
  modify: string[]
  create: string[]
  /** Rendered checks (default true). */
  visual?: boolean
  url?: string
  /** Add files to an open session instead of starting one. */
  amend?: string
  log?: (msg: string) => void
}

/** Validate a declared write set against the project: modified files exist, created ones do not. */
function checkWriteSet(root: string, modify: string[], create: string[]) {
  const missing = modify.filter(f => !existsSync(join(root, f)))
  if (missing.length) throw new Error(`Files to modify do not exist: ${missing.join(', ')}`)
  const clash = create.filter(f => existsSync(join(root, f)))
  if (clash.length) throw new Error(`Files to create already exist: ${clash.join(', ')}`)
  if (!modify.length && !create.length) throw new Error('Empty write set: declare files to modify or create')
}

export async function beginEdit(rootInput: string, input: BeginInput): Promise<EditSession> {
  const root = resolve(rootInput)
  const log = input.log ?? (() => {})
  const norm = (ps: string[]) => [...new Set(ps.map(p => safeRelPath(root, p)))]
  const graph = buildGraph(root)

  if (input.amend) {
    const s = loadSession(root, input.amend)
    if (loadTransaction(root, s.txId).status !== 'open') throw new Error(`Edit ${s.txId} is not open`)
    const addModify = norm(input.modify).filter(f => !s.modify.includes(f) && !s.create.includes(f))
    const addCreate = norm(input.create).filter(f => !s.create.includes(f) && !s.modify.includes(f))
    // Files the agent may already have written count as existing now; what
    // matters is that they are declared before verification.
    extendTransaction(root, s.txId, { modify: addModify, create: addCreate })
    const modify = [...s.modify, ...addModify]
    const impact = withImpact({ scope: s.scope, modify, create: [], rationale: '' }, graph).impact
    const planned = planTargets(root, graph, s.scope, modify, impact)
    // A route added by the amend has no "before" render; it cannot be verified.
    const shot = new Set(s.beforeShots.map(b => b.route))
    const targets = planned.targets.filter(t => !s.visual || !s.beforeShots.length || shot.has(t.route))
    const next: EditSession = {
      ...s,
      modify,
      create: [...s.create, ...addCreate],
      impact,
      targets,
      unverifiedRoutes: [
        ...new Set([
          ...planned.unverifiedRoutes,
          ...planned.targets.filter(t => !targets.includes(t) && t.expected === 'change').map(t => t.route),
        ]),
      ],
    }
    saveSession(root, next)
    return next
  }

  const modify = norm(input.modify)
  const create = norm(input.create)
  checkWriteSet(root, modify, create)
  const open = openTransaction(root)
  if (open) throw new Error(`Edit ${open.id} is still open; verify, roll it back, or amend it before starting another`)

  const impact = withImpact({ scope: input.scope, modify, create, rationale: '' }, graph).impact
  const { targets, unverifiedRoutes } = planTargets(root, graph, input.scope, modify, impact)
  const baseline = typecheck(root)
  const leaksBefore = errorLeaks(root)

  let visual = input.visual !== false
  let visualSkipped: string | undefined = visual ? undefined : 'disabled'
  let preexistingFailure = !baseline.ok
  let beforeShots: Shot[] = []
  if (visual) {
    try {
      log(`Rendering ${targets.length} route(s) before the edit…`)
      beforeShots = await shoot(root, { url: input.url, modify, create }, targets, 'before')
    } catch (e) {
      // A missing browser or a broken pre-existing build must not block the edit,
      // but the result can then never be reported as fully verified.
      visual = false
      const broken = e instanceof PreviewBuildError
      preexistingFailure ||= broken
      visualSkipped = `${broken ? 'project did not build before the edit' : 'rendered check unavailable'}: ${String((e as Error).message).split('\n')[0]}`
    }
  }

  const tx = beginTransaction(root, input.request, [...modify, ...create])
  const s: EditSession = {
    version: 1,
    txId: tx.id,
    request: input.request,
    scope: input.scope,
    modify,
    create,
    impact,
    targets,
    unverifiedRoutes,
    baselineTypeErrors: baseline.errors,
    typecheckSkipped: baseline.skipped,
    leaksBefore,
    visual,
    url: input.url,
    beforeShots,
    visualSkipped,
    preexistingFailure,
  }
  saveSession(root, s)
  return s
}

/** The open session, or the given one. */
function resolveSession(root: string, id?: string): EditSession {
  if (id) return loadSession(root, id)
  const open = openTransaction(root)
  if (!open) throw new Error('No open edit. Start one with beginEdit / coherent_begin_edit.')
  return loadSession(root, open.id)
}

export async function verifyEdit(
  rootInput: string,
  opts: { txId?: string; level: 'fast' | 'final'; log?: (msg: string) => void },
): Promise<VerifyResult> {
  const root = resolve(rootInput)
  const s = resolveSession(root, opts.txId)
  const tx = loadTransaction(root, s.txId)
  if (tx.status !== 'open') throw new Error(`Edit ${s.txId} is ${tx.status}; nothing to verify`)

  const changes = pendingChanges(root, tx)
  const allowed = new Set([...s.modify, ...s.create])
  const outOfPlan = [...changes.created, ...changes.modified, ...changes.deleted].filter(f => !allowed.has(f))
  const touched = new Set([...changes.created, ...changes.modified])
  const introducedLeaks = introducedLeaksOf(s.leaksBefore, errorLeaks(root), touched)
  const tc = typecheck(root)
  const typeErrors = newTypeErrors(s.baselineTypeErrors, tc.errors)
  const missing = s.create.filter(f => !existsSync(join(root, f)))

  const problems: string[] = []
  if (outOfPlan.length)
    problems.push(
      `Changed outside the declared write set: ${outOfPlan.join(', ')}. Declare them (amend) or revert them.`,
    )
  if (typeErrors.length) problems.push(`New TypeScript errors:\n${typeErrors.slice(0, 20).join('\n')}`)
  for (const l of introducedLeaks)
    problems.push(`Real ${l.identity.kind} written into ${l.file}:${l.line}; use placeholder data.`)
  if (missing.length) problems.push(`Declared new files not created: ${missing.join(', ')}`)
  if (!changes.created.length && !changes.modified.length && !changes.deleted.length)
    problems.push('Nothing changed yet.')

  const base = {
    txId: s.txId,
    changes,
    outOfPlan,
    typeErrors,
    baselineTypeErrors: s.baselineTypeErrors.length,
    typecheckSkipped: tc.skipped,
    introducedLeaks,
    unverifiedRoutes: s.unverifiedRoutes,
    visualSkipped: s.visualSkipped,
  }
  const preexistingBrowserErrors = s.beforeShots.filter(b => (b.errors ?? []).length).length
  if (opts.level === 'fast')
    return {
      ...base,
      level: 'fast',
      status: 'open',
      ok: !problems.length,
      problems,
      landed: true,
      newBrowserErrors: [],
      preexistingBrowserErrors,
    }

  let visual: VisualResult[] | undefined
  let browserErrors: VerifyResult['newBrowserErrors'] = []
  let buildError: string | undefined
  if (s.visual && !typeErrors.length && !outOfPlan.length) {
    try {
      opts.log?.(`Building and rendering ${s.targets.length} route(s)…`)
      const after = await shoot(root, s, s.targets, 'after')
      const pairs = s.beforeShots
        .map(b => [b, after.find(x => x.route === b.route && x.viewport === b.viewport)] as const)
        .filter((p): p is readonly [Shot, Shot] => !!p[1])
      const diffs = await diffMany(pairs.map(([b, a]) => [b.path, a.path]))
      browserErrors = newBrowserErrors(s.beforeShots, after)
      visual = pairs.map(([b], i) => {
        const t = s.targets.find(x => x.route === b.route)!
        return {
          route: b.route,
          viewport: b.viewport,
          diff: diffs[i],
          expected: t.expected,
          pass: t.expected === 'same' ? diffs[i] === 0 : true,
        }
      })
    } catch (e) {
      buildError = String((e as Error).message)
    }
  }
  // Controls must be pixel-identical. "Change" routes are judged together: the
  // edit must visibly land somewhere in its impact set, but a page that imports
  // a component without rendering it under current data may legitimately stay put.
  const expectedChange = (visual ?? []).filter(v => v.expected === 'change')
  const landed = !visual || !expectedChange.length || expectedChange.some(v => v.diff > 0)
  if (buildError) problems.push(`Build/render failed:\n${buildError.split('\n').slice(0, 12).join('\n')}`)
  if (!landed) problems.push('The edit did not visibly change any affected page.')
  for (const e of browserErrors.slice(0, 10))
    problems.push(`New browser error on ${e.route} (${e.viewport}): ${e.error}`)
  for (const v of visual ?? [])
    if (!v.pass)
      problems.push(`${v.route} (${v.viewport}) should render unchanged but ${(v.diff * 100).toFixed(2)}% changed.`)
  const failed =
    !!typeErrors.length ||
    !!outOfPlan.length ||
    !!introducedLeaks.length ||
    !!missing.length ||
    !!buildError ||
    !landed ||
    browserErrors.length > 0 ||
    !(visual ?? []).every(v => v.pass) ||
    (!changes.created.length && !changes.modified.length && !changes.deleted.length)

  // Partial verification is never reported as verified: every affected route
  // must have been rendered, at least one expected to change, on a project
  // that built and typechecked before the edit.
  const verdict: Verdict = failed
    ? 'failed'
    : !visual
      ? s.preexistingFailure
        ? 'blocked_by_preexisting_failure'
        : 'verified_without_visual'
      : s.preexistingFailure ||
          preexistingBrowserErrors > 0 ||
          s.unverifiedRoutes.length > 0 ||
          expectedChange.length === 0
        ? 'partially_verified'
        : 'verified'
  if (verdict !== 'failed') commitTransaction(root, tx, verdict)
  return {
    ...base,
    level: 'final',
    status: verdict === 'failed' ? 'open' : 'committed',
    verdict,
    ok: verdict !== 'failed',
    problems,
    visual,
    newBrowserErrors: browserErrors,
    preexistingBrowserErrors,
    landed,
    buildError,
  }
}

/** Keep a failed edit as is: close its transaction with verdict "failed" (still undoable). */
export function keepFailedEdit(root: string, txId: string) {
  commitTransaction(resolve(root), loadTransaction(resolve(root), txId), 'failed')
}

/** Roll back the given edit, or the open one, or the last one. */
export function rollbackEdit(
  rootInput: string,
  opts: { txId?: string; force?: boolean } = {},
): RollbackResult & { txId: string } {
  const root = resolve(rootInput)
  const id =
    opts.txId ?? openTransaction(root)?.id ?? listTransactions(root, { active: true }).slice(-1)[0] ?? undefined
  if (!id) throw new Error('No edit to roll back')
  return { txId: id, ...rollbackTransaction(root, id, { force: opts.force }) }
}
