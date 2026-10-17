/**
 * coherent edit "<request>" — scoped prompt edits on any Next.js project.
 *
 * Flow: code-derived graph → routed plan → impact preview → transaction →
 * guarded write → typecheck (one repair pass) → rendered check of affected and
 * control routes + leak scan → commit, or roll back a failed edit → report.
 * `coherent edit --undo [id]` restores the edit's files byte-for-byte.
 */
import chalk from 'chalk'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { createInterface } from 'readline'
import { ClaudeClient } from '../utils/claude.js'
import { buildGraph, type ProjectGraph } from '../governance/graph.js'
import { scanLeaks, type Leak } from '../governance/privacy.js'
import {
  APPLY_SYSTEM,
  buildApplyPrompt,
  parseApplyOutput,
  planEdit,
  type Completer,
  type PlanWithImpact,
} from '../governance/router.js'
import {
  beginTransaction,
  commitTransaction,
  hashTree,
  listTransactions,
  pendingChanges,
  rollbackTransaction,
  safeRelPath,
  type TxChanges,
  type Verdict,
} from '../governance/transaction.js'
import {
  captureRoutes,
  concreteUrl,
  diffMany,
  loadPreviewParams,
  PreviewBuildError,
  shotsForTree,
  typecheck,
  type Shot,
} from '../governance/verify.js'
import { createHash } from 'crypto'

export interface EditOptions {
  dir?: string
  yes?: boolean
  dryRun?: boolean
  url?: string
  undo?: string | boolean
  force?: boolean
  visual?: boolean
  /** Keep an edit that failed verification instead of rolling it back. */
  keep?: boolean
}

export interface EditReport {
  request: string
  plan: PlanWithImpact
  txId: string
  changes: TxChanges
  outOfPlan: string[]
  /** `errors` are only the ones the edit introduced; `baselineErrors` were there before. */
  typecheck: { ok: boolean; errors: string[]; repaired: boolean; baselineErrors: number; skipped?: string }
  visual?: { route: string; viewport: string; diff: number; expected: 'change' | 'same'; pass: boolean }[]
  /** Why the rendered check did not run, when it did not. */
  visualSkipped?: string
  /** Affected routes no screenshot covered (dynamic without preview params, or past the cap). */
  unverifiedRoutes: string[]
  /** Identity leaks (real name/email/home path) the edit itself introduced. */
  introducedLeaks: Leak[]
  /** False when no affected route rendered any difference: the edit did not visibly land. */
  landed: boolean
  buildError?: string
  verdict: Verdict
  /** A failed edit is rolled back unless --keep. */
  rolledBack: boolean
  ok: boolean
}

async function confirm(q: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise<string>(r => rl.question(q, r))
  rl.close()
  return /^y(es)?$/i.test(a.trim())
}

function printPlan(plan: PlanWithImpact, graph: ProjectGraph) {
  const total = Object.values(graph.nodes).filter(n => n.kind === 'page').length
  console.log(chalk.bold(`\nScope: ${plan.scope}`) + chalk.dim(`  — ${plan.rationale}`))
  if (plan.modify.length) console.log(`  modify: ${plan.modify.join(', ')}`)
  if (plan.create.length) console.log(`  create: ${plan.create.join(', ')}`)
  const pageEdits = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  const routes = [...new Set([...plan.impact.routes, ...pageEdits])].sort()
  console.log(`  affects ${routes.length}/${total} pages: ${routes.join(', ') || '(none yet — new files only)'}`)
  if (plan.question) console.log(chalk.yellow(`  ? ${plan.question}`))
}

function writeFiles(root: string, files: Record<string, string>) {
  for (const [p, c] of Object.entries(files)) {
    const dest = join(root, safeRelPath(root, p))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, c)
  }
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

export function affectedRoutes(plan: PlanWithImpact, graph: ProjectGraph): string[] {
  const own = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  return [...new Set([...plan.impact.routes, ...own])].sort()
}

const MAX_AFFECTED = 12
const MAX_CONTROLS = 2

