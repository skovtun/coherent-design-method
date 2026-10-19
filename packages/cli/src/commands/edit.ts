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
  beginEdit,
  keepFailedEdit,
  rollbackEdit,
  verifyEdit,
  type VerifyResult,
  type VisualResult,
} from '../governance/session.js'
import { safeRelPath, type TxChanges, type Verdict } from '../governance/transaction.js'

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
  visual?: VisualResult[]
  /** Why the rendered check did not run, when it did not. */
  visualSkipped?: string
  /** Affected routes no screenshot covered (dynamic without preview params, or past the cap). */
  unverifiedRoutes: string[]
  /** Identity leaks (real name/email/home path) the edit itself introduced. */
  introducedLeaks: Leak[]
  /** Console/page errors (hydration, runtime) that appeared with this edit. */
  newBrowserErrors: VerifyResult['newBrowserErrors']
  /** False when no affected route rendered any difference: the edit did not visibly land. */
  landed: boolean
  buildError?: string
  /** Hardcoded design values the edit added (advisory). */
  warnings: string[]
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

export async function runEdit(request: string, opts: EditOptions, llm: Completer): Promise<EditReport | null> {
  const root = resolve(opts.dir ?? process.cwd())
  const graph = buildGraph(root)

  const plan = await planEdit(request, graph, llm)
  printPlan(plan, graph)
  if (opts.dryRun) return null
  if (!opts.yes && !(await confirm('Apply? [y/N] '))) return null

  const session = await beginEdit(root, {
    request,
    scope: plan.scope,
    modify: plan.modify,
    create: plan.create,
    visual: opts.visual !== false,
    url: opts.url,
  })
  if (session.visualSkipped && opts.visual !== false) {
    console.log(chalk.yellow(`⚠ Rendered check skipped: ${session.visualSkipped}`))
    console.log(chalk.dim('  Fix: npx playwright install chromium; make sure `next build` passes before editing.'))
  }

  let repaired = false
  let fast: VerifyResult
  try {
    writeFiles(root, parseApplyOutput(await llm(APPLY_SYSTEM, buildApplyPrompt(request, plan, graph)), plan))
    fast = await verifyEdit(root, { txId: session.txId, level: 'fast' })
    if (fast.typeErrors.length) {
      const fix = await llm(
        APPLY_SYSTEM,
        `${buildApplyPrompt(request, plan, buildGraph(root))}\n\n## TypeScript errors after your edit — fix them, same files only\n${fast.typeErrors.slice(0, 30).join('\n')}`,
      )
      writeFiles(root, parseApplyOutput(fix, plan))
      fast = await verifyEdit(root, { txId: session.txId, level: 'fast' })
      repaired = !fast.typeErrors.length
    }
  } catch (e) {
    // Nothing usable was produced: leave the project exactly as it was.
    rollbackEdit(root, { txId: session.txId })
    throw e
  }
  // No point building a project that does not typecheck: fail fast with the fast result.
  const res = fast.typeErrors.length
    ? { ...fast, level: 'final' as const, verdict: 'failed' as const, ok: false }
    : await verifyEdit(root, { txId: session.txId, level: 'final' })

  const verdict = res.verdict!
  const rolledBack = verdict === 'failed' && !opts.keep
  if (verdict === 'failed') {
    if (rolledBack) rollbackEdit(root, { txId: session.txId })
    else keepFailedEdit(root, session.txId)
  }

  const report: EditReport = {
    request,
    plan,
    txId: session.txId,
    changes: res.changes,
    outOfPlan: res.outOfPlan,
    typecheck: {
      ok: !res.typeErrors.length,
      errors: res.typeErrors,
      repaired,
      baselineErrors: res.baselineTypeErrors,
      skipped: res.typecheckSkipped,
    },
    visual: res.visual,
    visualSkipped: res.visualSkipped,
    unverifiedRoutes: res.unverifiedRoutes,
    introducedLeaks: res.introducedLeaks,
    newBrowserErrors: res.newBrowserErrors,
    landed: res.landed,
    buildError: res.buildError,
    warnings: res.warnings ?? [],
    verdict,
    rolledBack,
    ok: verdict === 'verified',
  }
  const runDir = join(root, '.coherent', 'edits', new Date().toISOString().replace(/[:.]/g, '-'))
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
  for (const e of r.newBrowserErrors)
    console.log(chalk.red(`New browser error on ${e.route} (${e.viewport}): ${e.error}`))
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
  if (r.warnings.length) {
    console.log(chalk.yellow(`\nHardcoded values added (${r.warnings.length}), not failing the edit:`))
    for (const w of r.warnings.slice(0, 12)) console.log(chalk.yellow(`  ${w}`))
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
    const res = rollbackEdit(root, {
      txId: opts.undo === true || opts.undo === 'last' ? undefined : String(opts.undo),
      force: opts.force,
    })
    const id = res.txId
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

  const leaks = scanLeaks(buildGraph(root)).filter(l => l.identity.severity === 'error')
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
