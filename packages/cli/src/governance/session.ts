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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import {
  buildDesignSystem,
  DS_MARKER,
  DS_ROUTE,
  DS_SYNC_REQUEST,
  freeIds,
  isPreviewFile,
  managedPage,
  planSync,
  resolveTarget,
  type ResolvedTarget,
} from './design-system.js'
import { DS_VOLATILE, dsFiles, renderDesignSystemFiles, type SiteContext } from './design-system-site.js'
import { buildGraph, type Impact, type ProjectGraph } from './graph.js'
import { scanLeaks, type Leak } from './privacy.js'
import { addedRawValues, rawValues, rawValueWarning } from './raw-values.js'
import { TAILWIND_CONFIG, withImpact, type EditScope } from './router.js'
import {
  beginTransaction,
  commitTransaction,
  diffTrees,
  extendTransaction,
  hashTree,
  listTransactions,
  loadTransaction,
  openTransaction,
  pendingChanges,
  rollbackTransaction,
  safeRelPath,
  snapshotText,
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
  startPreview,
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
  /** The addressed component or token (`CID-007`, `--radius`): an amend is held to the same scope. */
  target?: string
  /** Coherent's own edit (ID sync): may write the viewer and ID comments. */
  internal?: boolean
  /** A refactor: every affected page must render exactly as before. */
  refactor?: boolean
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
  /** Hardcoded design values this edit adds (file:line value — hint). Advisory: the verdict ignores them. */
  warnings: string[]
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
  refactor = false,
): { targets: Target[]; unverifiedRoutes: string[] } {
  // The generated design-system page changes with every component edit: never a target or a control.
  const affected = affectedRoutes(modify, impact, graph).filter(r => r !== DS_ROUTE)
  const params = loadPreviewParams(root)
  const pages = Object.values(graph.nodes)
    .filter(n => n.kind === 'page' && n.route !== DS_ROUTE)
    .map(n => n.route!)
  const controls = pages.filter(r => !affected.includes(r) && concreteUrl(r, params)).slice(0, MAX_CONTROLS)
  const edited = ownPages(modify, graph)
  const targets = [
    // A variant is opt-in: only the pages the edit touches may change; every
    // other consumer of the component is a control that must render identically.
    ...affected.map(r => ({
      route: r,
      // A design-system sync only adds ID comments: every page must render exactly as before.
      expected:
        refactor || scope === 'design-system' || (scope === 'variant' && !edited.includes(r))
          ? ('same' as const)
          : ('change' as const),
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
  /** Address of the thing to change: `CID-007`, `@KpiCard`, `--radius`. Resolved to its file; the scope is checked against it. */
  target?: string
  /** Coherent's own design-system sync (writes ID comments); not available to agents. */
  internal?: boolean
  /**
   * A change that must not show (extracting components, replacing literals with
   * equal tokens): every affected page is compared pixel by pixel and must not change.
   */
  refactor?: boolean
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

/**
 * Scope ↔ file-kind rules that need no judgment: a page edit leaves components
 * and tokens alone, a token edit touches only stylesheets, and an addressed
 * component edit touches only that component.
 */
export function checkScope(
  graph: ProjectGraph,
  scope: EditScope,
  modify: string[],
  target?: ResolvedTarget,
  create: string[] = [],
) {
  const kind = (f: string) => graph.nodes[f]?.kind
  // An addressed target gets the precise message first.
  if (target?.type === 'token' && scope !== 'tokens')
    throw new Error(`${target.token.name} is a token: use scope "tokens".`)
  if (target?.type === 'component') {
    const c = target.component
    const label = `${c.id ?? c.name} (${c.file})`
    if (scope !== 'component' && scope !== 'variant')
      throw new Error(`${label} is a component: use scope "component" (everywhere) or "variant" (only some pages).`)
    if (!modify.includes(c.file)) throw new Error(`The edit of ${label} must modify ${c.file}.`)
    const others = modify.filter(f => f !== c.file)
    if (scope === 'component' && others.length)
      throw new Error(`An edit of ${label} changes only ${c.file}; ${others.join(', ')} need their own edit.`)
    const nonPages = others.filter(f => kind(f) !== 'page' && kind(f) !== 'layout')
    if (scope === 'variant' && nonPages.length)
      throw new Error(`A variant of ${label} may also change only the pages that opt in; not ${nonPages.join(', ')}.`)
  }
  const shared = modify.filter(f => ['component', 'ui', 'style'].includes(kind(f) ?? ''))
  if (scope === 'page' && shared.length)
    throw new Error(
      `A page edit cannot change components or tokens (${shared.join(', ')}). Use scope "component" to change one everywhere, or "variant" to change it only on some pages.`,
    )
  // New files are judged by what they are: a token edit may add a stylesheet, nothing else.
  // (A page edit may create new components: that is component-first, not restyling a shared one.)
  // Tailwind v3 keeps its theme scale in tailwind.config: part of the tokens.
  const isTheme = (f: string) => kind(f) === 'style' || TAILWIND_CONFIG.test(f)
  const notStyle = [...modify.filter(f => !isTheme(f)), ...create.filter(f => !/\.(css|scss)$/.test(f))]
  if (scope === 'tokens' && notStyle.length)
    throw new Error(
      `A token edit changes only stylesheets and the Tailwind config; ${notStyle.join(', ')} need their own edit.`,
    )
}

/** Icon libraries the viewer recognises; the first is the default the agent uses. */
const ICON_LIBRARIES: { pkg: string; label: string }[] = [
  { pkg: 'lucide-react', label: 'Lucide' },
  { pkg: '@tabler/icons-react', label: 'Tabler' },
  { pkg: '@heroicons/react', label: 'Heroicons' },
  { pkg: '@phosphor-icons/react', label: 'Phosphor' },
  { pkg: '@radix-ui/react-icons', label: 'Radix' },
  { pkg: '@remixicon/react', label: 'Remix' },
  { pkg: 'react-icons', label: 'React Icons' },
]
const NAMED_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g

type ActivityEntry = SiteContext['edits'][number]

function siteContext(root: string, graph: ProjectGraph, exclude?: string, current?: ActivityEntry): SiteContext {
  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  } catch {
    // no package.json: defaults below
  }
  // `displayName` (as in VS Code extensions) names the app when the package name is a slug.
  const rawName = String(pkg.displayName ?? pkg.name ?? '')
  const appName = rawName
    ? rawName
        .replace(/^@[^/]+\//, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    : 'App'
  const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, string>
  const edits: ActivityEntry[] = listTransactions(root, { active: true })
    .filter(id => id !== exclude)
    .map(id => loadTransaction(root, id))
    .filter(t => t.status !== 'open')
    .reverse()
    .map(t => ({
      label: t.label,
      verdict: t.verdict ?? null,
      at: t.startedAt,
      files: [...(t.changes?.modified ?? []), ...(t.changes?.created ?? [])],
    }))
  if (current) edits.unshift(current)
  const viewer = `${graph.appDir}/design-system/`
  for (const e of edits) e.files = (e.files ?? []).filter(f => !f.startsWith(viewer))
  const icons = new Map<string, { name: string; module: string; library: string; files: Set<string> }>()
  for (const n of Object.values(graph.nodes)) {
    if (!/\.(tsx|jsx|ts)$/.test(n.id)) continue
    const text = readFileSync(join(root, n.id), 'utf-8')
    for (const m of text.matchAll(NAMED_IMPORT)) {
      const module = m[2]
      const lib = ICON_LIBRARIES.find(l => module === l.pkg || module.startsWith(l.pkg + '/'))
      if (!lib) continue
      for (const spec of m[1].split(',')) {
        const raw = spec
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim()
        // Types and the generic Icon are not icons.
        if (
          !/^[A-Z]\w*$/.test(raw) ||
          ['LucideIcon', 'LucideProps', 'Icon', 'IconNode', 'IconProps', 'IconType', 'IconContext'].includes(raw) ||
          raw.endsWith('Props')
        )
          continue
        // Lucide exports each icon as Name, NameIcon and LucideName: one icon.
        const name = lib.pkg === 'lucide-react' ? raw.replace(/^Lucide(?=[A-Z])/, '').replace(/(?<=.)Icon$/, '') : raw
        const at = lib.pkg === 'lucide-react' ? lib.pkg : module
        const key = at + ':' + name
        const entry = icons.get(key) ?? { name, module: at, library: lib.label, files: new Set<string>() }
        entry.files.add(n.id)
        icons.set(key, entry)
      }
    }
  }
  return {
    appName,
    version: String(pkg.version ?? '0.0.0'),
    edits,
    pages: Object.values(graph.nodes)
      .filter(n => n.kind === 'page')
      .map(n => n.route!)
      .sort(),
    icons: [...icons.values()]
      .map(i => ({ ...i, files: [...i.files].sort() }))
      .sort((x, y) => x.name.localeCompare(y.name) || x.module.localeCompare(y.module)),
    iconLibraries: ICON_LIBRARIES.filter(l => deps[l.pkg]).map(l => l.label),
    rawValues: Object.values(graph.nodes)
      .filter(n => /\.(tsx|jsx)$/.test(n.id) && !isPreviewFile(n.id))
      .flatMap(n => rawValues(n.id, readFileSync(join(root, n.id), 'utf-8')).map(v => ({ file: n.id, ...v })))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    hasIcons: 'lucide-react' in deps,
  }
}

const renderSite = (root: string, graph: ProjectGraph, exclude?: string, current?: ActivityEntry) =>
  renderDesignSystemFiles(buildDesignSystem(graph), graph.appDir, siteContext(root, graph, exclude, current))

/**
 * Put the edit being committed into the viewer's activity (recent changes,
 * heatmap, component history) right before the commit, with its verdict, so
 * the viewer is never one edit behind. Only the data file changes; the pages
 * that read it were built and verified with the edit.
 */
function stampActivity(root: string, s: EditSession, entry: ActivityEntry) {
  const graph = buildGraph(root)
  const file = `${graph.appDir}/design-system/${DS_VOLATILE}`
  if (![...s.modify, ...s.create].includes(file) || !managedPage(root, graph.appDir)) return
  const text = renderSite(root, graph, s.txId, entry).get(file)
  if (text !== undefined) writeFileSync(join(root, file), text)
}

/** Generated viewer files no longer produced (an older viewer's pages): removed inside the edit. */
function obsoleteDsFiles(root: string, appDir: string): string[] {
  const dir = join(root, appDir, 'design-system')
  if (!existsSync(dir)) return []
  const keep = new Set(dsFiles(appDir))
  const out: string[] = []
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`
      if (e.isDirectory()) walk(join(d, e.name), r)
      else if (!keep.has(r) && readFileSync(join(d, e.name), 'utf-8').slice(0, 300).includes(DS_MARKER)) out.push(r)
    }
  }
  walk(dir, `${appDir}/design-system`)
  return out.sort()
}

/**
 * Once the app has a design system, the generated viewer joins every edit, so
 * it is rebuilt, verified and undone with it. Missing files (an older, smaller
 * viewer) are created.
 */
function withDesignSystemFiles(
  root: string,
  graph: ProjectGraph,
  modify: string[],
  create: string[],
): { modify: string[]; create: string[] } {
  // Once the app has a design system, every edit carries the viewer: components
  // and tokens show their new state, and every edit lands in its activity.
  if (!managedPage(root, graph.appDir)) return { modify, create }
  const files = [...dsFiles(graph.appDir), ...obsoleteDsFiles(root, graph.appDir)].filter(
    f => !modify.includes(f) && !create.includes(f),
  )
  return {
    modify: [...modify, ...files.filter(f => existsSync(join(root, f)))],
    create: [...create, ...files.filter(f => !existsSync(join(root, f)))],
  }
}

/** Rewrite the declared viewer files from the code as it is now (inside the open edit, before any build). */
function refreshDesignSystemFiles(root: string, s: Pick<EditSession, 'modify' | 'create' | 'txId'>) {
  const declared = new Set([...s.modify, ...s.create])
  const graph = buildGraph(root)
  const page = dsFiles(graph.appDir)[0]
  if (!declared.has(page)) return
  if (existsSync(join(root, page)) && !managedPage(root, graph.appDir)) return
  for (const [file, text] of renderSite(root, graph, s.txId)) {
    if (!declared.has(file)) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  for (const file of obsoleteDsFiles(root, graph.appDir)) {
    if (!declared.has(file)) continue
    rmSync(join(root, file))
    // Leave no empty route folder behind.
    const dir = dirname(join(root, file))
    if (!readdirSync(dir).length) rmSync(dir, { recursive: true })
  }
}

/** Components in the touched files that carry no ID, or share one, once the project has a design system. */
function idProblems(root: string, touched: string[]): string[] {
  const graph = buildGraph(root)
  const ds = buildDesignSystem(graph)
  if (!ds.page && !ds.components.some(c => c.id)) return []
  const out: string[] = []
  const touchedSet = new Set(touched)
  const missing = ds.components.filter(c => !c.id && touchedSet.has(c.file))
  if (missing.length) {
    const ids = freeIds(ds, missing.length)
    out.push(
      `Components without an ID: ${missing.map((c, i) => `${c.name} in ${c.file} → add \`/** @coherent-id ${ids[i]} */\` above its declaration`).join('; ')}.`,
    )
  }
  for (const d of ds.duplicates.filter(d => d.components.some(c => touched.some(f => c.endsWith(`(${f})`)))))
    out.push(
      `${d.id} is on several components (${d.components.join(', ')}); give the new one the next free ID ${ds.nextId}.`,
    )
  return out
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
    // An amend is held to the rules the edit began with: same scope, same target.
    // A "create" of a file that existed before the edit is a modification.
    const existed = loadTransaction(root, s.txId).before
    const changed = [...s.modify, ...addModify, ...addCreate.filter(f => f in existed)]
    if (s.scope === 'design-system' && !s.internal) {
      const other = [...addModify, ...addCreate].filter(f => !isPreviewFile(f))
      if (other.length)
        throw new Error(
          `A design-system edit only writes component previews (<name>.preview.tsx); ${other.join(', ')} need their own edit.`,
        )
    }
    if (s.scope !== 'design-system') {
      const viewer = `${graph.appDir}/design-system/`
      const target = s.target ? resolveTarget(buildDesignSystem(graph), s.target) : undefined
      checkScope(
        graph,
        s.scope,
        changed.filter(f => !f.startsWith(viewer)),
        target,
        [...s.create, ...addCreate].filter(f => !f.startsWith(viewer) && !changed.includes(f)),
      )
    }
    // Files the agent may already have written count as existing now; what
    // matters is that they are declared before verification.
    extendTransaction(root, s.txId, { modify: addModify, create: addCreate })
    const modify = [...s.modify, ...addModify]
    const impact = withImpact({ scope: s.scope, modify, create: [], rationale: '' }, graph).impact
    const planned = planTargets(root, graph, s.scope, modify, impact, s.refactor)
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

  let modify = norm(input.modify)
  const create = norm(input.create)
  const target = input.target ? resolveTarget(buildDesignSystem(graph), input.target) : undefined
  if (target && !modify.length) modify = [target.type === 'component' ? target.component.file : target.token.file]
  checkWriteSet(root, modify, create)
  if (input.scope === 'design-system' && !input.internal) {
    // The agent's design-system edits: component previews only.
    const other = [...modify, ...create].filter(f => !isPreviewFile(f))
    if (other.length)
      throw new Error(
        `A design-system edit only writes component previews (<name>.preview.tsx); ${other.join(', ')} need their own edit.`,
      )
  }
  if (input.scope !== 'design-system') checkScope(graph, input.scope, modify, target, create)
  if (!input.internal) {
    const withDs = withDesignSystemFiles(root, graph, modify, create)
    modify = withDs.modify
    create.push(...withDs.create.filter(f => !create.includes(f)))
  }
  const open = openTransaction(root)
  if (open) throw new Error(`Edit ${open.id} is still open; verify, roll it back, or amend it before starting another`)

  const impact = withImpact({ scope: input.scope, modify, create, rationale: '' }, graph).impact
  const { targets, unverifiedRoutes } = planTargets(root, graph, input.scope, modify, impact, input.refactor)
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
    ...(input.target ? { target: input.target } : {}),
    ...(input.internal ? { internal: true } : {}),
    ...(input.refactor ? { refactor: true } : {}),
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

  refreshDesignSystemFiles(root, s)
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
  // The viewer refreshes inside every edit; it is not a change the agent made.
  const viewerDir = `${buildGraph(root).appDir}/design-system/`
  // (A design-system edit is about the viewer and previews: there, the viewer is the change.)
  const own = [...changes.created, ...changes.modified, ...changes.deleted].filter(
    f => s.scope === 'design-system' || !f.startsWith(viewerDir),
  )
  if (!own.length) problems.push('Nothing changed yet.')
  // Hardcoded values this edit adds: warnings, never a failed verdict (ADR-0013 slice 2).
  const warnings = [...touched]
    .filter(f => !f.startsWith(viewerDir) && /\.(tsx|jsx)$/.test(f))
    .flatMap(f => {
      const before = snapshotText(root, s.txId, f)
      return addedRawValues(
        before === null ? [] : rawValues(f, before),
        rawValues(f, readFileSync(join(root, f), 'utf-8')),
      ).map(v => rawValueWarning(f, v))
    })
  const designSystemProblems = idProblems(root, [...touched])
  problems.push(...designSystemProblems)

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
    warnings,
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
  } else if (
    !s.visual &&
    !s.url &&
    s.visualSkipped !== 'disabled' &&
    !s.preexistingFailure &&
    // Without Next installed there is nothing to build with: an environment gap, not the edit.
    existsSync(join(root, 'node_modules', '.bin', 'next')) &&
    !typeErrors.length &&
    !outOfPlan.length
  ) {
    // Renders were unavailable (no browser, a page that never settles), but the
    // production build is still a check: a broken build must not pass.
    try {
      opts.log?.('Building (renders unavailable)…')
      await (await startPreview(root)).stop()
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
    designSystemProblems.length > 0 ||
    !(visual ?? []).every(v => v.pass) ||
    !own.length

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
          (expectedChange.length === 0 && s.scope !== 'design-system' && !s.refactor)
        ? 'partially_verified'
        : 'verified'
  // The committed record is the truth: it includes the activity file stamped just before the commit.
  let committed = changes
  if (verdict !== 'failed') {
    stampActivity(root, s, {
      label: tx.label,
      verdict,
      at: tx.startedAt,
      files: [...changes.modified, ...changes.created],
    })
    committed = commitTransaction(root, tx, verdict).changes ?? pendingChanges(root, tx)
  }
  return {
    ...base,
    changes: committed,
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

/**
 * Files changed since the last committed edit without going through Coherent
 * (another agent without the write guard, an IDE, a script). The portable
 * counterpart of the Claude-only hook: it works whoever made the change.
 * Null when no edit has been committed yet (no trusted reference state).
 */
export function changedOutsideCoherent(rootInput: string): { since: string; files: string[] } | null {
  const root = resolve(rootInput)
  if (openTransaction(root)) return null // an edit is in progress; its own diff covers this
  const ids = listTransactions(root, { active: true })
  for (const id of ids.reverse()) {
    const tx = loadTransaction(root, id)
    if (tx.status === 'committed' && tx.after) {
      const now = hashTree(root, tx.allowed)
      const d = diffTrees(tx.after, now)
      return { since: id, files: [...d.created, ...d.modified, ...d.deleted] }
    }
  }
  return null
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

export interface DsSyncResult {
  /** Null when IDs and the viewer are already current. */
  session: EditSession | null
  assigned: { id: string; name: string; file: string }[]
  page: string
  /** Shared components and blocks with no preview yet: the agent writes `<name>.preview.tsx` for them. */
  withoutPreview: { id: string | null; name: string; file: string }[]
}

/**
 * Give every component an ID and (re)write the /design-system viewer, as a
 * normal edit: Coherent declares and writes the files, the caller verifies.
 * Every page must render exactly as before (only comments are added).
 */
export async function dsSync(rootInput: string, opts: { log?: (msg: string) => void } = {}): Promise<DsSyncResult> {
  const root = resolve(rootInput)
  const graph = buildGraph(root)
  const plan = planSync(graph)
  const files = dsFiles(graph.appDir)
  const pending = () =>
    buildDesignSystem(buildGraph(root))
      .components.filter(c => c.kind !== 'ui' && !c.preview)
      .map(c => ({ id: c.id ?? null, name: c.name, file: c.file }))
  const obsolete = obsoleteDsFiles(root, graph.appDir)
  if (!plan.annotations.size && plan.pageExists && !obsolete.length) {
    const fresh = renderSite(root, graph)
    // The activity file changes with every edit; it alone never makes the viewer stale.
    const current = files.every(
      f =>
        f.endsWith(`/${DS_VOLATILE}`) ||
        (existsSync(join(root, f)) && readFileSync(join(root, f), 'utf-8') === fresh.get(f)),
    )
    if (current) return { session: null, assigned: [], page: plan.page, withoutPreview: pending() }
  }
  const s = await beginEdit(root, {
    request: `${DS_SYNC_REQUEST}: component IDs and the /design-system viewer`,
    scope: 'design-system',
    internal: true,
    modify: [...plan.annotations.keys(), ...files.filter(f => existsSync(join(root, f))), ...obsolete],
    create: files.filter(f => !existsSync(join(root, f))),
    log: opts.log,
  })
  for (const [file, text] of plan.annotations) writeFileSync(join(root, file), text)
  refreshDesignSystemFiles(root, s)
  return { session: s, assigned: plan.assigned, page: plan.page, withoutPreview: pending() }
}