export async function runEdit(request: string, opts: EditOptions, llm: Completer): Promise<EditReport | null> {
  const root = resolve(opts.dir ?? process.cwd())
  const graph = buildGraph(root)

  const plan = await planEdit(request, graph, llm)
  printPlan(plan, graph)
  if (opts.dryRun) return null
  if (!opts.yes && !(await confirm('Apply? [y/N] '))) return null

  const affected = affectedRoutes(plan, graph)
  const params = loadPreviewParams(root)
  const pages = Object.values(graph.nodes)
    .filter(n => n.kind === 'page')
    .map(n => n.route!)
  const controls = pages.filter(r => !affected.includes(r) && concreteUrl(r, params)).slice(0, MAX_CONTROLS)
  const variantPages = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  const targets = [
    // A variant is opt-in: only the pages the plan edits may change; every other
    // consumer of the component is a control that must render identically.
    ...affected.map(r => ({
      route: r,
      expected: plan.scope === 'variant' && !variantPages.includes(r) ? ('same' as const) : ('change' as const),
    })),
    ...controls.map(r => ({ route: r, expected: 'same' as const })),
  ]
    .map(t => ({ ...t, url: concreteUrl(t.route, params) }))
    .filter((t): t is { route: string; expected: 'change' | 'same'; url: string } => !!t.url)
    .slice(0, MAX_AFFECTED + MAX_CONTROLS)
  const unverifiedRoutes = affected.filter(r => !targets.some(t => t.route === r))

  let visual = opts.visual !== false
  let visualSkipped: string | undefined = visual ? undefined : 'disabled (--no-visual)'
  let preexistingFailure = false
  const runDir = join(root, '.coherent', 'edits', new Date().toISOString().replace(/[:.]/g, '-'))
  const planned = [...plan.modify, ...plan.create]
  const shoot = (key: string) =>
    opts.url ? captureRoutes(opts.url, targets, join(runDir, key)) : shotsForTree(root, treeKey(root, planned), targets)
  let before: Shot[] = []
  if (visual) {
    try {
      before = await shoot('before')
    } catch (e) {
      // A missing browser or a broken pre-existing build must not block the edit,
      // but the result can then never be reported as fully verified.
      visual = false
      preexistingFailure = e instanceof PreviewBuildError
      visualSkipped = `${preexistingFailure ? 'project did not build before the edit' : 'browser unavailable'}: ${String((e as Error).message).split('\n')[0]}`
      console.log(chalk.yellow(`⚠ Rendered check skipped: ${visualSkipped}`))
      console.log(chalk.dim('  Fix: npx playwright install chromium; make sure `next build` passes before editing.'))
    }
  }

  const leaksBefore = errorLeaks(root)
  // Errors already in the project are not the edit's; only new ones fail it.
  const baseline = typecheck(root)
  const check = () => {
    const r = typecheck(root)
    return { ok: !newTypeErrors(baseline.errors, r.errors).length, errors: newTypeErrors(baseline.errors, r.errors) }
  }
  const tx = beginTransaction(root, request, planned)
  let tc: { ok: boolean; errors: string[] }
  let repaired = false
  try {
    const prompt = buildApplyPrompt(request, plan, graph)
    writeFiles(root, parseApplyOutput(await llm(APPLY_SYSTEM, prompt), plan))
    tc = check()
    if (!tc.ok) {
      const fix = await llm(
        APPLY_SYSTEM,
        `${buildApplyPrompt(request, plan, buildGraph(root))}\n\n## TypeScript errors after your edit — fix them, same files only\n${tc.errors.slice(0, 30).join('\n')}`,
      )
      writeFiles(root, parseApplyOutput(fix, plan))
      tc = check()
      repaired = tc.ok
    }
  } catch (e) {
    // Nothing usable was produced: leave the project exactly as it was.
    rollbackTransaction(root, tx.id)
    throw e
  }
  const changes = pendingChanges(root, tx)
  const allowed = new Set([...plan.modify, ...plan.create])
  const outOfPlan = [...changes.created, ...changes.modified, ...changes.deleted].filter(f => !allowed.has(f))
  const touched = new Set([...changes.created, ...changes.modified])
  const introducedLeaks = introducedLeaksOf(leaksBefore, errorLeaks(root), touched)

  let visualRes: EditReport['visual']
  let buildError: string | undefined
  if (visual && tc.ok) {
    try {
      const after = await shoot('after')
      const pairs = before.map(b => {
        const a = after.find(x => x.route === b.route && x.viewport === b.viewport)!
        return [b.path, a.path] as [string, string]
      })
      const diffs = await diffMany(pairs)
      visualRes = before.map((b, i) => {
        const t = targets.find(x => x.route === b.route)!
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
  const expectedChange = (visualRes ?? []).filter(v => v.expected === 'change')
  const landed = !visualRes || !expectedChange.length || expectedChange.some(v => v.diff > 0)
  const failed =
    !tc.ok ||
    !!buildError ||
    outOfPlan.length > 0 ||
    introducedLeaks.length > 0 ||
    !landed ||
    !(visualRes ?? []).every(v => v.pass)
  // Partial verification is never reported as verified: every affected route
  // must have been rendered, at least one expected to change, on a project
  // that typechecked before the edit.
  const preexisting = preexistingFailure || !baseline.ok
  const verdict: Verdict = failed
    ? 'failed'
    : !visualRes
      ? preexisting
        ? 'blocked_by_preexisting_failure'
        : 'verified_without_visual'
      : preexisting || unverifiedRoutes.length > 0 || expectedChange.length === 0
        ? 'partially_verified'
        : 'verified'

  const rolledBack = verdict === 'failed' && !opts.keep
  if (rolledBack) rollbackTransaction(root, tx.id)
  else commitTransaction(root, tx, verdict)

  const report: EditReport = {
    request,
    plan,
    txId: tx.id,
    changes,
    outOfPlan,
    typecheck: { ...tc, repaired, baselineErrors: baseline.errors.length, skipped: baseline.skipped },
    visual: visualRes,
    visualSkipped,
    unverifiedRoutes,
    introducedLeaks,
    landed,
    buildError,
    verdict,
    rolledBack,
    ok: verdict === 'verified',
  }
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  return report
}

function printReport(r: EditReport) {
  const c = r.changes
  console.log(
    `\nChanged: ${[...c.modified.map(f => `~ ${f}`), ...c.created.map(f => `+ ${f}`), ...c.deleted.map(f => `- ${f}`)].join('\n         ')}`,
  )
  console.log(
    r.outOfPlan.length
      ? chalk.red(`Out-of-plan changes: ${r.outOfPlan.join(', ')}`)
      : chalk.green('Write set: only planned files'),
  )
  console.log(
    r.typecheck.ok
      ? chalk.green(`TypeScript: clean${r.typecheck.repaired ? ' (after 1 repair pass)' : ''}`)
      : chalk.red(
          `TypeScript: ${r.typecheck.errors.length} error(s)\n  ${r.typecheck.errors.slice(0, 5).join('\n  ')}`,
        ),
  )
  for (const l of r.introducedLeaks)
    console.log(chalk.red(`Identity leak introduced: ${l.file}:${l.line} ${l.identity.kind} — ${l.excerpt}`))
  if (r.typecheck.skipped) console.log(chalk.yellow(`TypeScript check skipped: ${r.typecheck.skipped}`))
  if (r.typecheck.baselineErrors)
    console.log(
      chalk.yellow(`TypeScript: ${r.typecheck.baselineErrors} error(s) already in the project before this edit`),
    )
  if (r.buildError) console.log(chalk.red(`Build: ${r.buildError.split('\n').slice(0, 8).join('\n  ')}`))
  if (r.visualSkipped) console.log(chalk.yellow(`Rendered check not run: ${r.visualSkipped}`))
  if (r.visual && !r.landed) console.log(chalk.red('Edit did not visibly change any affected page'))
  for (const v of r.visual ?? []) {
    const mark = !v.pass ? chalk.red('✗') : v.expected === 'change' && v.diff === 0 ? chalk.dim('·') : chalk.green('✓')
    console.log(
      `  ${mark} ${v.route} ${v.viewport}: ${(v.diff * 100).toFixed(2)}% pixels changed (expected ${v.expected})`,
    )
  }
  if (r.unverifiedRoutes.length)
    console.log(
      chalk.yellow(
        `  Not rendered (no preview params or over the cap): ${r.unverifiedRoutes.join(', ')}` +
          (r.unverifiedRoutes.some(x => x.includes('['))
            ? chalk.dim('\n  Map dynamic routes in .coherent/preview-params.json, e.g. {"/items/[id]": "/items/1"}')
            : ''),
      ),
    )
  const label: Record<Verdict, string> = {
    verified: chalk.green('VERIFIED'),
    partially_verified: chalk.yellow('APPLIED — PARTIALLY VERIFIED (see unrendered routes / pre-existing errors)'),
    verified_without_visual: chalk.yellow('APPLIED — NOT VISUALLY VERIFIED'),
    blocked_by_preexisting_failure: chalk.yellow(
      'APPLIED — VERIFICATION BLOCKED (project did not build before the edit)',
    ),
    failed: chalk.red('FAILED'),
  }
  console.log(
    `\n${label[r.verdict]} — ` +
      (r.rolledBack
        ? 'rolled back, project unchanged (re-run with --keep to inspect a failed edit)'
        : `undo with: coherent edit --undo ${r.txId}`),
  )
}

export async function editCommand(request: string | undefined, opts: EditOptions) {
  const root = resolve(opts.dir ?? process.cwd())
  if (opts.undo) {
    const ids = listTransactions(root, { active: true })
    const id = opts.undo === true || opts.undo === 'last' ? ids[ids.length - 1] : String(opts.undo)
    if (!id) throw new Error('No edit transactions to undo')
    const res = rollbackTransaction(root, id, { force: opts.force })
    const r = res.restored
    console.log(
      chalk.green(
        `Restored ${id}: ${r.modified.length} modified, ${r.created.length} created removed, ${r.deleted.length} deleted restored. Restored files verified byte-identical.`,
      ),
    )
    if (res.untouched.length)
      console.log(chalk.dim(`Left as they are (not part of this edit): ${res.untouched.slice(0, 8).join(', ')}`))
    if (res.unrestorable.length)
      console.log(chalk.red(`Could not restore (never snapshotted: secrets/oversized): ${res.unrestorable.join(', ')}`))
    return
  }
  if (!request) throw new Error('Usage: coherent edit "<what to change>"')

  const leaks = errorLeaks(root)
  if (leaks.length) {
    console.log(chalk.yellow(`⚠ ${leaks.length} existing identity leak(s) in source (real name/email/home path):`))
    for (const l of leaks.slice(0, 5))
      console.log(chalk.yellow(`  ${l.file}:${l.line} ${l.identity.kind} — ${l.excerpt}`))
  }
  const client = ClaudeClient.create()
  const report = await runEdit(request, opts, (s, u) => client.complete(s, u))
  if (report) {
    printReport(report)
    // Scripts and agents must not read a failed (rolled-back) edit as applied.
    if (report.verdict === 'failed') process.exitCode = 1
  }
}
